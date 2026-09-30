const SinglePlayer = (() => {
  let queue = [];
  let index = 0;
  let correct = 0;
  let missed = [];
  let difficulty = "choice";
  let streak = 0;

  function start(chosenDifficulty) {
    difficulty = chosenDifficulty;
    queue = Utils.shuffle(COUNTRIES);
    index = 0;
    correct = 0;
    missed = [];
    streak = 0;
    App.goTo("single-play");
    next();
  }

  function next() {
    if (index >= queue.length) return finish();
    const country = queue[index];
    updateHeader();
    const stage = document.getElementById("single-quiz-stage");
        QuizUI.render(stage, country, difficulty, (isCorrect) => {
      if (isCorrect) {
        correct++;
        streak++;
        if (Utils.shouldCelebrateStreak(streak)) Utils.showStreak(streak);
      } else {
        missed.push(country);
        streak = 0;
      }
      index++;
      next();
    });
  }

  function updateHeader() {
    document.getElementById("single-progress-text").textContent = `Question ${index + 1} of ${queue.length}`;
    document.getElementById("single-score-text").textContent = `Correct: ${correct} · Missed: ${missed.length}`;
    document.getElementById("single-progress-fill").style.width = `${(index / queue.length) * 100}%`;
  }

  function finish() {
    const total = index; // answered so far (handles early end)
    document.getElementById("single-result-score").innerHTML =
      `${correct}<span class="dim"> / ${total} correct</span>`;

    const wrap = document.getElementById("single-missed-wrap");
    wrap.innerHTML = "";
    if (missed.length === 0 && total > 0) {
      wrap.innerHTML = `<p style="color:var(--text-muted)">Perfect run — nothing missed.</p>`;
    } else {
      missed.forEach((c) => {
        const chip = document.createElement("span");
        chip.className = "missed-chip";
        chip.innerHTML = `<span class="${Utils.flagClass(c.code)}"></span>${c.name}`;
        wrap.appendChild(chip);
      });
    }
        if (total > 0) Utils.confettiBurst();
    App.goTo("single-results");
  }

  function endNow() {
    // Jump straight to results using progress made so far.
    App.goTo("single-results");
    finish();
  }

  return { start, endNow };
})();
