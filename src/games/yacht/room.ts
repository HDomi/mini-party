import type { RoomGame } from '@/net/game'
import type { RoomApi } from '@/net/useRoom'
import { applyAction, createGame, MAX_PLAYERS, RuleError, type Action, type GameState } from './game/rules'

// 방 설정이 아직 없다. RTDB 는 빈 객체를 저장하지 않아 `room.settings` 가 없을 수 있으므로 읽지 않는다.
export type YachtSettings = Record<string, never>

/** 로비 자리. `PlayerInfo.team` 에 저장한다. */
export const SEAT = { play: 0, watch: 1 } as const

export const yacht: RoomGame<GameState, Action, YachtSettings> = {
  id: 'yacht',
  version: 1,
  minPlayers: 2,
  maxPlayers: 10,
  defaultSettings: {},
  // 참가 자리가 남아 있으면 참가, 다 찼으면 관전.
  pickTeam(players) {
    return players.filter((p) => p.team === SEAT.play).length < MAX_PLAYERS ? SEAT.play : SEAT.watch
  },
  validateStart(players) {
    const n = players.filter((p) => p.team === SEAT.play).length
    if (n < 2) return '두 명 이상 참가해야 해요'
    if (n > MAX_PLAYERS) return `${MAX_PLAYERS}명까지 참가할 수 있어요`
    return null
  },
  createGame(players) {
    return createGame({ players: players.filter((p) => p.team === SEAT.play).map((p) => ({ id: p.id, name: p.name })) })
  },
  applyAction: (state, action) => applyAction(state, action),
  ruleError: (err) => (err instanceof RuleError ? err.message : null),
  isPlaying: (state, id) => state.players.includes(id),
}

export type YachtRoomApi = RoomApi<GameState, Action, YachtSettings>
