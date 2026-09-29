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

## Password gate

`scripts/vite-plugin-password-gate.ts` encrypts the single JS bundle with AES-GCM (key from PBKDF2-SHA256, 600k iterations). `dist/` only contains the ciphertext and a small loader that asks for the password and decrypts in the browser. A wrong password shows an alert and closes the tab (or blanks it, since browsers only let scripts close windows they opened). The password is remembered in `sessionStorage` for the tab so reloads don't ask again.

Limits:

- The gate protects the page, not the database. Anyone who has the RTDB URL can read/write `/yutnori/rooms`. Keep the rules scoped to that path.
- The ciphertext is public, so a short password can be brute-forced offline. Use a long one.

## Database rules

The game only touches `/yutnori/rooms/{CODE}`. Add this block inside the existing `"rules"` object without replacing other paths:

```json
"yutnori": {
  "rooms": {
    "$code": {
      ".read": true,
      ".write": true,
      ".validate": "$code.matches(/^[A-Z0-9]{4}$/)"
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
