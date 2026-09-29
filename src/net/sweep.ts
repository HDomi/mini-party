import type { RoomData } from './types'

/** Rooms with nobody online for this long get deleted by `scripts/sweep-rooms.ts`. */
export const ROOM_IDLE_MS = 30 * 60 * 1000

/** Past this, a room goes even if a player still reads as online (a lost onDisconnect, say). */
export const ROOM_STALE_MS = 24 * 60 * 60 * 1000

export function isRoomIdle(room: Partial<RoomData>, now: number): boolean {
  // Rooms from before `lastSeen` existed, and stubs left by late writes, fall back to `createdAt`.
  const idleFor = now - (room.lastSeen ?? room.createdAt ?? 0)
  if (idleFor > ROOM_STALE_MS) return true
  if (Object.values(room.players ?? {}).some((p) => p.online)) return false
  return idleFor > ROOM_IDLE_MS
}
