# Flagged 🚩

A flag-guessing game: single player (all 197 countries), quick-match 1v1, and
a custom lobby for 2–4 players with sudden death on a tie. Pure static
site — hosts for free on GitHub Pages. Multiplayer uses Firebase's free
Realtime Database.

## 1. Try it locally first

You can't just double-click `index.html` — the browser blocks some of this
from a `file://` URL. Serve it locally instead:

```bash
cd flag-game
python3 -m http.server 8000
# then open http://localhost:8000
```

Single player works immediately. Multiplayer will show a banner until you
connect Firebase (next step).

## 2. Connect Firebase (for multiplayer)

1. Go to <https://console.firebase.google.com>, sign in, **Add project**
   (free "Spark" plan — no card required).
2. Once created, click the **</>** (web) icon to register a web app. Give it
   any nickname. It'll show you a `firebaseConfig` object — copy it.
3. In the left sidebar go to **Build → Realtime Database → Create Database**.
   Pick a location, and start in **test mode** (lets anyone read/write —
   fine for a small personal project; see the security note below).
4. Open `js/firebase-config.js` in this project and replace the placeholder
   `firebaseConfig` object with the one Firebase gave you.
5. Refresh the page — the multiplayer warning banner should disappear.

### Security note

Test mode means anyone with your database URL can read/write it. That's
normal for a hobby project like this, but if you want to lock it down a
little, go to **Realtime Database → Rules** and use something like:

```json
{
  "rules": {
    "quickQueue": { ".read": true, ".write": true },
    "duelRooms": { ".read": true, ".write": true },
    "lobbies": { ".read": true, ".write": true }
  }
}
```

(That's still open — proper per-user auth is out of scope for a project
like this, but it keeps the rest of your Firebase project closed off.)

## 3. Host it on GitHub Pages

1. Create a new GitHub repo and push this folder's contents to it (make sure
   `index.html` sits at the repo root, or inside `/docs`).
2. In the repo: **Settings → Pages → Source**, pick the branch (`main`) and
   folder (`/root` or `/docs`), save.
3. GitHub gives you a URL like `https://yourname.github.io/repo-name/` —
   that's your live game.

Since `js/firebase-config.js` will contain your Firebase **web** config
(not a secret key — it's meant to be public, Firebase's security comes from
the Realtime Database rules, not from hiding this file), it's fine to commit
it and push it to a public repo.

## How the modes work

- **Single player** — shuffles all 197 countries, one at a time. Pick
  multiple choice (see a name, tap the right flag) or type-the-name. "End
  quiz now" shows your results based on progress so far.
- **Quick match** — pick a difficulty and hit Find opponent. The app checks
  Firebase for someone else waiting with the same difficulty; if found, you're
  matched into a 15-flag duel instantly, otherwise you wait for the next
  person who does the same. Both players answer the same 15 flags at their
  own pace; higher score wins, equal score is a tie.
- **Custom lobby** — create a room (get a 5-character code) or join one with
  a code, up to 4 players. Host picks *All countries* (highest score wins,
  ties stand) or *15 flags* (if the top scorers tie, they go to sudden death:
  one new flag at a time, anyone who gets it wrong drops out, last one
  standing wins).

## Known limitations (fine for a personal project, worth knowing)

- No accounts/auth — names are just whatever you type, nothing stops someone
  from impersonating or spamming rooms.
- No reconnect handling — closing the tab mid-game doesn't let you rejoin;
  your opponent just sees you as "left."
- Old queue entries / finished rooms aren't cleaned up automatically. On the
  free tier this won't matter for casual use, but if you want it tidy, add a
  scheduled Cloud Function later to prune anything older than a day.
- Sudden death resolution is handled client-side with a Firebase transaction
  to avoid double-processing — solid for 2–4 friends, not built to survive
  intentional cheating.

## File structure

```
index.html
css/style.css
js/
  countries.js       197 countries + ISO codes (matches flag-icons classes)
  utils.js           shuffle, string normalization, room codes
  firebase-config.js Your Firebase project config goes here
  quiz-ui.js          renders one question (multiple choice or type-answer)
  singleplayer.js     single-player game loop
  multiplayer.js      quick match + custom lobby (Firebase Realtime DB)
  app.js              screen navigation + wiring buttons
```
