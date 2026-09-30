import type { RoomGame } from '@/net/game'
import type { RoomApi } from '@/net/useRoom'
import { applyAction, createGame, RuleError, type Action, type GameState, type Rule } from './game/rules'

export interface OmokSettings {
  rule: Rule
}

/** 로비 자리. `PlayerInfo.team` 에 저장한다. */
export const SEAT = { black: 0, white: 1, watch: 2 } as const

export const omok: RoomGame<GameState, Action, OmokSettings> = {
  id: 'omok',
  minPlayers: 2,
  maxPlayers: 8,
  defaultSettings: { rule: 'renju' },
  // 빈 돌 자리부터 채우고, 둘 다 차 있으면 관전석에 앉힌다.
  pickTeam(players) {
    const taken = new Set(players.map((p) => p.team))
    if (!taken.has(SEAT.black)) return SEAT.black
    if (!taken.has(SEAT.white)) return SEAT.white
    return SEAT.watch
  },
  validateStart(players) {
    const black = players.filter((p) => p.team === SEAT.black).length
    const white = players.filter((p) => p.team === SEAT.white).length
    if (black !== 1 || white !== 1) return '흑과 백에 한 명씩 앉아야 해요'
    return null
  },
  createGame(players, s) {
    const black = players.find((p) => p.team === SEAT.black)!
    const white = players.find((p) => p.team === SEAT.white)!
    return createGame({ black, white, rule: s.rule })
  },
  applyAction(state, action) {
    // 무르기는 혼자하기에서만 쓴다. 방에서는 상대 동의 없이 되돌릴 수 없다.
    if (action.type === 'undo') throw new RuleError('여기서는 무를 수 없어요')
    return applyAction(state, action)
  },
  ruleError: (err) => (err instanceof RuleError ? err.message : null),
  isPlaying: (state, id) => state.players.includes(id),
}

export type OmokRoomApi = RoomApi<GameState, Action, OmokSettings>
