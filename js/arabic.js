window.AR = (() => {
  const HARAKAT = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
  const PREFIXES = ["وال", "بال", "فال", "كال", "لل", "ال", "و", "ب", "ل", "ف", "ك"];
  const EAST_DIGITS = "٠١٢٣٤٥٦٧٨٩";
  const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

  const stripHarakat = (s) => (s || "").replace(HARAKAT, "").replace(/\u0640/g, "");

  function norm(s) {
    return stripHarakat(s)
      .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
      .replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ی/g, "ي").replace(/ک/g, "ك")
      .replace(/[٠-٩]/g, (d) => EAST_DIGITS.indexOf(d))
      .replace(/[۰-۹]/g, (d) => PERSIAN_DIGITS.indexOf(d))
      .replace(/[^\u0621-\u064A0-9\s]/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  // 一个词的检索变体：原形 + 去掉常见前缀后的形式（剩余至少 3 个字母）
  function variants(word) {
    const out = new Set([word]);
    for (const p of PREFIXES) {
      if (word.startsWith(p) && word.length - p.length >= 3) out.add(word.slice(p.length));
    }
    return [...out];
  }

  const isArabic = (s) => /[\u0600-\u06FF]/.test(s);

  // "س ل م" / "جذر: سلم" / "جذر:سلم"
  function parseRoot(q) {
    const t = q.trim();
    let m = t.match(/^جذر\s*[:：]?\s*(.+)$/);
    if (m) return norm(m[1]).replace(/\s/g, "");
    if (/^[\u0621-\u064A](\s+[\u0621-\u064A]){2,3}$/.test(norm(t))) return norm(t).replace(/\s/g, "");
    return null;
  }

  const toEastDigits = (n) => String(n).replace(/[0-9]/g, (d) => EAST_DIGITS[d]);
  const spacedRoot = (r) => [...r.replace(/^ا/, "أ")].join(" ");

  return { stripHarakat, norm, variants, isArabic, parseRoot, toEastDigits, spacedRoot };
})();
