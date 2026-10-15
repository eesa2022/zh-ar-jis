(() => {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const DEFAULT_SETTINGS = { packs: ["core", "diplo", "ai", "halal", "energy"], tashkeel: true, pyStyle: "marks", toneColors: true, eastDigits: true };
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const state = {
    settings: { ...DEFAULT_SETTINGS, ...load("zhar.settings", {}) },
    vault: load("zhar.vault", { projects: ["عام"], current: "عام", items: [] }),
    history: load("zhar.history", []),
    view: "search", query: "", domainFilter: null,
    entry: null, entryTab: "senses", highlightSub: null
  };

  // ---------- 渲染工具 ----------
  const num = (n) => (state.settings.eastDigits ? AR.toEastDigits(n) : String(n));
  const arText = (s) => esc(state.settings.tashkeel ? s : AR.stripHarakat(s));
  const rich = (s) => arText(s).replace(/[\u3400-\u9fff][\u3400-\u9fff“”（）《》，、]*/g, (m) => `<bdi class="zh" dir="ltr" lang="zh-CN">${m}</bdi>`);
  const zh = (s, cls = "") => `<bdi class="zh ${cls}" dir="ltr" lang="zh-CN">${esc(s)}</bdi>`;

  function pinyinHtml(py, { sepv = false, cls = "" } = {}) {
    if (!py) return "";
    const parts = PY.displaySyllables(py, state.settings.pyStyle);
    const joined = PY.joinWord(parts, sepv);
    const inner = joined.map((p) => (p.sep !== undefined ? esc(p.sep) : `<span class="${state.settings.toneColors ? "t" + p.tone : ""}">${esc(p.text)}</span>`)).join("");
    return `<bdi class="py ${cls}" dir="ltr">${inner}</bdi>`;
  }

  function hanziColored(s, py) {
    const syl = PY.syllables(py);
    const chars = [...s];
    if (!state.settings.toneColors || syl.length !== chars.length) return chars.map((c) => `<span class="hz" data-char="${esc(c)}">${esc(c)}</span>`).join("");
    return chars.map((c, i) => `<span class="hz t${PY.tone(syl[i])}" data-char="${esc(c)}">${esc(c)}</span>`).join("");
  }

  const tagChip = (t) => { const l = LABELS.tags[t]; return l ? `<span class="chip tag" title="${esc(l[0])}">${esc(l[1])}</span>` : ""; };
  const posChip = (p) => { const l = LABELS.pos[p]; return l ? `<span class="chip pos">${esc(l[1])} <bdi class="zh" dir="ltr">${esc(l[0])}</bdi></span>` : ""; };
  const packName = (id) => (window.PACKS.find((p) => p.id === id) || {}).ar || id;
  const firstGloss = (e) => (e.senses.flatMap((s) => s.eqs || []).slice(0, 3).map((q) => q.ar).join("، "));

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1600);
  }

  function speak(text, lang = "zh-CN") {
    if (!("speechSynthesis" in window)) return toast("النطق الصوتي غير مدعوم في هذا المتصفح");
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = lang.startsWith("zh") ? 0.8 : 1;
    const v = speechSynthesis.getVoices().find((x) => x.lang.replace("_", "-").startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }

  // ---------- 搜索页 ----------
  const SAMPLES = [["安全", "汉字"], ["anquan", "بينيين"], ["aq", "الحروف الأولى"], ["abbd", "成语"], ["an1quan2", "بالأرقام"], ["an*", "رمز *"],
    ["سلامة", "عربي"], ["السلامه", "بلا تشكيل"], ["س ل م", "جذر"], ["خالة", "عربي"], ["ذكاء", "حزمة AI"], ["صكوك", "حزمة التمويل"]];

  const dayIndex = (n) => Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 864e5) % n;

  function openSearchTips() {
    $("#sheet-body").innerHTML = `
      <h3 class="sheet-title">طرق البحث</h3>
      <p class="hint">مربع واحد يفهم كل الطرق، دون الحاجة إلى تبديل اللغة.</p>
      <div class="samples">${SAMPLES.map(([s, l]) => `<button class="sample" data-q="${esc(s)}"><span class="sq" dir="auto">${esc(s)}</span><small>${esc(l)}</small></button>`).join("")}</div>`;
    $("#sheet").classList.add("open");
  }

  function renderHome() {
    const all = LEX.all();
    const pool = all.filter((e) => e.senses.some((s) => (s.ex || []).length) && e.s.length > 1);
    const w = pool[dayIndex(pool.length)];
    const wEx = w.senses.flatMap((s) => s.ex || [])[0];
    const traps = all.filter((e) => e.contrast);
    const trap = traps[(dayIndex(traps.length) + 3) % traps.length];
    const v = state.vault;

    const intro = state.settings.introDone ? "" : `
      <div class="intro">
        <div><b>أهلًا بك في «جسر»</b><p>اكتب بالصينية أو بالبينيين أو بالعربية، والمعجم يتعرّف على طريقتك تلقائيًا.</p></div>
        <div class="intro-btns"><button class="btn small" data-action="tips">كيف أبحث؟</button><button class="link small" data-action="intro-done">فهمت</button></div>
      </div>`;

    const recent = state.history.length ? `
      <section class="home-sec">
        <div class="sec-head"><h3>تابع من حيث توقفت</h3><button class="link small" data-action="clear-history">مسح</button></div>
        <div class="hscroll">${state.history.map((h) => `<button class="recent" data-open="${esc(h.id)}">${zh(h.s, "rz")}${pinyinHtml(h.py)}</button>`).join("")}</div>
      </section>` : "";

    return `<div class="home">
      ${intro}
      <section class="wod" data-open="${esc(w.id)}">
        <div class="wod-label">كلمة اليوم</div>
        <div class="wod-main">
          <div class="wod-hz zh" dir="ltr">${hanziColored(w.s, w.py).replace(/ data-char="[^"]*"/g, "")}</div>
          <div class="wod-side">${pinyinHtml(w.py, { sepv: w.sepv })}<div class="wod-gloss">${arText(firstGloss(w))}</div></div>
          <button class="icon wod-say" data-say="${esc(w.s)}" title="استمع">🔊</button>
        </div>
        ${wEx ? `<div class="wod-ex"><div class="zh" dir="ltr">${esc(wEx.zh.replace(/[|*]/g, ""))}</div><div>${arText(wEx.ar[0][1])}</div></div>` : ""}
      </section>

      ${recent}

      <section class="trap" data-open="${esc(trap.id)}">
        <div class="trap-label">⚠ فخّ ترجمة</div>
        <p>${rich(trap.contrast)}</p>
        <span class="go">← افتح مدخل ${zh(trap.s)}</span>
      </section>

      <div class="tiles">
        <button class="tile" data-nav="vault"><span class="tile-ic">★</span><b>مجلداتي</b><small>${num(v.items.length)} مصطلح · ${num(v.projects.length)} مشروع</small></button>
        <button class="tile" data-nav="guide"><span class="tile-ic">ā</span><b>دليل النطق</b><small>النغمات وأخطاء العرب الشائعة</small></button>
        <button class="tile" data-nav="settings"><span class="tile-ic">▦</span><b>حزم المعجم</b><small>${num(state.settings.packs.length - 1)} حزم توسعة مفعّلة</small></button>
        <button class="tile" data-action="tips"><span class="tile-ic">⌕</span><b>طرق البحث</b><small>حروف · بينيين · عربي · جذر</small></button>
      </div>

      <div class="notice small">${esc(LABELS.mustReview)}: محتوى هذا النموذج من إعداد الذكاء الاصطناعي ويحتاج إلى مراجعة محرر.</div>
    </div>`;
  }

  function renderSearch() {
    const q = state.query.trim();
    if (!q) return renderHome();
    const res = LEX.search(q);
    let items = res.items || [];
    const domains = [...new Set(items.flatMap((it) => (it.kind === "entry" ? it.e : it.parent).domains || []))];
    if (state.domainFilter) items = items.filter((it) => ((it.kind === "entry" ? it.e : it.parent).domains || []).includes(state.domainFilter));
    if (!items.length) return `<div class="empty">لا نتائج لـ «<span dir="auto">${esc(q)}</span>» في النموذج التجريبي.</div>`;
    const filters = domains.length ? `<div class="filters"><button class="chip ${state.domainFilter ? "" : "on"}" data-domain="">الكل</button>${domains.map((d) => `<button class="chip ${state.domainFilter === d ? "on" : ""}" data-domain="${d}">${esc(LABELS.tags[d]?.[1] || d)}</button>`).join("")}</div>` : "";
    return filters + `<ul class="results">${items.map(resultRow).join("")}</ul>`;
  }

  function resultRow(it) {
    if (it.kind === "sub" || it.kind === "col") {
      const attr = it.kind === "sub" ? `data-sub="${esc(it.s)}"` : `data-col="1"`;
      const where = it.kind === "sub" ? "من عائلة" : "تركيب في مدخل";
      return `<li class="row" ${attr} data-parent="${esc(it.parent.id)}">
        <div class="row-head">${zh(it.s, "big")} ${pinyinHtml(it.py)}</div>
        <div class="row-gloss">${arText(it.ar)}</div>
        <div class="row-meta"><span class="chip match">${esc(it.matchLabel)}</span><span class="chip sub">${where} ${zh(it.parent.s)}</span></div></li>`;
    }
    const e = it.e;
    return `<li class="row" data-open="${esc(e.id)}">
      <div class="row-head">${zh(e.s, "big")}${e.t !== e.s ? zh(e.t, "trad") : ""} ${pinyinHtml(e.py, { sepv: e.sepv })}</div>
      <div class="row-gloss">${arText(firstGloss(e))}</div>
      <div class="row-meta"><span class="chip match">${esc(it.matchLabel)}</span>${(e.pos || []).map(posChip).join("")}${e.pack !== "core" ? `<span class="chip pack">${esc(packName(e.pack))}</span>` : ""}${(e.packsMerged || []).map((p) => `<span class="chip pack">+ ${esc(packName(p))}</span>`).join("")}</div></li>`;
  }

  // ---------- 词条页 ----------
  const TABS = [["senses", "المعاني والتراكيب"], ["family", "العائلة والمشتقات"], ["examples", "الأمثلة"], ["notes", "الثقافة والفروق"]];

  function renderEntry() {
    const e = state.entry;
    const starred = state.vault.items.some((x) => x.id === e.id);
    const meta = [
      (e.pos || []).map(posChip).join(""),
      e.hsk ? `<span class="chip hsk" title="قيمة تقديرية">HSK ${num(e.hsk)}</span>` : "",
      e.pack !== "core" ? `<span class="chip pack">${esc(packName(e.pack))}</span>` : "",
      (e.domains || []).map(tagChip).join("")
    ].join("");
    const mw = e.mw?.length ? `<div class="mw"><b>المِمْيَز (量词):</b> ${e.mw.map(([h, p]) => `<button class="mw-pill" data-look="${esc(h)}">${zh(h)} ${pinyinHtml(p)}</button>`).join("")}</div>` : "";
    const sep = e.sepv ? `<div class="sep"><b>فعل منفصل (离合词):</b> ${zh(e.sep)}</div>` : "";
    const review = e.review ? `<div class="notice warn">${esc(e.review)}</div>` : "";

    const exCount = e.senses.reduce((n, s) => n + (s.ex || []).length, 0);
    const famCount = (e.subs || []).length + [...e.s].length;
    const hasNotes = e.culture || e.contrast || e.tip || e.xref;
    const counts = { senses: e.senses.length, family: famCount, examples: exCount, notes: hasNotes ? "•" : 0 };

    return `
      <div class="entry">
        <div class="entry-top">
          <button class="icon back" data-action="back" aria-label="رجوع">→</button>
          <div class="entry-actions">
            <button class="icon" data-action="speak" title="استمع">🔊</button>
            <button class="icon ${starred ? "on" : ""}" data-action="star" title="أضف إلى مجلد المصطلحات">${starred ? "★" : "☆"}</button>
          </div>
        </div>
        <div class="headword" dir="ltr">
          <div class="hw-chars zh" lang="zh-CN">${hanziColored(e.s, e.py)}</div>
          ${e.t !== e.s ? `<div class="hw-trad zh">${esc(e.t)} <small>繁</small></div>` : ""}
          <div class="hw-py">${pinyinHtml(e.py, { sepv: e.sepv })}</div>
        </div>
        <p class="hint">اضغط على أي حرف لعرض ترتيب الضربات والتدرّب على كتابته</p>
        <div class="meta">${meta}</div>
        ${mw}${sep}${review}
        <nav class="tabs">${TABS.map(([k, l]) => `<button class="tab ${state.entryTab === k ? "on" : ""}" data-tab="${k}">${l}${counts[k] ? ` <span class="cnt">${typeof counts[k] === "number" ? num(counts[k]) : counts[k]}</span>` : ""}</button>`).join("")}</nav>
        <div class="tab-body">${{ senses: tabSenses, family: tabFamily, examples: tabExamples, notes: tabNotes }[state.entryTab](e)}</div>
        <div class="notice small">${esc(LABELS.mustReview)}</div>
      </div>`;
  }

  function eqPill(q) {
    const t = LABELS.eqType[q.type];
    const badge = t ? `<span class="badge b-${q.type}" title="${esc(t[1])}">${esc(t[0])} ${esc(t[1])}</span>` : "";
    const extra = [
      q.gov ? `<span class="gov" title="حرف الجر الذي يتعدى به">يتعدى بـ «${esc(q.gov)}»</span>` : "",
      q.root ? `<button class="root" data-q="${esc(AR.spacedRoot(q.root))}" title="ابحث بالجذر">جذر: ${esc(AR.spacedRoot(q.root))}</button>` : "",
      q.plural ? `<span class="plural">ج ${arText(q.plural)}</span>` : "",
      q.region ? `<span class="region">${esc(q.region)}</span>` : ""
    ].join("");
    return `<div class="pill">
      <button class="pill-main" data-copy="${esc(AR.stripHarakat(q.ar))}" title="اضغط للنسخ">${arText(q.ar)}</button>
      ${badge}${extra}
      ${q.note ? `<div class="pill-note">${rich(q.note)}</div>` : ""}
    </div>`;
  }

  function tabSenses(e) {
    return e.senses.map((s, i) => `
      <section class="sense ${s.fromPack ? "from-pack" : ""}">
        <div class="sense-head">
          <span class="sn">${num(i + 1)}</span>
          ${s.pos ? posChip(s.pos) : ""}${(s.tags || []).map(tagChip).join("")}
          ${s.fromPack ? `<span class="chip pack">${esc(packName(s.fromPack))}</span>` : ""}
        </div>
        <div class="def">${esc(s.def)}</div>
        <div class="def-zh">${zh(s.zh)}</div>
        <div class="pills">${(s.eqs || []).map(eqPill).join("")}</div>
        ${s.col?.length ? `<div class="colloc"><h4>تراكيب شائعة</h4>${s.col.map(([z, p, a]) => `<div class="col-row"><button class="link" data-look="${esc(z)}">${zh(z)}</button> ${pinyinHtml(p)} <span class="col-ar">${arText(a)}</span></div>`).join("")}</div>` : ""}
        ${s.ex?.length ? `<div class="ex-mini">${s.ex.map(exampleHtml).join("")}</div>` : ""}
      </section>`).join("");
  }

  function exampleHtml(x) {
    const zt = x.zh.split("|"), pt = (x.py || "").split("|");
    const hw = state.entry.s;
    const toks = zt.map((w, i) => {
      const forced = w.startsWith("*"); const word = forced ? w.slice(1) : w;
      const punct = /^[，。！？、；：“”‘’（）《》\s.,!?]+$/.test(word);
      if (punct) return `<span class="tok punct">${esc(word)}</span>`;
      const hl = forced || word.includes(hw) ? " hl" : "";
      return `<button class="tok${hl}" data-tok="${esc(word)}" data-py="${esc(pt[i] || "")}"><ruby>${esc(word)}<rt>${esc(pt[i] || "")}</rt></ruby></button>`;
    }).join("");
    const plain = zt.map((w) => w.replace(/^\*/, "")).join("");
    return `<div class="example">
      <div class="ex-zh" dir="ltr" lang="zh-CN">${toks}<button class="icon tiny" data-say="${esc(plain)}" title="استمع">🔊</button></div>
      ${(x.ar || []).map(([st, t]) => `<div class="ex-ar"><span class="style">${esc(st)}</span>${arText(t)}</div>`).join("")}
      <div class="prov">مثال مولَّد بالذكاء الاصطناعي · غير مراجَع</div>
    </div>`;
  }

  function tabExamples(e) {
    const all = e.senses.flatMap((s, i) => (s.ex || []).map((x) => ({ x, i })));
    if (!all.length) return `<div class="empty">لا أمثلة بعد.</div>`;
    return `<p class="hint">اضغط على أي كلمة صينية لعرض معناها دون مغادرة الصفحة</p>` +
      all.map(({ x, i }) => `<div class="ex-wrap"><span class="sn small">${num(i + 1)}</span>${exampleHtml(x)}</div>`).join("");
  }

  function tabFamily(e) {
    const chars = [...e.s].map((c) => {
      const ce = LEX.get(c);
      return `<button class="char-card" data-char="${esc(c)}"><span class="zh big">${esc(c)}</span>${ce && ce.s !== e.s ? `<small>${arText(firstGloss(ce).split("، ")[0])}</small>` : `<small>ترتيب الضربات</small>`}</button>`;
    }).join("");
    const subs = (e.subs || []).map(([s, py, ar]) => {
      const exists = LEX.get(s);
      const hl = state.highlightSub === s ? " hl" : "";
      return `<button class="sub-card${hl}${exists ? " linked" : ""}" ${exists ? `data-open="${esc(exists.id)}"` : `data-look="${esc(s)}"`}>
        ${zh(s, "big")}${py ? pinyinHtml(py) : ""}<span class="sub-ar">${arText(ar)}</span>${exists ? `<span class="go">← فتح المدخل</span>` : ""}</button>`;
    }).join("");
    return `<h4>الحروف المكوّنة</h4><div class="chars">${chars}</div>` +
      (subs ? `<h4>كلمات مشتقة ومركبة (◊)</h4><div class="subs">${subs}</div>` : "");
  }

  function tabNotes(e) {
    const blocks = [];
    if (e.xref) blocks.push(`<div class="note"><h4>إحالات</h4>${e.xref.map((x) => `<div class="xref"><span class="chip">${esc(x.label === "另见" ? "انظر أيضًا" : "راجع")}</span> <button class="link" data-look="${esc(x.s)}">${zh(x.s)}</button> <bdi class="py" dir="ltr">${esc(x.py)}</bdi> <span>${rich(x.note || "")}</span></div>`).join("")}</div>`);
    if (e.contrast) blocks.push(`<div class="note contrast"><h4>فروق دقيقة وفخاخ الترجمة</h4><p>${rich(e.contrast)}</p></div>`);
    if (e.culture) blocks.push(`<div class="note culture"><h4>الخلفية الثقافية</h4><p>${rich(e.culture)}</p></div>`);
    if (e.tip) blocks.push(`<div class="note tip"><h4>نصيحة لمتعلم عربي</h4><p>${rich(e.tip)}</p></div>`);
    return blocks.join("") || `<div class="empty">لا ملاحظات.</div>`;
  }

  // ---------- 底部速查卡 ----------
  function openSheet(word, py) {
    const e = LEX.get(word);
    let html;
    if (e) {
      html = `<div class="sheet-head">${zh(e.s, "big")} ${pinyinHtml(e.py, { sepv: e.sepv })}<button class="icon" data-say="${esc(e.s)}">🔊</button></div>
        <div class="sheet-gloss">${arText(firstGloss(e))}</div>
        <button class="btn" data-open="${esc(e.id)}">فتح المدخل كاملًا</button>`;
    } else {
      const parent = LEX.all().find((x) => (x.subs || []).some(([s]) => s === word));
      const sub = parent && parent.subs.find(([s]) => s === word);
      html = `<div class="sheet-head">${zh(word, "big")} ${py ? `<bdi class="py" dir="ltr">${esc(py)}</bdi>` : ""}<button class="icon" data-say="${esc(word)}">🔊</button></div>
        ${sub ? `<div class="sheet-gloss">${arText(sub[2])}</div><button class="btn" data-open="${esc(parent.id)}" data-sub-hl="${esc(word)}">عرضها في عائلة ${esc(parent.s)}</button>`
              : `<div class="sheet-gloss muted">هذه الكلمة غير موجودة في النموذج التجريبي (في النسخة الكاملة يُعرض معناها هنا).</div>`}`;
    }
    $("#sheet-body").innerHTML = html;
    $("#sheet").classList.add("open");
  }
  const closeSheet = () => $("#sheet").classList.remove("open");

  // ---------- 笔顺 ----------
  let writer = null;
  function openStroke(ch) {
    $("#stroke-title").innerHTML = zh(ch, "big");
    const box = $("#stroke-box"); box.innerHTML = "";
    $("#stroke").classList.add("open");
    if (!window.HanziWriter) { box.innerHTML = `<p class="muted">تعذّر تحميل بيانات ترتيب الضربات (يتطلب اتصالًا بالإنترنت).</p>`; return; }
    writer = HanziWriter.create(box, ch, {
      width: 240, height: 240, padding: 12, showOutline: true, strokeAnimationSpeed: 1, delayBetweenStrokes: 250,
      strokeColor: "#1f3a5f", radicalColor: "#b5462f", outlineColor: "#e6e0d4",
      charDataLoader: (c, ok, fail) => fetch(`vendor/strokes/${encodeURIComponent(c)}.json`)
        .then((r) => (r.ok ? r : fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${encodeURIComponent(c)}.json`)))
        .then((r) => r.json()).then(ok).catch(fail),
      onLoadCharDataError: () => { box.innerHTML = `<p class="muted">لا تتوفر بيانات لهذا الحرف.</p>`; }
    });
    writer.animateCharacter();
  }

  // ---------- 术语夹 ----------
  function toggleStar(e) {
    const v = state.vault;
    const i = v.items.findIndex((x) => x.id === e.id);
    if (i >= 0) { v.items.splice(i, 1); toast("أُزيل من المجلد"); }
    else { v.items.push({ id: e.id, s: e.s, py: e.py, project: v.current, at: Date.now() }); toast(`أُضيف إلى مجلد «${v.current}»`); }
    save("zhar.vault", v);
  }

  function renderVault() {
    const v = state.vault;
    const items = v.items.filter((x) => x.project === v.current);
    return `<div class="vault">
      <h2>مجلد المصطلحات</h2>
      <p class="hint">نظّم المصطلحات حسب مشاريع الترجمة، ثم صدّرها إلى ملف CSV أو إلى Anki.</p>
      <div class="projects">${v.projects.map((p) => `<button class="chip ${p === v.current ? "on" : ""}" data-project="${esc(p)}">${esc(p)} <span class="cnt">${num(v.items.filter((x) => x.project === p).length)}</span></button>`).join("")}
        <button class="chip add" data-action="new-project">+ مشروع جديد</button></div>
      ${items.length ? `<ul class="results">${items.map((x) => { const e = LEX.byId(x.id); return e ? resultRow({ kind: "entry", e, matchLabel: "محفوظ" }) : ""; }).join("")}</ul>` : `<div class="empty">المجلد فارغ. اضغط ☆ في أي مدخل لإضافته.</div>`}
      <div class="row-btns"><button class="btn" data-action="export-csv">تصدير CSV</button><button class="btn ghost" data-action="export-anki">تصدير Anki</button></div>
    </div>`;
  }

  function exportVault(kind) {
    const v = state.vault;
    const rows = v.items.filter((x) => x.project === v.current).map((x) => LEX.byId(x.id)).filter(Boolean);
    if (!rows.length) return toast("لا يوجد ما يُصدَّر");
    const clean = (s) => String(s).replace(/[\t\n"]/g, " ");
    let text, name, type;
    if (kind === "csv") {
      text = "\ufeff" + ["hanzi,traditional,pinyin,arabic,project"].concat(rows.map((e) => [e.s, e.t, e.py, AR.stripHarakat(firstGloss(e)), v.current].map((c) => `"${clean(c)}"`).join(","))).join("\n");
      name = `terms_${v.current}.csv`; type = "text/csv";
    } else {
      text = rows.map((e) => `${clean(e.s)}<br>${clean(e.py)}\t${clean(firstGloss(e))}`).join("\n");
      name = `anki_${v.current}.txt`; type = "text/plain";
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" }));
    a.download = name; a.click();
    toast("تم التصدير");
  }

  // ---------- 拼音指南 ----------
  function renderGuide() {
    const g = window.PINYIN_GUIDE;
    return `<div class="guide">
      <h2>دليل البينيين للناطقين بالعربية</h2>
      <p class="hint">البينيين يستعمل حروفًا لاتينية، لكن قيمها الصوتية تختلف عمّا يتوقعه القارئ العربي. هذه أكثر المواضع التي يخطئ فيها المتعلم العربي.</p>
      <h3 class="sec">النغمات الأربع</h3>
      <div class="tones">${g.tones.map(([t, py, hz, d]) => `<button class="tone-card t${t}" data-say="${esc(hz)}"><span class="zh big">${esc(hz)}</span><bdi class="py" dir="ltr">${esc(py)}</bdi><small>${t === 5 ? "خفيفة" : "النغمة " + num(t)}</small><p>${esc(d)}</p></button>`).join("")}</div>
      <h3 class="sec">الحروف الساكنة</h3>
      <table class="gtable"><thead><tr><th>البينيين</th><th>تقريب</th><th>الوصف</th><th>احذر</th></tr></thead>
      <tbody>${g.initials.map(([p, a, d, w]) => `<tr class="${w ? "warn" : ""}"><td><bdi class="py" dir="ltr">${esc(p)}</bdi></td><td>${esc(a)}</td><td>${esc(d)}</td><td>${esc(w)}</td></tr>`).join("")}</tbody></table>
      <h3 class="sec">الحركات والمقاطع</h3>
      <table class="gtable"><tbody>${g.finals.map(([p, d, w]) => `<tr><td><bdi class="py" dir="ltr">${esc(p)}</bdi></td><td>${esc(d)}</td><td>${esc(w)}</td></tr>`).join("")}</tbody></table>
    </div>`;
  }

  // ---------- 设置 ----------
  function renderSettings() {
    const s = state.settings;
    const sw = (k, label, hint = "") => `<label class="set"><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ""}</span><input type="checkbox" data-set="${k}" ${s[k] ? "checked" : ""}></label>`;
    return `<div class="settings">
      <h2>الإعدادات</h2>
      <h3 class="sec">حزم المعجم</h3>
      ${window.PACKS.map((p) => `<label class="set"><span><b>${esc(p.ar)}</b><small>${esc(p.zh)}${p.locked ? " · مدمجة دائمًا" : " · حزمة توسعة"}</small></span><input type="checkbox" data-pack="${p.id}" ${s.packs.includes(p.id) ? "checked" : ""} ${p.locked ? "disabled" : ""}></label>`).join("")}
      <h3 class="sec">العرض</h3>
      ${sw("tashkeel", "إظهار التشكيل", "الحركات على الكلمات العربية")}
      ${sw("toneColors", "تلوين النغمات", "لون مختلف لكل نغمة في الحروف والبينيين")}
      ${sw("eastDigits", "الأرقام المشرقية", "١٢٣ بدلًا من 123 في الترقيم")}
      <label class="set"><span><b>شكل البينيين</b><small>ān quán أو an1 quan2</small></span>
        <select data-set="pyStyle"><option value="marks" ${s.pyStyle === "marks" ? "selected" : ""}>علامات النغمات</option><option value="numbers" ${s.pyStyle === "numbers" ? "selected" : ""}>أرقام</option></select></label>
      <div class="legend">${[1, 2, 3, 4, 5].map((t) => `<span class="t${t}">● ${t === 5 ? "خفيفة" : "النغمة " + num(t)}</span>`).join("")}</div>
    </div>`;
  }

  // ---------- 主渲染与事件 ----------
  function render() {
    const main = $("#main");
    document.body.dataset.view = state.view;
    $("#searchbar").style.display = state.view === "search" || state.view === "entry" ? "" : "none";
    main.innerHTML = { search: renderSearch, entry: renderEntry, vault: renderVault, guide: renderGuide, settings: renderSettings }[state.view]();
    document.querySelectorAll(".nav button").forEach((b) => b.classList.toggle("on", b.dataset.nav === (state.view === "entry" ? "search" : state.view)));
  }

  function openEntry(id, opts = {}) {
    const e = LEX.byId(id); if (!e) return;
    state.entry = e; state.view = "entry";
    state.entryTab = opts.tab || "senses"; state.highlightSub = opts.highlight || null;
    state.history = [{ id: e.id, s: e.s, py: e.py }].concat(state.history.filter((h) => h.id !== e.id)).slice(0, 10);
    save("zhar.history", state.history);
    closeSheet(); render(); $("#main").scrollTop = 0;
  }

  function setQuery(q) { closeSheet(); state.query = q; state.domainFilter = null; $("#q").value = q; state.view = "search"; render(); }

  function rebuild() { LEX.build(state.settings.packs); }

  document.addEventListener("click", async (ev) => {
    const t = ev.target.closest("button, li.row, [data-char], [data-open]");
    if (!t) return;
    const d = t.dataset;
    if (d.nav) { state.view = d.nav; render(); return; }
    if (d.q !== undefined && !d.copy) { setQuery(d.q); return; }
    if (d.subHl) { openEntry(d.open, { tab: "family", highlight: d.subHl }); return; }
    if (d.open) { openEntry(d.open); return; }
    if (d.sub) { openEntry(d.parent, { tab: "family", highlight: d.sub }); return; }
    if (d.col) { openEntry(d.parent); return; }
    if (d.domain !== undefined) { state.domainFilter = d.domain || null; render(); return; }
    if (d.tab) { state.entryTab = d.tab; render(); return; }
    if (d.tok) { openSheet(d.tok, d.py); return; }
    if (d.look) { const e = LEX.get(d.look); e ? openEntry(e.id) : openSheet(d.look); return; }
    if (d.say) { speak(d.say); return; }
    if (d.char) { openStroke(d.char); return; }
    if (d.hwChar) { HW.pick(d.hwChar); return; }
    if (d.camChar) { CAM.pick(d.camChar); return; }
    if (d.copy) { try { await navigator.clipboard.writeText(d.copy); toast("نُسخ: " + d.copy); } catch { toast(d.copy); } return; }
    if (d.project) { state.vault.current = d.project; save("zhar.vault", state.vault); render(); return; }
    switch (d.action) {
      case "back": state.view = "search"; render(); break;
      case "speak": speak(state.entry.s); break;
      case "star": toggleStar(state.entry); render(); break;
      case "close-sheet": closeSheet(); break;
      case "close-stroke": $("#stroke").classList.remove("open"); writer = null; break;
      case "stroke-replay": writer && writer.animateCharacter(); break;
      case "stroke-quiz": writer && (writer.quiz(), toast("اكتب الحرف بإصبعك أو بالفأرة")); break;
      case "clear": setQuery(""); $("#q").focus(); break;
      case "tips": openSearchTips(); break;
      case "intro-done": state.settings.introDone = true; save("zhar.settings", state.settings); render(); break;
      case "clear-history": state.history = []; save("zhar.history", []); render(); break;
      case "handwrite": HW.open(); break;
      case "close-hw": HW.close(); break;
      case "hw-undo": HW.undo(); break;
      case "hw-clear": HW.clearStroke(); break;
      case "hw-search": HW.search(); break;
      case "camera": CAM.open(); break;
      case "close-cam": CAM.close(); break;
      case "cam-shot": CAM.capture(); break;
      case "cam-file": $("#cam-file").click(); break;
      case "cam-undo": CAM.backspace(); break;
      case "cam-search": CAM.search(); break;
      case "paste":
        try { const txt = (await navigator.clipboard.readText()).trim(); if (txt) setQuery(txt.slice(0, 40)); else toast("الحافظة فارغة"); }
        catch { toast("لم يُسمح بقراءة الحافظة"); }
        break;
      case "new-project": {
        const name = prompt("اسم المشروع الجديد:");
        if (name && !state.vault.projects.includes(name)) { state.vault.projects.push(name); state.vault.current = name; save("zhar.vault", state.vault); render(); }
        break;
      }
      case "export-csv": exportVault("csv"); break;
      case "export-anki": exportVault("anki"); break;
    }
  });

  document.addEventListener("change", (ev) => {
    const el = ev.target;
    if (el.dataset.pack) {
      const s = state.settings;
      s.packs = el.checked ? [...new Set([...s.packs, el.dataset.pack])] : s.packs.filter((p) => p !== el.dataset.pack);
      save("zhar.settings", s); rebuild(); toast("تم تحديث الحزم"); render();
    } else if (el.dataset.set) {
      state.settings[el.dataset.set] = el.type === "checkbox" ? el.checked : el.value;
      save("zhar.settings", state.settings); render();
    }
  });

  $("#q").addEventListener("input", (ev) => { state.query = ev.target.value; state.domainFilter = null; state.view = "search"; render(); });
  $("#sheet").addEventListener("click", (ev) => { if (ev.target.id === "sheet") closeSheet(); });

  const HINTS = ["اكتب حروفًا صينية: 安全", "أو بينيين: anquan", "أو الحروف الأولى: abbd", "أو بالعربية: سلامة", "أو بالجذر: س ل م"];
  let hintI = 0;
  setInterval(() => { if (!$("#q").value) $("#q").placeholder = HINTS[(hintI = (hintI + 1) % HINTS.length)]; }, 2600);
  $("#q").placeholder = HINTS[0];

  HW.onSearch = (text) => { if (text) setQuery(text); else toast("اكتب حرفًا أولًا"); };
  CAM.onSearch = (text) => { if (text) setQuery(text); else toast("اختر حروفًا من نتيجة التعرف أولًا"); };
  $("#cam-file").addEventListener("change", (ev) => { const f = ev.target.files && ev.target.files[0]; ev.target.value = ""; if (f) CAM.fromFile(f); });
  rebuild(); render();
  window.__app = { state, LEX };
})();
