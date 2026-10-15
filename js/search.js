window.LEX = (() => {
  let entries = [];
  let byHw = new Map();
  let searchables = [];

  const MATCH_LABEL = {
    exact: "مطابقة تامة", prefix: "يبدأ بـ", contains: "يحتوي", initials: "الحروف الأولى",
    pinyin: "بالبينيين", toned: "بالنغمات", ar: "بالعربية", root: "بالجذر", wildcard: "بحث بالرموز", sub: "كلمة مشتقة", col: "تركيب شائع"
  };

  const keyOf = (s, py) => s + "|" + PY.numbered(py);

  function build(enabledPacks) {
    const core = window.CORE_ENTRIES.map((e) => ({ ...e, pack: "core", senses: e.senses.map((s) => ({ ...s })) }));
    byHw = new Map();
    const byKey = new Map();
    entries = [];
    for (const e of core) { entries.push(e); byKey.set(keyOf(e.s, e.py), e); }

    for (const p of window.PACK_ENTRIES) {
      if (!enabledPacks.includes(p.pack)) continue;
      const host = byKey.get(keyOf(p.s, p.py));
      if (host && p.mergeInto) {
        host.senses = host.senses.concat(p.senses.map((s) => ({ ...s, fromPack: p.pack })));
        host.packsMerged = (host.packsMerged || []).concat(p.pack);
        continue;
      }
      const e = { ...p };
      entries.push(e);
      byKey.set(keyOf(e.s, e.py), e);
    }

    for (const e of entries) {
      e.t = e.t || e.s;
      e._plain = PY.plain(e.py); e._plainU = PY.plainU(e.py);
      e._num = PY.numbered(e.py); e._init = PY.initials(e.py);
      e._toned = e.py.toLowerCase().replace(/\s/g, "");
      e._ar = [];
      e.senses.forEach((s, si) => (s.eqs || []).forEach((q) => {
        const n = AR.norm(q.ar);
        e._ar.push({ si, norm: n, words: n.split(" ").flatMap(AR.variants), root: q.root ? AR.norm(q.root) : null });
      }));
      if (!byHw.has(e.s)) byHw.set(e.s, e);
      if (!byHw.has(e.t)) byHw.set(e.t, e);
    }

    searchables = entries.map((e) => ({ kind: "entry", e }));
    for (const e of entries) {
      for (const [s, py, ar] of e.subs || []) {
        if (byHw.has(s) || !py) continue;
        searchables.push({
          kind: "sub", parent: e, s, py, ar,
          _plain: PY.plain(py), _num: PY.numbered(py), _init: PY.initials(py), _toned: py.toLowerCase().replace(/\s/g, ""),
          _ar: [{ norm: AR.norm(ar), words: AR.norm(ar).split(" ").flatMap(AR.variants) }]
        });
      }
      e.senses.forEach((sense) => (sense.col || []).forEach(([s, py, ar]) => {
        if (byHw.has(s) || (e.subs || []).some(([x]) => x === s)) return;
        const n = AR.norm(ar);
        searchables.push({
          kind: "col", parent: e, s, py, ar,
          _plain: PY.plain(py), _num: PY.numbered(py), _init: PY.initials(py), _toned: py.toLowerCase().replace(/\s/g, ""),
          _ar: [{ norm: n, words: n.split(" ").flatMap(AR.variants) }]
        });
      }));
    }
  }

  function wildcardRe(q) {
    const esc = q.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp("^" + esc + "$", "i");
  }

  function scoreItem(it, q, mode, ctx) {
    const s = it.kind === "entry" ? it.e.s : it.s;
    const t = it.kind === "entry" ? it.e.t : it.s;
    const d = it.kind === "entry" ? it.e : it;
    switch (mode) {
      case "hanzi":
        if (s === q || t === q) return [100, "exact"];
        if (s.startsWith(q) || t.startsWith(q)) return [80, "prefix"];
        if (s.includes(q) || t.includes(q)) return [60, "contains"];
        return null;
      case "wildcard":
        if (ctx.re.test(d._plain) || ctx.re.test(s)) return [70, "wildcard"];
        return null;
      case "toned": {
        const qq = q.toLowerCase().replace(/[\s']/g, "");
        if (d._toned === qq) return [100, "toned"];
        if (d._toned.startsWith(qq)) return [75, "toned"];
        return null;
      }
      case "numbered": {
        const qq = q.toLowerCase().replace(/[\s']/g, "").replace(/ü/g, "v");
        if (d._num === qq) return [100, "toned"];
        if (d._num.startsWith(qq)) return [75, "toned"];
        return null;
      }
      case "latin": {
        const qq = q.toLowerCase().replace(/[\s']/g, "").replace(/ü/g, "v");
        const pu = d._plainU || d._plain.replace(/v/g, "u");
        if (d._plain === qq || pu === qq) return [95, "pinyin"];
        if (qq.length >= 2 && d._init === qq) return [88, "initials"];
        if (d._plain.startsWith(qq) || pu.startsWith(qq)) return [70, "pinyin"];
        return null;
      }
      case "root": {
        const hit = (d._ar || []).some((a) => a.root === ctx.root);
        return hit ? [90, "root"] : null;
      }
      case "arabic": {
        let best = null;
        for (const a of d._ar || []) {
          let sc = 0;
          if (a.norm === ctx.norm) sc = 100;
          else if (ctx.multi && a.norm.includes(ctx.norm)) sc = 70;
          else if (!ctx.multi && ctx.vars.some((v) => a.words.includes(v))) sc = 85;
          else if (!ctx.multi && ctx.norm.length >= 3 && a.words.some((w) => w.startsWith(ctx.norm))) sc = 60;
          if (sc && (!best || sc > best[0])) best = [sc, "ar"];
        }
        return best;
      }
    }
    return null;
  }

  function search(raw) {
    const q = raw.trim();
    if (!q) return [];
    let mode, ctx = {};
    if (/[*?]/.test(q) && !/[\u0600-\u06FF]/.test(q)) { mode = "wildcard"; ctx.re = wildcardRe(q.replace(/\s/g, "")); }
    else if (/[\u3400-\u9fff]/.test(q)) mode = "hanzi";
    else if (AR.isArabic(q)) {
      const root = AR.parseRoot(q);
      if (root) { mode = "root"; ctx.root = root; }
      else { mode = "arabic"; ctx.norm = AR.norm(q); ctx.multi = ctx.norm.includes(" "); ctx.vars = AR.variants(ctx.norm); }
    }
    else if (PY.hasToneMarks(q)) mode = "toned";
    else if (/[1-5]/.test(q)) mode = "numbered";
    else mode = "latin";

    const out = [];
    for (const it of searchables) {
      const r = scoreItem(it, q, mode, ctx);
      if (!r) continue;
      let [score, kind] = r;
      if (it.kind === "sub") score -= 5;
      if (it.kind === "col") score -= 8;
      const e = it.kind === "entry" ? it.e : null;
      if (e && e.pack !== "core") score -= 2;
      const match = it.kind === "entry" ? kind : it.kind;
      out.push({ ...it, score, match, matchLabel: MATCH_LABEL[match] });
    }
    const len = (x) => (x.kind === "entry" ? x.e.s : x.s).length;
    const hsk = (x) => (x.kind === "entry" && x.e.hsk) || 99;
    out.sort((a, b) => b.score - a.score || hsk(a) - hsk(b) || len(a) - len(b));
    return { mode, items: out.slice(0, 60) };
  }

  return { build, search, get: (hw) => byHw.get(hw), byId: (id) => entries.find((e) => e.id === id), all: () => entries };
})();
