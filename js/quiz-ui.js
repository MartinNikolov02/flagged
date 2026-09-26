// Renders one question into a stage element and calls back once answered.
// Used identically by single player, quick match, and custom lobby so the
// three modes behave consistently.
//
// render() returns a controller: { expire() } — multiplayer rounds call
// expire() when a 10s timer runs out, which force-submits a wrong answer
// if the player hasn't already answered. It's a no-op if they already have.
const QuizUI = (() => {
  // optionCodes: optional pre-decided array of 4 flag codes (shared across
  // players in multiplayer, via Utils.makeOptionCodes). If omitted, a random
  // set is generated locally — fine for single player, where there's no one
  // else who needs to see the same options.
  function render(stageEl, country, difficulty, onAnswer, optionCodes) {
    stageEl.innerHTML = "";
    if (difficulty === "choice") return renderMultipleChoice(stageEl, country, onAnswer, optionCodes);
    return renderTypeAnswer(stageEl, country, onAnswer);
  }
 
  function renderMultipleChoice(stageEl, country, onAnswer, optionCodes) {
    const codes = optionCodes && optionCodes.length === 4 ? optionCodes : Utils.makeOptionCodes(country.code);
    const options = codes.map((code) => COUNTRIES.find((c) => c.code === code));
 
    const prompt = document.createElement("div");
    prompt.className = "quiz-prompt";
    prompt.textContent = `Which flag is ${country.name}?`;
    stageEl.appendChild(prompt);
 
    const grid = document.createElement("div");
    grid.className = "flag-options";
 
    let answered = false;
 
    function lockAndReveal(correctBtn) {
      [...grid.children].forEach((b) => (b.disabled = true));
      if (correctBtn) correctBtn.classList.add("correct");
      else {
        const rightBtn = [...grid.children].find((b) => b.dataset.code === country.code);
        if (rightBtn) rightBtn.classList.add("correct");
      }
    }
 
    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "flag-option";
      btn.innerHTML = `<span class="${Utils.flagClass(opt.code)}"></span>`;
      btn.dataset.code = opt.code;
      btn.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const correct = opt.code === country.code;
        lockAndReveal(correct ? btn : null);
        if (!correct) btn.classList.add("wrong");
        setTimeout(() => onAnswer(correct), 550);
      });
      grid.appendChild(btn);
    });
    stageEl.appendChild(grid);
 
    return {
      expire() {
        if (answered) return;
        answered = true;
        lockAndReveal(null);
        onAnswer(false);
      },
    };
  }
 
  function renderTypeAnswer(stageEl, country, onAnswer) {
    const flagWrap = document.createElement("div");
    flagWrap.className = "quiz-flag-big";
    flagWrap.innerHTML = `<span class="${Utils.flagClass(country.code)}"></span>`;
    stageEl.appendChild(flagWrap);
 
    const form = document.createElement("form");
    form.className = "type-answer-form";
    form.innerHTML = `
      <input class="text-input" type="text" autocomplete="off" placeholder="Country name…" />
      <button class="primary-btn" type="submit">Guess</button>
    `;
    stageEl.appendChild(form);
 
    const feedback = document.createElement("div");
    feedback.className = "feedback-banner";
    stageEl.appendChild(feedback);
 
    const input = form.querySelector("input");
    input.focus();
    let answered = false;
 
    function lock() {
      input.disabled = true;
      form.querySelector("button").disabled = true;
    }
 
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (answered) return;
      answered = true;
      const correct = Utils.isCorrectAnswer(input.value, country);
      lock();
      feedback.classList.add(correct ? "correct" : "wrong");
      feedback.textContent = correct ? "Correct!" : `It was ${country.name}`;
      setTimeout(() => onAnswer(correct), correct ? 500 : 1100);
    });
 
    return {
      expire() {
        if (answered) return;
        answered = true;
        lock();
        feedback.classList.add("wrong");
        feedback.textContent = `Time's up! It was ${country.name}`;
        onAnswer(false);
      },
    };
  }
 
  return { render };
})();