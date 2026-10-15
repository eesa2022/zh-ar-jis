window.CAM = (() => {
  let worker = null;
  let starting = null;
  let stream = null;
  let composed = "";

  const el = (id) => document.getElementById(id);
  const status = (t) => { el("cam-status").textContent = t; };

  function showComposed() {
    el("cam-composed").textContent = composed || " ";
  }

  function ensure() {
    if (worker) return Promise.resolve(worker);
    if (starting) return starting;
    status("أول مرة: يُنزَّل نموذج الصينية (حوالي ٢٠ ميغابايت)، ثم يُحفظ على الجهاز.");
    starting = Tesseract.createWorker("chi_sim", 1, {
      logger(m) {
        if (m.status === "recognizing text") status("يتعرّف على النص… " + Math.round((m.progress || 0) * 100) + "%");
        else if (m.status === "loading language traineddata") status("ينزّل نموذج الصينية… " + Math.round((m.progress || 0) * 100) + "%");
      }
    }).then(async (w) => {
      await w.setParameters({ tessedit_pageseg_mode: "6" });
      worker = w;
      return w;
    }).catch((err) => { starting = null; throw err; });
    return starting;
  }

  function stopStream() {
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    const video = el("cam-video");
    video.srcObject = null;
  }

  function startCamera() {
    const video = el("cam-video");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      video.hidden = true;
      el("cam-shot").hidden = true;
      status("اختر صورة من الألبوم، أو التقطها بزر الصورة.");
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }).then((s) => {
      stream = s;
      video.hidden = false;
      video.srcObject = s;
      video.playsInline = true;
      video.play();
      el("cam-shot").hidden = false;
      el("cam-preview").hidden = true;
      status("وجّه الكاميرا إلى سطر صيني واضح، ثم اضغط التقاط.");
    }).catch(() => {
      video.hidden = true;
      el("cam-shot").hidden = true;
      status("تعذّر فتح الكاميرا المباشرة. استخدم زر الصورة.");
    });
  }

  function open() {
    composed = "";
    showComposed();
    el("cam-result").innerHTML = "";
    el("cam-preview").hidden = true;
    el("cam").classList.add("open");
    status("يُفتح…");
    startCamera();
  }

  function close() {
    stopStream();
    el("cam").classList.remove("open");
  }

  function renderText(text) {
    const box = el("cam-result");
    const chars = [...(text || "")].filter((ch) => ch !== "\r");
    const hasHan = chars.some((ch) => /[\u3400-\u9fff]/.test(ch));
    if (!hasHan) {
      box.innerHTML = `<span class="muted">لم يُعثر على حروف صينية. جرّب صورة أقرب وأوضح.</span>`;
      return;
    }
    box.innerHTML = chars.map((ch) => {
      if (ch === "\n") return "<br>";
      if (/[\u3400-\u9fff]/.test(ch)) return `<button class="cam-char zh" data-cam-char="${ch}">${ch}</button>`;
      if (ch === " " || ch === "\u3000") return "";
      return `<span class="cam-other">${ch.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span>`;
    }).join("");
  }

  async function recognize(source) {
    status("جارٍ التعرف على النص…");
    try {
      const w = await ensure();
      const { data } = await w.recognize(source);
      renderText(data.text || "");
      status("اضغط الحروف المطلوبة بالترتيب، ثم ابحث.");
    } catch (e) {
      status("تعذّر التعرف. تأكد من الاتصال في أول مرة، ثم أعد المحاولة.");
    }
  }

  async function capture() {
    const video = el("cam-video");
    if (!stream || !video.videoWidth) { status("الكاميرا ليست جاهزة بعد."); return; }
    const canvas = document.createElement("canvas");
    const max = 1280;
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    const preview = el("cam-preview");
    preview.src = canvas.toDataURL("image/jpeg", 0.85);
    preview.hidden = false;
    await recognize(canvas);
  }

  function fromFile(file) {
    if (!file) return;
    stopStream();
    el("cam-video").hidden = true;
    el("cam-shot").hidden = true;
    const url = URL.createObjectURL(file);
    const img = el("cam-preview");
    img.onload = () => { URL.revokeObjectURL(url); recognize(img); };
    img.src = url;
    img.hidden = false;
  }

  function pick(ch) { composed += ch; showComposed(); }
  function backspace() { composed = [...composed].slice(0, -1).join(""); showComposed(); }
  function search() {
    const text = composed;
    close();
    if (CAM.onSearch) CAM.onSearch(text);
  }

  return { open, close, capture, fromFile, pick, backspace, search, onSearch: null };
})();
