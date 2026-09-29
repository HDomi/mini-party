// Rooms live under a secret path segment. The database rules only open the segment that
// matches `/yutnori_key`, so without the key (shipped inside the encrypted bundle) nobody
// can read or write rooms.

/** Also keeps the key a valid RTDB path segment (no `.`, `#`, `$`, `[`, `]`, `/`). */
export const DB_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

export function roomsRoot(key: string | undefined): string {
  if (!key || !DB_KEY_PATTERN.test(key)) throw new Error('database key must be 16-128 chars of A-Z a-z 0-9 _ -')
  return `yutnori/${key}/rooms`
}
