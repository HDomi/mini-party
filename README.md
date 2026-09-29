# super-yutnori

3D multiplayer Yutnori (윷놀이) for friends. React + react-three-fiber, synced through Firebase Realtime Database, hosted on GitHub Pages.

- 2–6 players, free-for-all or teams (2–3 teams), 2–5 pieces per team
- Room codes + share links (`/#/ABCD`), reconnect-safe seats, spectators
- 1:1 against a bot (`/#/bot`, easy / normal / hard), played entirely in the tab with no database traffic
- Whole bundle is encrypted with a password at build time

## Develop

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # rule tests
```

Without `VITE_FIREBASE_DATABASE_URL` the app uses a local backend: open several tabs in the same browser and each tab is a separate player.

To try against a real database, create `.env.local`:

```
VITE_FIREBASE_DATABASE_URL=https://<instance>.firebaseio.com
VITE_DB_KEY=<same value as /yutnori_key in the database>
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml` and publishes to `https://hdomi.github.io/super-yutnori/`.

Repository settings:

- Settings → Pages → Source: **GitHub Actions**
- Secrets (repo or `github-pages` environment):
  - `FIREBASE_DATABASE_URL` — RTDB URL (ends up in the bundle, but encrypted)
  - `DB_KEY` — secret path segment for rooms (ends up in the bundle, but encrypted). Repo-level, since the sweep job needs it too. See [Database rules](#database-rules)
  - `PLAY_PW` — entry password, build-time only

The build fails if `PLAY_PW` is empty on CI, if the password string shows up anywhere in `dist/`, or if `DB_KEY` is missing or malformed.

## Room cleanup

- The last player to leave a room deletes it.
- Each player's `onDisconnect` stamps `lastSeen`, so rooms emptied by closed tabs or dropped connections still get a timestamp.
- `.github/workflows/sweep-rooms.yml` runs `scripts/sweep-rooms.ts` hourly and deletes rooms with nobody online for 30 minutes (or untouched for 24 hours). Run it by hand from the Actions tab with `dry_run` to see what it would delete.

The sweep job doesn't use the `github-pages` environment, so it needs **repo-level** secrets:

- `FIREBASE_SERVICE_ACCOUNT_JSON` — service account key JSON (Firebase console → Project settings → Service accounts → Generate new private key)
- `FIREBASE_DATABASE_URL` — same as above (a repo-level secret or variable)
- `DB_KEY` — same as above

GitHub pauses scheduled workflows after 60 days without repo activity; re-enable it from the Actions tab if that happens.

Outside a room the client closes its RTDB socket (`goOffline`) two seconds after the last listener or write finishes, so tabs left on the home screen don't count against the Spark plan's 100 concurrent connections.

## Sound

`src/ui/sound.ts` plays effects through Web Audio (background music is wired up but commented out for now). Volume starts at 0 and is saved in `localStorage` (`yutnori:volume`); the pill in the top-right corner sets it. Effects ship as `.ogg` and `.m4a` (Safari), converted with `afconvert -f m4af -d aac -b 96000 in.ogg out.m4a`. Sources and licenses are in `public/sfx/CREDITS.txt`.

## Bot

`src/game/bot.ts` has no per-situation rules. On its move it plays out every order of spending the pending results through `applyAction` and scores the resulting boards: each piece's expected throws to finish (solved once by value iteration over the board graph), the chance of being caught next turn, and the chance of catching an opponent. Levels differ in how often they play a random legal move and how much the capture odds count. `npm test` checks that hard beats random play and the easy level.

`src/ui/Solo.tsx` runs the game in React state and feeds `GameView` the same `GameApi` shape `useRoom` provides. The game in progress is kept in `sessionStorage` (`yutnori:solo`) so a reload doesn't lose it.

## Password gate

`scripts/vite-plugin-password-gate.ts` encrypts the single JS bundle with AES-GCM (key from PBKDF2-SHA256, 600k iterations). `dist/` only contains the ciphertext and a small loader that asks for the password and decrypts in the browser. A wrong password shows an alert and closes the tab (or blanks it, since browsers only let scripts close windows they opened). The password is remembered in `sessionStorage` for the tab so reloads don't ask again.

Limits:

- The gate protects the page, and through `DB_KEY` also the database: rooms live under `/yutnori/{DB_KEY}/rooms`, and the rules only open that path. Anyone who can decrypt the bundle (i.e. knows the password) can still pull the key out of it and write to any room.
- The ciphertext is public, so a short password can be brute-forced offline. Use a long one.

## Database rules

Rooms live at `/yutnori/{DB_KEY}/rooms/{CODE}`. The rules compare the path segment with `/yutnori_key`, which no client can read, so without the key nothing under `/yutnori` is readable or writable. The key ships in the bundle, which the password gate encrypts. The sweeper uses a service account and bypasses the rules.

Setup, in this order so the live site keeps working during the switch:

1. Generate a key: `openssl rand -hex 24` (16–128 chars of `A-Z a-z 0-9 _ -`).
2. Add it as the repo-level secret `DB_KEY`, and to `.env.local` as `VITE_DB_KEY` for local testing.
3. Firebase console → Realtime Database → Data: add a root child `yutnori_key` with the key as a string value.
4. Publish these rules. For now keep the old `"rooms": { ... }` entry inside `"yutnori"` next to `"$key"` (a named child wins over the wildcard), so the currently deployed build keeps working. Leave other paths as they are:

```json
"yutnori_key": { ".read": false, ".write": false },
"yutnori": {
  "$key": {
    "rooms": {
      ".indexOn": ["lastSeen"],
      "$code": {
        ".read": "$key === root.child('yutnori_key').val()",
        ".write": "$key === root.child('yutnori_key').val()",
        ".validate": "$code.matches(/^[A-Z0-9]{4}$/) && newData.hasChildren(['createdAt', 'hostId'])",
        "players": {
          "$pid": {
            "name": { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 20" }
          }
        },
        "game": { ".validate": "!newData.exists() || (newData.isString() && newData.val().length < 20000)" }
      }
    }
  }
}
```

5. Push to `main` and wait for the deploy.
6. Remove the old `rooms` entry from the rules and delete the `/yutnori/rooms` data. Nothing reads it any more and the sweeper no longer looks there.

Names are capped at 10 characters in the UI. The rule allows 20 so emoji and other surrogate pairs don't get rejected; it only exists to stop oversized junk.

To rotate the key (e.g. it leaked): change `yutnori_key` and the `DB_KEY` secret, then redeploy. Open rooms are lost.

## Layout

```
src/game/    board graph + pure rules reducer (tested)
src/net/     Firebase / local backends, room hook
src/scene/   three.js scene: board, pieces, trays, yut sticks
src/ui/      home, lobby, in-game HUD, confetti
scripts/     build-time password gate plugin
```
