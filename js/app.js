const App = (() => {
  // A short synthesized "click" tone (no audio file needed) for menu/UI
  // buttons — deliberately skipped for anything inside .quiz-stage, since
  // that's where flag-option and "Guess" buttons live during actual play,
  // and we don't want sound distracting people mid-question.
  let audioCtx = null;
  function playClickSound() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      // ignore (e.g. browser blocks audio before any user gesture)
    }
  }
 
  function initClickSound() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.closest(".quiz-stage")) return; // skip in-game answer buttons
      playClickSound();
    });
  }
 
  // Background music: plays everywhere, including during gameplay (unlike
  // the click sound above). Browsers block audio-with-sound until the
  // person has interacted with the page at least once, so playback starts
  // on the first click anywhere. Mute preference is remembered between visits.
  function initMusic() {
    const audio = document.getElementById("bg-music");
    const btn = document.getElementById("music-toggle");
    if (!audio || !btn) return;
 
    let muted = localStorage.getItem("flagged-music-muted") === "true";
    audio.muted = muted;
    audio.volume = 0.35;
    btn.innerHTML = muted
  ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 9 3 15 8 15 13 20 13 4 8 9 3 9"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>'
  : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 9 3 15 8 15 13 20 13 4 8 9 3 9"></polygon><path d="M16 8a5 5 0 0 1 0 8"></path><path d="M18.5 5.5a9 9 0 0 1 0 13"></path></svg>';
 
    function tryPlay() {
      if (audio.paused) audio.play().catch(() => {});
    }
 
    tryPlay();
    document.addEventListener("click", tryPlay, { once: true });
 
    btn.addEventListener("click", () => {
      muted = !muted;
      audio.muted = muted;
      localStorage.setItem("flagged-music-muted", String(muted));
          btn.innerHTML = muted
      ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 9 3 15 8 15 13 20 13 4 8 9 3 9"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>'
      : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 9 3 15 8 15 13 20 13 4 8 9 3 9"></polygon><path d="M16 8a5 5 0 0 1 0 8"></path><path d="M18.5 5.5a9 9 0 0 1 0 13"></path></svg>';
      if (!muted) tryPlay();
    });
  }
 
  function goTo(screenName) {
    const mpSetupActive = document.querySelector('[data-screen="mp-setup"]').classList.contains("active");
    const searchingNow = mpSetupActive && !document.getElementById("mp-searching-panel").hidden;
    if (searchingNow && screenName !== "mp-play") {
      Multiplayer.QuickMatch.cancel();
    }
    const mpPlayActive = document.querySelector('[data-screen="mp-play"]').classList.contains("active");
    if (mpPlayActive && screenName !== "mp-play" && Multiplayer.QuickMatch.isActive()) {
      Multiplayer.QuickMatch.leaveDuel();
    }
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.dataset.screen === screenName));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (screenName === "mp-setup") resetQuickMatchPanel();
  }
 
  function resetQuickMatchPanel() {
    const panel = document.getElementById("mp-searching-panel");
    const findBtn = document.getElementById("mp-find-btn");
    if (panel) panel.hidden = true;
    if (findBtn) {
      findBtn.disabled = !(document.getElementById("mp-name-input").value.trim() &&
        document.querySelector("#mp-difficulty-choice .choice-card.selected") && firebaseReady);
    }
  }
 
  function init() {
    initClickSound();
    initMusic();
    document.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => goTo(btn.dataset.nav));
    });
 
    if (!firebaseReady) {
      document.getElementById("firebase-warning").hidden = false;
    }
 
    initSingle();
    initQuickMatch();
    initCustomLobby();
  }
 
  // ---------------- Single player ----------------
  function initSingle() {
    document.querySelectorAll("#single-difficulty-choice .choice-card").forEach((card) => {
      card.addEventListener("click", () => SinglePlayer.start(card.dataset.value));
    });
    document.getElementById("single-end-btn").addEventListener("click", () => SinglePlayer.endNow());
  }
 
  // ---------------- Quick match (1v1) ----------------
  function initQuickMatch() {
    const nameInput = document.getElementById("mp-name-input");
    const findBtn = document.getElementById("mp-find-btn");
    const cancelBtn = document.getElementById("mp-cancel-btn");
    const searchingPanel = document.getElementById("mp-searching-panel");
    const choiceRow = document.getElementById("mp-difficulty-choice");
    let selectedDifficulty = null;
 
    function refreshFindEnabled() {
      findBtn.disabled = !(nameInput.value.trim() && selectedDifficulty && firebaseReady);
    }
 
    nameInput.addEventListener("input", refreshFindEnabled);
 
    choiceRow.querySelectorAll(".choice-card").forEach((card) => {
      card.addEventListener("click", () => {
        choiceRow.querySelectorAll(".choice-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        selectedDifficulty = card.dataset.value;
        refreshFindEnabled();
      });
    });
 
    findBtn.addEventListener("click", () => {
      searchingPanel.hidden = false;
      findBtn.disabled = true;
      Multiplayer.QuickMatch.find(nameInput.value.trim(), selectedDifficulty);
    });
 
    cancelBtn.addEventListener("click", () => {
      Multiplayer.QuickMatch.cancel();
      searchingPanel.hidden = true;
      findBtn.disabled = false;
    });
  }
 
  // ---------------- Custom lobby ----------------
  function initCustomLobby() {
    const nameInput = document.getElementById("custom-name-input");
    const createBtn = document.getElementById("custom-create-btn");
    const joinBtn = document.getElementById("custom-join-btn");
    const codeInput = document.getElementById("custom-code-input");
    let selectedLength = null;
    let selectedDifficulty = null;
 
    document.querySelectorAll(".tab-btn").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        document.querySelector(`[data-tab-panel="${tab.dataset.tab}"]`).classList.add("active");
      });
    });
 
    document.querySelectorAll('.choice-card[data-field="length"]').forEach((card) => {
      card.addEventListener("click", () => {
        document.querySelectorAll('.choice-card[data-field="length"]').forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        selectedLength = card.dataset.value;
        refreshCreateEnabled();
      });
    });
    document.querySelectorAll('.choice-card[data-field="difficulty"]').forEach((card) => {
      card.addEventListener("click", () => {
        document.querySelectorAll('.choice-card[data-field="difficulty"]').forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        selectedDifficulty = card.dataset.value;
        refreshCreateEnabled();
      });
    });
 
    function refreshCreateEnabled() {
      createBtn.disabled = !(nameInput.value.trim() && selectedLength && selectedDifficulty && firebaseReady);
    }
    function refreshJoinEnabled() {
      joinBtn.disabled = !(nameInput.value.trim() && codeInput.value.trim().length >= 4 && firebaseReady);
    }
    nameInput.addEventListener("input", () => {
      refreshCreateEnabled();
      refreshJoinEnabled();
    });
    codeInput.addEventListener("input", refreshJoinEnabled);
 
    createBtn.addEventListener("click", () => {
      Multiplayer.CustomLobby.create(nameInput.value.trim(), selectedLength, selectedDifficulty);
    });
    joinBtn.addEventListener("click", () => {
      Multiplayer.CustomLobby.join(nameInput.value.trim(), codeInput.value.trim());
    });
 
    document.getElementById("custom-start-btn").addEventListener("click", () => Multiplayer.CustomLobby.start());
    document.getElementById("custom-leave-btn").addEventListener("click", () => {
      Multiplayer.CustomLobby.leave();
      goTo("home");
    });
  }
 
  return { goTo, init };
})();
 
document.addEventListener("DOMContentLoaded", App.init);
 