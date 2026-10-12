import type { RoomGame } from '@/net/game'
import type { RoomApi } from '@/net/useRoom'
import { applyAction, createGame, MAX_PLAYERS, RuleError, type Action, type GameState } from './game/rules'

// 방 설정이 아직 없다. RTDB 는 빈 객체를 저장하지 않아 `room.settings` 가 없을 수 있으므로 읽지 않는다.
export type FrogSettings = Record<string, never>

/** 로비 자리. `PlayerInfo.team` 에 0~3 은 칼 자리, 이 값은 관전석이다. */
export const WATCH = MAX_PLAYERS

export const frog: RoomGame<GameState, Action, FrogSettings> = {
  id: 'frog',
  version: 1,
  minPlayers: 2,
  maxPlayers: 8,
  defaultSettings: {},
  // 빈 자리부터 채우고, 다 차 있으면 관전석에 앉힌다.
  pickTeam(players) {
    const taken = new Set(players.map((p) => p.team))
    for (let s = 0; s < MAX_PLAYERS; s++) if (!taken.has(s)) return s
    return WATCH
  },
  validateStart(players) {
    const seated = players.filter((p) => p.team < MAX_PLAYERS)
    if (seated.length < 2) return '두 명 이상 앉아야 해요'
    if (new Set(seated.map((p) => p.team)).size !== seated.length) return '한 자리에 두 명이 앉아 있어요'
    return null
  },
  createGame(players) {
    return createGame({ players: players.filter((p) => p.team < MAX_PLAYERS).map((p) => ({ id: p.id, name: p.name, slot: p.team })) })
  },
  applyAction: (state, action) => applyAction(state, action),
  ruleError: (err) => (err instanceof RuleError ? err.message : null),
  isPlaying: (state, id) => state.players.includes(id),
}

export type FrogRoomApi = RoomApi<GameState, Action, FrogSettings>
