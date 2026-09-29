// Deletes rooms nobody has been in for a while. Runs hourly from .github/workflows/sweep-rooms.yml.
// Uses the RTDB REST API with a service-account token: no npm deps, and it bypasses the database rules.
//
//   FIREBASE_SERVICE_ACCOUNT_JSON  service account key (the whole JSON)
//   FIREBASE_DATABASE_URL          https://<instance>.firebaseio.com
//   DB_KEY                         secret path segment, same value as the client's VITE_DB_KEY
//   DRY_RUN=true                   list what would be deleted, delete nothing
import { createSign } from 'node:crypto'
import { roomsRoot } from '../src/net/paths.ts'
import { isRoomIdle, ROOM_IDLE_MS } from '../src/net/sweep.ts'
import type { RoomData } from '../src/net/types.ts'

const BATCH = 200

interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

function env(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`${name} is not set`)
  return v
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  const aud = sa.token_uri ?? 'https://oauth2.googleapis.com/token'
  const now = Math.floor(Date.now() / 1000)
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url')
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud,
    iat: now,
    exp: now + 3600,
  })}`
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url')
  const res = await fetch(aud, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${sig}`,
    }),
  })
  if (!res.ok) throw new Error(`token request failed: ${res.status} ${await res.text()}`)
  return ((await res.json()) as { access_token: string }).access_token
}

async function main() {
  const sa = JSON.parse(env('FIREBASE_SERVICE_ACCOUNT_JSON')) as ServiceAccount
  const base = env('FIREBASE_DATABASE_URL').replace(/\/+$/, '')
  const ROOT = roomsRoot(env('DB_KEY'))
  const dryRun = process.env.DRY_RUN === 'true'
  const auth = { Authorization: `Bearer ${await accessToken(sa)}` }
  const now = Date.now()

  // Rooms without `lastSeen` sort first, so this also picks up old rooms and stubs.
  // Needs `.indexOn: ["lastSeen"]` on /yutnori/$key/rooms, or the server answers 400.
  const query = new URLSearchParams({
    orderBy: JSON.stringify('lastSeen'),
    endAt: String(now - ROOM_IDLE_MS),
    limitToFirst: String(BATCH),
  })
  const res = await fetch(`${base}/${ROOT}.json?${query}`, { headers: auth })
  if (!res.ok) throw new Error(`query failed: ${res.status} ${await res.text()}`)
  const candidates = ((await res.json()) ?? {}) as Record<string, Partial<RoomData>>
  const codes = Object.keys(candidates).filter((code) => isRoomIdle(candidates[code], now))
  console.log(`${Object.keys(candidates).length} candidates, ${codes.length} idle${dryRun ? ' (dry run)' : ''}`)
  if (Object.keys(candidates).length === BATCH) console.warn(`hit the batch limit of ${BATCH}; the rest waits for the next run`)

  let deleted = 0
  for (const code of codes) {
    if (dryRun) {
      console.log(`would delete ${code}`)
      continue
    }
    // Re-read with an ETag and delete only if nothing changed, so a player joining right now keeps the room.
    const url = `${base}/${ROOT}/${code}.json`
    const cur = await fetch(url, { headers: { ...auth, 'X-Firebase-ETag': 'true' } })
    const etag = cur.headers.get('etag')
    if (!cur.ok || !etag) {
      console.warn(`skip ${code}: read failed (${cur.status})`)
      continue
    }
    const room = (await cur.json()) as Partial<RoomData> | null
    if (!room || !isRoomIdle(room, Date.now())) continue
    const del = await fetch(url, { method: 'DELETE', headers: { ...auth, 'if-match': etag } })
    if (del.ok) {
      deleted++
      console.log(`deleted ${code}`)
    } else if (del.status === 412) {
      console.log(`skip ${code}: changed while sweeping`)
    } else {
      console.warn(`skip ${code}: delete failed (${del.status})`)
    }
  }
  if (!dryRun) console.log(`deleted ${deleted}/${codes.length}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
