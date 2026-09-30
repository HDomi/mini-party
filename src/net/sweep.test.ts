import { describe, expect, it } from 'vitest'
import { isRoomIdle, ROOM_IDLE_MS, ROOM_STALE_MS } from './sweep'
import type { PlayerInfo } from './types'

const now = 1_000_000_000
const player = (online: boolean): PlayerInfo => ({ id: 'a', name: 'a', team: 0, online, joinedAt: 0 })

describe('isRoomIdle', () => {
  it('keeps rooms with someone online until they go stale', () => {
    const online = { a: player(true) }
    expect(isRoomIdle({ createdAt: 0, lastSeen: now - ROOM_STALE_MS + 1, players: online }, now)).toBe(false)
    expect(isRoomIdle({ createdAt: 0, lastSeen: now - ROOM_STALE_MS - 1, players: online }, now)).toBe(true)
  })

  it('deletes rooms everyone left long enough ago', () => {
    expect(isRoomIdle({ createdAt: 0, lastSeen: now - ROOM_IDLE_MS - 1, players: { a: player(false) } }, now)).toBe(true)
    expect(isRoomIdle({ createdAt: 0, lastSeen: now - ROOM_IDLE_MS + 1, players: { a: player(false) } }, now)).toBe(false)
  })

  it('falls back to createdAt, then treats bare stubs as idle', () => {
    expect(isRoomIdle({ createdAt: now - 1000 }, now)).toBe(false)
    expect(isRoomIdle({ createdAt: now - ROOM_IDLE_MS - 1 }, now)).toBe(true)
    expect(isRoomIdle({ players: { a: player(false) } }, now)).toBe(true)
  })
})
