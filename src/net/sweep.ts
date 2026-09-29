import type { RoomData } from './types'

/** online인 사람 없이 이 시간이 지난 방은 `scripts/sweep-rooms.ts`가 삭제한다. */
export const ROOM_IDLE_MS = 30 * 60 * 1000

/** 이 시간이 지나면 플레이어가 아직 online으로 보여도 방을 삭제한다(예: onDisconnect가 유실된 경우). */
export const ROOM_STALE_MS = 24 * 60 * 60 * 1000

export function isRoomIdle(room: Partial<RoomData>, now: number): boolean {
  // `lastSeen` 도입 이전의 방과 늦은 쓰기가 남긴 stub은 `createdAt`으로 대신한다.
  const idleFor = now - (room.lastSeen ?? room.createdAt ?? 0)
  if (idleFor > ROOM_STALE_MS) return true
  if (Object.values(room.players ?? {}).some((p) => p.online)) return false
  return idleFor > ROOM_IDLE_MS
}
