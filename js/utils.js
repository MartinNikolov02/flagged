const Utils = (() => {
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
 
  function sample(arr, n) {
    return shuffle(arr).slice(0, n);
  }
 
  // Normalize a typed answer for comparison: lowercase, strip accents/punctuation, collapse spaces.
  function normalize(str) {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
 
  function isCorrectAnswer(typed, country) {
    const t = normalize(typed);
    if (!t) return false;
    if (t === normalize(country.name)) return true;
    if (country.alts && country.alts.some((a) => normalize(a) === t)) return true;
    return false;
  }
 
  function roomCode(len = 5) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }
 
  function playerId() {
    return "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
 
  function flagClass(code) {
    return `fi fi-${code}`;
  }
 
  // Build one shared set of 4 flag codes (the correct one + 3 random wrong
  // ones) for a multiple-choice question. Generated once by whoever creates
  // the room/round and stored in Firebase so every player sees the same 4
  // options, just possibly in a different on-screen order.
  //
  // Wrong answers are drawn from CONFUSION_GROUPS first (flags people
  // actually mix up with the correct one), topped up with random countries
  // if the correct flag isn't in a group or its group is small. Which
  // members of a larger group get picked is randomized each call.
  function makeOptionCodes(correctCode) {
    const confusable = new Set();
    CONFUSION_GROUPS.forEach((group) => {
      if (group.includes(correctCode)) {
        group.forEach((code) => {
          if (code !== correctCode) confusable.add(code);
        });
      }
    });
 
    let wrong = sample([...confusable], Math.min(3, confusable.size));
    if (wrong.length < 3) {
      const used = new Set([correctCode, ...wrong]);
      const filler = sample(
        COUNTRIES.filter((c) => !used.has(c.code)),
        3 - wrong.length
      ).map((c) => c.code);
      wrong = wrong.concat(filler);
    }
    return shuffle([correctCode, ...wrong]);
  }
 
  return { shuffle, sample, normalize, isCorrectAnswer, roomCode, playerId, flagClass, makeOptionCodes };
})();
 
