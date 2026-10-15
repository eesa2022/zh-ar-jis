window.PY = (() => {
  const MARKS = {
    "ā": ["a", 1], "á": ["a", 2], "ǎ": ["a", 3], "à": ["a", 4],
    "ē": ["e", 1], "é": ["e", 2], "ě": ["e", 3], "è": ["e", 4],
    "ī": ["i", 1], "í": ["i", 2], "ǐ": ["i", 3], "ì": ["i", 4],
    "ō": ["o", 1], "ó": ["o", 2], "ǒ": ["o", 3], "ò": ["o", 4],
    "ū": ["u", 1], "ú": ["u", 2], "ǔ": ["u", 3], "ù": ["u", 4],
    "ǖ": ["ü", 1], "ǘ": ["ü", 2], "ǚ": ["ü", 3], "ǜ": ["ü", 4]
  };

  const syllables = (py) => (py || "").trim().split(/\s+/).filter(Boolean);

  function tone(syl) {
    for (const ch of syl.toLowerCase()) if (MARKS[ch]) return MARKS[ch][1];
    return 5;
  }

  function strip(syl) {
    return [...syl].map((c) => {
      const low = c.toLowerCase();
      if (!MARKS[low]) return c;
      const base = MARKS[low][0];
      return c === low ? base : base.toUpperCase();
    }).join("");
  }

  const plain = (py) => strip(py).toLowerCase().replace(/ü/g, "v").replace(/[^a-z]/g, "");
  const plainU = (py) => plain(py).replace(/v/g, "u");
  const numbered = (py) => syllables(py).map((s) => strip(s).toLowerCase().replace(/ü/g, "v") + tone(s)).join("");
  const initials = (py) => syllables(py).map((s) => strip(s)[0].toLowerCase()).join("");

  function displaySyllables(py, style) {
    return syllables(py).map((s) => ({ text: style === "numbers" ? strip(s).replace(/ü/g, "v") + tone(s) : s, tone: tone(s) }));
  }

  // 3 个音节以内连写（加隔音符号），4 个及以上（成语、长短语）按音节空格
  const VOWELS = /[aeiouüvāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+/gi;
  const isSingleSyllable = (t) => (t.match(VOWELS) || []).length === 1;

  function joinWord(parts, sepv) {
    if (sepv && parts.length === 2) return [parts[0], { sep: "//" }, parts[1]];
    if (parts.length >= 4 || !parts.every((p) => isSingleSyllable(p.text))) return parts.flatMap((p, i) => (i ? [{ sep: " " }, p] : [p]));
    return parts.flatMap((p, i) => {
      if (i && /^[aoeāáǎàōóǒòēéěè]/i.test(p.text)) return [{ sep: "'" }, p];
      return [p];
    });
  }

  function hasToneMarks(s) { return [...s.toLowerCase()].some((c) => MARKS[c]); }

  return { syllables, tone, strip, plain, plainU, numbered, initials, displaySyllables, joinWord, hasToneMarks };
})();
