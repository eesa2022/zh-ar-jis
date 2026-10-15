window.HW = (() => {
  let matcher = null;
  let loading = null;
  let strokes = [];
  let current = null;
  let composed = "";

  const $ = (id) => document.getElementById(id);

  function ensure() {
    if (matcher) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      if (!window.HanziLookup) { reject(new Error("lib")); return; }
      HanziLookup.init("mmah", "vendor/mmah.json", (ok) => {
        if (!ok) { loading = null; reject(new Error("data")); return; }
        matcher = new HanziLookup.Matcher("mmah");
        resolve();
      });
    });
    return loading;
  }

  function canvasBox() {
    const c = $("hw-canvas");
    const r = c.getBoundingClientRect();
    return { c, w: r.width, h: r.height };
  }

  function redraw() {
    const { c, w, h } = canvasBox();
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#e6e0d4";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2, 10); ctx.lineTo(w / 2, h - 10);
    ctx.moveTo(10, h / 2); ctx.lineTo(w - 10, h / 2);
    ctx.stroke();
    ctx.strokeStyle = "#1f3a5f";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes.concat(current ? [current] : [])) {
      if (!s.length) continue;
      ctx.beginPath();
      ctx.moveTo(s[0][0], s[0][1]);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]);
      if (s.length === 1) ctx.lineTo(s[0][0] + 0.4, s[0][1] + 0.4);
      ctx.stroke();
    }
  }

  function showComposed() {
    $("hw-composed").textContent = composed || " ";
  }

  function recognize() {
    const box = $("hw-cands");
    if (!matcher || !strokes.length) { box.innerHTML = ""; return; }
    const input = strokes.map((s) => s.map((p) => [p[0], p[1]]));
    let matches = [];
    try {
      matcher.match(new HanziLookup.AnalyzedCharacter(input), 8, (m) => { matches = m || []; });
    } catch (e) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = matches.map((m) => `<button class="hw-cand zh" data-hw-char="${m.character}">${m.character}</button>`).join("");
  }

  function pointOf(ev) {
    const r = $("hw-canvas").getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  function onDown(ev) {
    if (!matcher || ev.button > 0) return;
    ev.preventDefault();
    try { $("hw-canvas").setPointerCapture(ev.pointerId); } catch (e) { /* 合成事件没有真实指针 */ }
    current = [pointOf(ev)];
    redraw();
  }
  function onMove(ev) {
    if (!current) return;
    ev.preventDefault();
    const p = pointOf(ev);
    const last = current[current.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2) return;
    current.push(p);
    redraw();
  }
  function onUp() {
    if (!current) return;
    if (current.length >= 2) strokes.push(current);
    current = null;
    redraw();
    recognize();
  }

  function open() {
    strokes = [];
    current = null;
    composed = "";
    $("hw-cands").innerHTML = "";
    showComposed();
    $("hw").classList.add("open");
    $("hw-status").textContent = "جارٍ تحميل بيانات الحروف…";
    requestAnimationFrame(redraw);
    ensure().then(() => {
      $("hw-status").textContent = "ارسم حرفًا واحدًا، ثم اضغط الاقتراح. كرّر للحرف التالي، ثم ابحث.";
      redraw();
    }).catch(() => {
      $("hw-status").textContent = "تعذّر تحميل التعرف على الخط. تحقق من الاتصال ثم أعد المحاولة.";
    });
  }

  function close() { $("hw").classList.remove("open"); current = null; }
  function undo() { strokes.pop(); redraw(); recognize(); }
  function clearStroke() { strokes = []; current = null; $("hw-cands").innerHTML = ""; redraw(); }
  function pick(ch) {
    composed += ch;
    showComposed();
    clearStroke();
  }
  function search() {
    const text = composed;
    close();
    if (HW.onSearch) HW.onSearch(text);
  }

  const canvas = document.getElementById("hw-canvas");
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  return { open, close, undo, clearStroke, pick, search, onSearch: null };
})();
