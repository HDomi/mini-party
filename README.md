# super-yutnori

3D multiplayer Yutnori (윷놀이) for friends. React + react-three-fiber, synced through Firebase Realtime Database, hosted on GitHub Pages.

- 2–6 players, free-for-all or teams (2–3 teams), 2–5 pieces per team
- Room codes + share links (`/#/ABCD`), reconnect-safe seats, spectators
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
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml` and publishes to `https://hdomi.github.io/super-yutnori/`.

Repository settings:

- Settings → Pages → Source: **GitHub Actions**
- Secrets (repo or `github-pages` environment):
  - `FIREBASE_DATABASE_URL` — RTDB URL (ends up in the bundle, but encrypted)
  - `PLAY_PW` — entry password, build-time only

The build fails if `PLAY_PW` is empty on CI, and also fails if the password string shows up anywhere in `dist/`.

## Room cleanup

- The last player to leave a room deletes it.
- Each player's `onDisconnect` stamps `lastSeen`, so rooms emptied by closed tabs or dropped connections still get a timestamp.
- `.github/workflows/sweep-rooms.yml` runs `scripts/sweep-rooms.ts` hourly and deletes rooms with nobody online for 30 minutes (or untouched for 24 hours). Run it by hand from the Actions tab with `dry_run` to see what it would delete.

The sweep job doesn't use the `github-pages` environment, so it needs **repo-level** secrets:

- `FIREBASE_SERVICE_ACCOUNT_JSON` — service account key JSON (Firebase console → Project settings → Service accounts → Generate new private key)
- `FIREBASE_DATABASE_URL` — same as above (a repo-level secret or variable)

GitHub pauses scheduled workflows after 60 days without repo activity; re-enable it from the Actions tab if that happens.

Outside a room the client closes its RTDB socket (`goOffline`) two seconds after the last listener or write finishes, so tabs left on the home screen don't count against the Spark plan's 100 concurrent connections.

## Password gate

`scripts/vite-plugin-password-gate.ts` encrypts the single JS bundle with AES-GCM (key from PBKDF2-SHA256, 600k iterations). `dist/` only contains the ciphertext and a small loader that asks for the password and decrypts in the browser. A wrong password shows an alert and closes the tab (or blanks it, since browsers only let scripts close windows they opened). The password is remembered in `sessionStorage` for the tab so reloads don't ask again.

Limits:

- The gate protects the page, not the database. Anyone who has the RTDB URL can read/write `/yutnori/rooms`. Keep the rules scoped to that path.
- The ciphertext is public, so a short password can be brute-forced offline. Use a long one.

## Database rules

The game only touches `/yutnori/rooms/{CODE}`. The `lastSeen` index is required by the room sweeper (its query fails without it). Add this block inside the existing `"rules"` object without replacing other paths:

```json
"yutnori": {
  "rooms": {
    ".indexOn": ["lastSeen"],
    "$code": {
      ".read": true,
      ".write": true,
      ".validate": "$code.matches(/^[A-Z0-9]{4}$/) && newData.hasChildren(['createdAt', 'hostId'])",
      "game": { ".validate": "!newData.exists() || (newData.isString() && newData.val().length < 20000)" }
    }
  }
}
```

## Layout

```
src/game/    board graph + pure rules reducer (tested)
src/net/     Firebase / local backends, room hook
src/scene/   three.js scene: board, pieces, trays, yut sticks
src/ui/      home, lobby, in-game HUD, confetti
scripts/     build-time password gate plugin
```
