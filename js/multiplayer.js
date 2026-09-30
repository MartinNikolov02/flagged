const Multiplayer = (() => {
  const myId = Utils.playerId();
  let myName = "Player";
  const ROUND_MS = 10000;
  const TICK_MS = 350;
 
  // Firebase's server clock, not each device's own clock — two phones/
  // laptops can easily be a couple seconds off from each other, which was
  // exactly why the on-screen timer looked different per device. Every
  // device instead measures round time against this shared reference.
  let serverTimeOffset = 0;
  if (typeof db !== "undefined" && db) {
    db.ref(".info/serverTimeOffset").on("value", (snap) => {
      serverTimeOffset = snap.val() || 0;
    });
  }
  function serverNow() {
    return Date.now() + serverTimeOffset;
  }
 
  // Displays a countdown that counts down to a shared deadline (startedAt +
  // ROUND_MS), not just "10, 9, 8…" from whenever this device happened to
  // render the question. That's what keeps two devices' timers lined up
  // even if one heard about the new round a bit later than the other.
  function startCountdown(timerEl, startedAt, onExpire) {
    let done = false;
    function tick() {
      if (done) return;
      const remaining = Math.max(0, ROUND_MS - (serverNow() - startedAt));
      const secs = Math.min(10, Math.ceil(remaining / 1000));
      timerEl.textContent = secs;
      timerEl.classList.toggle("low", secs > 0 && secs <= 3);
      if (remaining <= 0) {
        done = true;
        onExpire();
        return;
      }
      requestAnimationFrame(tick);
    }
    tick();
    return () => {
      done = true;
    };
  }
 
  // ---------------------------------------------------------------------
  // QUICK MATCH (1v1, 15 questions, random opponent, synced rounds)
  // ---------------------------------------------------------------------
  const QuickMatch = (() => {
    let difficulty = "choice";
    let queueRef = null;
    let queueListener = null;
    let roomRef = null;
    let roomListener = null;
    let coordinatorInterval = null;
    let countries = [];
    let optionsList = null;
    let cancelled = false;
    let renderedRound = -1;
    let lastAdvancedIndex = -1;
    let stopTimer = null;
    let myScore = 0;
    let oppBaseName = "Opponent";
    let ended = false;
    let latestRoom = null;
 
    function find(name, chosenDifficulty) {
      myName = name || "Player";
      difficulty = chosenDifficulty;
      cancelled = false;
      const q = db.ref(`quickQueue/${difficulty}`);
 
      q.once("value").then((snap) => {
        if (cancelled) return;
        const data = snap.val() || {};
        const now = Date.now();
        const candidateId = Object.keys(data).find(
          (id) => id !== myId && !data[id].roomId && now - data[id].ts < 120000
        );
 
        if (candidateId) {
          const oppName = data[candidateId].name || "Opponent";
          const newRoomId = Utils.roomCode(8);
          const picked = Utils.sample(COUNTRIES, 15).map((c) => c.code);
          const options = difficulty === "choice" ? picked.map((code) => Utils.makeOptionCodes(code)) : null;
          const roomData = {
            difficulty,
            countries: picked,
            options,
            status: "playing",
            round: { index: 0, answers: {}, startedAt: serverNow() },
            createdAt: now,
            players: {
              [myId]: { name: myName, score: 0 },
              [candidateId]: { name: oppName, score: 0 },
            },
          };
          db.ref(`duelRooms/${newRoomId}`)
            .set(roomData)
            .then(() => db.ref(`quickQueue/${difficulty}/${candidateId}/roomId`).set(newRoomId))
            .then(() => enterRoom(newRoomId));
        } else {
          queueRef = db.ref(`quickQueue/${difficulty}/${myId}`);
          queueRef.set({ name: myName, ts: now, roomId: null });
          queueRef.onDisconnect().remove();
          queueListener = queueRef.on("value", (s) => {
            const v = s.val();
            if (v && v.roomId) {
              queueRef.off("value", queueListener);
              queueRef.onDisconnect().cancel();
              queueRef.remove();
              enterRoom(v.roomId);
            }
          });
        }
      });
    }
 
    function cancel() {
      cancelled = true;
      if (queueRef) {
        if (queueListener) queueRef.off("value", queueListener);
        queueRef.onDisconnect().cancel();
        queueRef.remove();
        queueRef = null;
      }
    }
 
    function enterRoom(id) {
      roomRef = db.ref(`duelRooms/${id}`);
      roomRef.child(`players/${myId}`).onDisconnect().update({ left: true });
      myScore = 0;
      renderedRound = -1;
      lastAdvancedIndex = -1;
      ended = false;
      latestRoom = null;
 
      roomRef.once("value").then((snap) => {
        const room = snap.val();
        countries = room.countries.map((code) => COUNTRIES.find((c) => c.code === code));
        optionsList = room.options || null;
        difficulty = room.difficulty;
        const oppId = Object.keys(room.players).find((id2) => id2 !== myId);
        oppBaseName = room.players[oppId].name;
        document.getElementById("mp-me-name").textContent = room.players[myId].name;
        document.getElementById("mp-opp-name").textContent = oppBaseName;
        App.goTo("mp-play");
        listenRoom(oppId);
        coordinatorInterval = setInterval(checkAdvance, TICK_MS);
      });
    }
 
    function listenRoom(oppId) {
      roomListener = roomRef.on("value", (snap) => {
        const room = snap.val();
        if (!room || ended) return;
        latestRoom = room;
        const opp = room.players[oppId];
        const me = room.players[myId];
        if (opp) {
          document.getElementById("mp-opp-score").textContent = `${opp.score} correct`;
          document.getElementById("mp-opp-name").textContent = oppBaseName + (opp.left ? " (left)" : "");
          document.getElementById("mp-opp-progress").style.width = `${(opp.score / countries.length) * 100}%`;
        }
        if (me) {
          document.getElementById("mp-me-score").textContent = `${me.score} correct`;
          document.getElementById("mp-me-progress").style.width = `${(me.score / countries.length) * 100}%`;
        }
 
        if (opp && opp.left && room.status === "playing") {
          endMatch();
          roomRef.update({ status: "finished" });
          showOpponentLeft(me);
          return;
        }
 
        if (room.status === "finished") {
          endMatch();
          showResults(me, opp);
          return;
        }
 
        if (room.round && room.round.index !== renderedRound) {
          renderedRound = room.round.index;
          renderRound(room.round.index, room.round.startedAt);
        }
      });
    }
 
    // Runs every ~350ms on both devices, but only the coordinator (the
    // player whose id sorts first — an arbitrary, deterministic pick both
    // sides agree on) ever writes the advance. Checking on an interval
    // instead of only reacting to Firebase events means the round reliably
    // moves on at the shared deadline even if nothing else happens to
    // trigger a check.
    function checkAdvance() {
      if (!latestRoom || ended || latestRoom.status !== "playing" || !latestRoom.round) return;
      const isCoordinator = Object.keys(latestRoom.players).sort()[0] === myId;
      if (!isCoordinator || latestRoom.round.index === lastAdvancedIndex) return;
 
      const ids = Object.keys(latestRoom.players);
      const answers = latestRoom.round.answers || {};
      const allAnswered = ids.every((id) => answers[id] !== undefined || latestRoom.players[id].left);
      const timeUp = serverNow() - latestRoom.round.startedAt >= ROUND_MS;
      if (!allAnswered && !timeUp) return;
 
      lastAdvancedIndex = latestRoom.round.index;
      const nextIndex = latestRoom.round.index + 1;
      if (nextIndex >= countries.length) {
        roomRef.update({ status: "finished" });
      } else {
        roomRef.update({ round: { index: nextIndex, answers: {}, startedAt: serverNow() } });
      }
    }
 
    function endMatch() {
      ended = true;
      if (stopTimer) stopTimer();
      if (coordinatorInterval) {
        clearInterval(coordinatorInterval);
        coordinatorInterval = null;
      }
      if (roomListener) roomRef.off("value", roomListener);
    }
 
    function renderRound(idx, startedAt) {
      if (stopTimer) stopTimer();
      document.getElementById("mp-round-text").textContent = `Round ${idx + 1} of ${countries.length}`;
 
      const country = countries[idx];
      const optionCodes = optionsList ? optionsList[idx] : null;
      const stage = document.getElementById("mp-quiz-stage");
      const timerEl = document.getElementById("mp-timer");
 
      const controller = QuizUI.render(
        stage,
        country,
        difficulty,
        (correct) => {
          if (correct) myScore++;
          roomRef.child(`players/${myId}`).update({ score: myScore });
          roomRef.child(`round/answers/${myId}`).set(correct);
        },
        optionCodes
      );
      stopTimer = startCountdown(timerEl, startedAt, () => controller.expire());
    }
 
    function showResults(me, opp) {
      const title = document.getElementById("mp-result-title");
      const body = document.getElementById("mp-result-body");
      if (!me || !opp) {
        title.textContent = "Match ended";
        body.innerHTML = "";
            } else if (me.score > opp.score) {
        title.textContent = "You won! 🎉";
        body.innerHTML = `<h3>${me.score} — ${opp.score}</h3>`;
        Utils.confettiBurst();
      } else if (me.score < opp.score) {
        title.textContent = "You lost this one";
        body.innerHTML = `<h3>${me.score} — ${opp.score}</h3>`;
      } else {
        title.textContent = "It's a tie";
        body.innerHTML = `<h3>${me.score} — ${opp.score}</h3>`;
      }
      App.goTo("mp-results");
    }
 
    function showOpponentLeft(me) {
      const title = document.getElementById("mp-result-title");
      const body = document.getElementById("mp-result-body");
      title.textContent = "Your opponent left";
      body.innerHTML = `<p>You finished with <strong>${me ? me.score : myScore}</strong> correct.</p>`;
      App.goTo("mp-results");
    }
 
    function isActive() {
      return !!roomRef && !ended;
    }
 
    function leaveDuel() {
      if (!isActive()) return;
      endMatch();
      roomRef.child(`players/${myId}`).onDisconnect().cancel();
      roomRef.child(`players/${myId}`).update({ left: true });
    }
 
    return { find, cancel, isActive, leaveDuel };
  })();
 
  // ---------------------------------------------------------------------
  // CUSTOM LOBBY (2-4 players, all countries OR 15 + sudden death, synced rounds)
  // ---------------------------------------------------------------------
  const CustomLobby = (() => {
    let code = null;
    let ref = null;
    let listener = null;
    let hostInterval = null;
    let isHost = false;
    let length = "15";
    let difficulty = "choice";
    let countries = [];
    let optionsList = null;
    let myScore = 0;
    let currentStatus = "waiting";
    let renderedRound = -1;
    let renderedSuddenIndex = -1;
    let lastAdvancedMainIndex = -1;
    let lastAdvancedSuddenIndex = -1;
    let stopTimer = null;
    let latestRoom = null;
 
    function create(name, chosenLength, chosenDifficulty) {
      myName = name || "Player";
      length = chosenLength;
      difficulty = chosenDifficulty;
      isHost = true;
      code = Utils.roomCode(5);
      ref = db.ref(`lobbies/${code}`);
      ref.set({
        hostId: myId,
        length,
        difficulty,
        status: "waiting",
        createdAt: Date.now(),
        players: { [myId]: { name: myName, score: 0, joinedAt: Date.now() } },
      }).then(() => {
        ref.child(`players/${myId}`).onDisconnect().remove();
        enterLobbyScreen();
      });
    }
 
    function join(name, joinCode) {
      myName = name || "Player";
      code = (joinCode || "").toUpperCase().trim();
      ref = db.ref(`lobbies/${code}`);
      ref.once("value").then((snap) => {
        const room = snap.val();
        if (!room) return alert("No lobby found with that code.");
        if (room.status !== "waiting") return alert("That lobby already started.");
        const count = Object.keys(room.players || {}).length;
        if (count >= 4) return alert("That lobby is full (4 players max).");
        isHost = false;
        length = room.length;
        difficulty = room.difficulty;
        ref.child(`players/${myId}`).set({ name: myName, score: 0, joinedAt: Date.now() })
          .then(() => {
            ref.child(`players/${myId}`).onDisconnect().remove();
            enterLobbyScreen();
          });
      });
    }
 
    function enterLobbyScreen() {
      App.goTo("custom-lobby");
      document.getElementById("custom-room-code").textContent = code;
      const modeLabel = length === "all" ? "All 197 countries" : "15 flags, sudden death on a tie";
      const diffLabel = difficulty === "choice" ? "Multiple choice" : "Type the name";
      document.getElementById("custom-lobby-mode").textContent = `${modeLabel} · ${diffLabel}`;
      currentStatus = "waiting";
      renderedRound = -1;
      renderedSuddenIndex = -1;
      lastAdvancedMainIndex = -1;
      lastAdvancedSuddenIndex = -1;
      latestRoom = null;
      if (isHost && !hostInterval) hostInterval = setInterval(hostTick, TICK_MS);
 
      listener = ref.on("value", (snap) => {
        const room = snap.val();
        if (!room) return;
        latestRoom = room;
        renderPlayerList(room);
 
        const startBtn = document.getElementById("custom-start-btn");
        const waitingNote = document.getElementById("custom-waiting-note");
        const playerCount = Object.keys(room.players || {}).length;
        if (isHost && room.status === "waiting") {
          startBtn.hidden = false;
          startBtn.disabled = playerCount < 2;
          waitingNote.hidden = true;
        } else {
          startBtn.hidden = true;
          waitingNote.hidden = false;
        }
 
        if (room.status === "playing") {
          if (currentStatus !== "playing") {
            currentStatus = "playing";
            countries = room.countries.map((c) => COUNTRIES.find((x) => x.code === c));
            optionsList = room.options || null;
            myScore = 0;
            renderedRound = -1;
            App.goTo("custom-play");
          }
          if (room.round && room.round.index !== renderedRound) {
            renderedRound = room.round.index;
            renderRound(room.round.index, room);
          }
        }
 
        if (room.status === "sudden") {
          currentStatus = "sudden";
          handleSuddenDeath(room);
        }
 
        if (room.status === "finished" && currentStatus !== "finished") {
          currentStatus = "finished";
          if (stopTimer) stopTimer();
          if (hostInterval) {
            clearInterval(hostInterval);
            hostInterval = null;
          }
          ref.off("value", listener);
          showStandings(room);
        }
      });
    }
 
    // Host-only, runs every ~350ms independent of Firebase events — this is
    // what decides when a round is over (everyone answered, or the shared
    // 10s deadline passed) so it never gets stuck waiting on an event that
    // may not fire again.
    function hostTick() {
      if (!isHost || !latestRoom) return;
      if (latestRoom.status === "playing") maybeAdvanceMainRound(latestRoom);
      else if (latestRoom.status === "sudden") maybeAdvanceSuddenDeath(latestRoom);
    }
 
    function renderPlayerList(room) {
      const list = document.getElementById("custom-player-list");
      list.innerHTML = "";
      Object.entries(room.players || {}).forEach(([id, p]) => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${p.name}${id === myId ? " (you)" : ""}${p.left ? " (left)" : ""}</span>${id === room.hostId ? '<span class="tag">HOST</span>' : ""}`;
        list.appendChild(li);
      });
    }
 
    function start() {
      const isAll = length === "all";
      const pool = isAll ? Utils.shuffle(COUNTRIES) : Utils.sample(COUNTRIES, 15);
      const codes = pool.map((c) => c.code);
      const opts = difficulty === "choice" ? codes.map((c) => Utils.makeOptionCodes(c)) : null;
      ref.update({
        countries: codes,
        options: opts,
        status: "playing",
        round: { index: 0, answers: {}, startedAt: serverNow() },
      });
    }
 
    function maybeAdvanceMainRound(room) {
      if (!room.round || room.round.index === lastAdvancedMainIndex) return;
      const ids = Object.keys(room.players || {});
      const answers = room.round.answers || {};
      const allAnswered = ids.every((id) => answers[id] !== undefined || room.players[id].left);
      const timeUp = serverNow() - room.round.startedAt >= ROUND_MS;
      if (!allAnswered && !timeUp) return;
      lastAdvancedMainIndex = room.round.index;
 
      const nextIndex = room.round.index + 1;
      if (nextIndex < room.countries.length) {
        ref.update({ round: { index: nextIndex, answers: {}, startedAt: serverNow() } });
        return;
      }
 
      if (room.length === "15") {
        const scores = ids.map((id) => room.players[id].score);
        const top = Math.max(...scores);
        const tied = ids.filter((id) => room.players[id].score === top);
        if (tied.length > 1) {
          const used = new Set(room.countries);
          const pool = Utils.shuffle(COUNTRIES.filter((c) => !used.has(c.code))).map((c) => c.code);
          ref.update({
            status: "sudden",
            suddenDeath: {
              active: tied,
              pool,
              roundIndex: 0,
              currentCountry: pool[0],
              currentOptions: room.difficulty === "choice" ? Utils.makeOptionCodes(pool[0]) : null,
              startedAt: serverNow(),
              answers: {},
            },
          });
          return;
        }
      }
      ref.update({ status: "finished" });
    }
 
    function renderRound(idx, room) {
      if (stopTimer) stopTimer();
      const total = countries.length;
      document.getElementById("custom-progress-text").textContent = `Round ${idx + 1} of ${total}`;
      document.getElementById("custom-progress-fill").style.width = `${(idx / total) * 100}%`;
      renderScoreboard(room.players, "custom-live-scoreboard");
 
      const country = countries[idx];
      const optionCodes = optionsList ? optionsList[idx] : null;
      const stage = document.getElementById("custom-quiz-stage");
      const timerEl = document.getElementById("custom-timer");
 
      const controller = QuizUI.render(
        stage,
        country,
        difficulty,
        (correct) => {
          if (correct) myScore++;
          ref.child(`players/${myId}`).update({ score: myScore });
          ref.child(`round/answers/${myId}`).set(correct);
        },
        optionCodes
      );
      stopTimer = startCountdown(timerEl, room.round.startedAt, () => controller.expire());
    }
 
    function renderScoreboard(players, targetId) {
      const el = document.getElementById(targetId);
      if (!el) return;
      el.innerHTML = "";
      Object.entries(players || {}).forEach(([id, p]) => {
        const chip = document.createElement("span");
        chip.className = "scoreboard-chip" + (id === myId ? " me" : "");
        chip.textContent = `${p.name}: ${p.score}${p.left ? " (left)" : ""}`;
        el.appendChild(chip);
      });
    }
 
    function maybeAdvanceSuddenDeath(room) {
      const sd = room.suddenDeath;
      if (!sd || sd.roundIndex === lastAdvancedSuddenIndex) return;
      const answeredCount = Object.keys(sd.answers || {}).length;
      const timeUp = serverNow() - sd.startedAt >= ROUND_MS;
      if (answeredCount < sd.active.length && !timeUp) return;
      lastAdvancedSuddenIndex = sd.roundIndex;
 
      const correctIds = sd.active.filter((id) => sd.answers[id] === true);
      const newActive = correctIds.length === 0 || correctIds.length === sd.active.length ? sd.active : correctIds;
 
      if (newActive.length === 1) {
        ref.update({ status: "finished", winnerId: newActive[0] });
        return;
      }
      const nextIndex = sd.roundIndex + 1;
      const nextCountry = sd.pool[nextIndex] || Utils.sample(COUNTRIES, 1)[0].code;
      ref.child("suddenDeath").set({
        active: newActive,
        pool: sd.pool,
        roundIndex: nextIndex,
        currentCountry: nextCountry,
        currentOptions: difficulty === "choice" ? Utils.makeOptionCodes(nextCountry) : null,
        startedAt: serverNow(),
        answers: {},
      });
    }
 
    function handleSuddenDeath(room) {
      const sd = room.suddenDeath;
      if (!sd) return;
      if (sd.roundIndex === renderedSuddenIndex) {
        renderSuddenChrome(room, sd);
        return;
      }
      renderedSuddenIndex = sd.roundIndex;
      if (stopTimer) stopTimer();
 
      App.goTo("custom-sudden");
      renderSuddenChrome(room, sd);
      document.getElementById("custom-sudden-round").textContent = `Round ${sd.roundIndex + 1}`;
 
      const amActive = sd.active.includes(myId);
      const stage = document.getElementById("custom-sudden-stage");
      const waitingNote = document.getElementById("custom-sudden-waiting");
      const timerEl = document.getElementById("custom-sudden-timer");
      const country = COUNTRIES.find((c) => c.code === sd.currentCountry);
 
      if (!amActive) {
        stage.innerHTML = `<div class="quiz-flag-big"><span class="${Utils.flagClass(country.code)}"></span></div>`;
        waitingNote.hidden = false;
        waitingNote.textContent = "Waiting for the remaining players to answer…";
        timerEl.textContent = "–";
        return;
      }
 
      waitingNote.hidden = true;
      const controller = QuizUI.render(
        stage,
        country,
        difficulty,
        (correct) => {
          ref.child(`suddenDeath/answers/${myId}`).set(correct);
          waitingNote.hidden = false;
          waitingNote.textContent = "Answer locked in — waiting for the others…";
        },
        sd.currentOptions
      );
      stopTimer = startCountdown(timerEl, sd.startedAt, () => controller.expire());
    }
 
    function renderSuddenChrome(room, sd) {
      const sub = document.getElementById("custom-sudden-sub");
      const amActive = sd.active.includes(myId);
      sub.textContent = amActive
        ? "Tied at the top — get it wrong and you're out."
        : "You're out of the running — watching the tiebreaker.";
 
      const scoreboard = document.getElementById("custom-sudden-scoreboard");
      scoreboard.innerHTML = "";
      Object.entries(room.players).forEach(([id, p]) => {
        const chip = document.createElement("span");
        const stillIn = sd.active.includes(id);
        chip.className = "scoreboard-chip" + (id === myId ? " me" : "") + (stillIn ? "" : " out");
        chip.textContent = p.name;
        scoreboard.appendChild(chip);
      });
    }
 
    function showStandings(room) {
      App.goTo("custom-results");
      const list = document.getElementById("custom-standings-list");
      list.innerHTML = "";
      const entries = Object.entries(room.players);
      entries.sort((a, b) => b[1].score - a[1].score);
 
      if (room.winnerId) {
        const winner = entries.find(([id]) => id === room.winnerId);
        if (winner) {
          const li = document.createElement("li");
          li.className = "winner";
          li.innerHTML = `<span>${winner[1].name} — won the tiebreaker</span><span class="std-score">${winner[1].score}</span>`;
          list.appendChild(li);
        }
                entries.filter(([id]) => id !== room.winnerId).forEach(([, p]) => {
          const li = document.createElement("li");
          li.innerHTML = `<span>${p.name}</span><span class="std-score">${p.score}</span>`;
          list.appendChild(li);
        });
        if (room.winnerId === myId) Utils.confettiBurst();
      } else {
        entries.forEach(([, p], i) => {
          const li = document.createElement("li");
          if (i === 0) li.classList.add("winner");
          li.innerHTML = `<span>${p.name}</span><span class="std-score">${p.score}</span>`;
          list.appendChild(li);
        });
        if (entries.length && entries[0][0] === myId) Utils.confettiBurst();
      }
    }
 
    function leave() {
      if (ref) {
        ref.child(`players/${myId}`).onDisconnect().cancel();
        ref.child(`players/${myId}`).remove();
        if (listener) ref.off("value", listener);
      }
      if (stopTimer) stopTimer();
      if (hostInterval) {
        clearInterval(hostInterval);
        hostInterval = null;
      }
    }
 
    return { create, join, start, leave };
  })();
 
  return { QuickMatch, CustomLobby };
})();
 