import type { RoomGame } from '@/net/game'
import type { RoomApi } from '@/net/useRoom'
import { applyAction, createGame, RuleError, SLOTS, type Action, type GameState } from './game/rules'
import { MAPS, type MapKind } from './game/world'

export interface TankSettings {
  teamMode: boolean
  map: MapKind
}

/** 로비 자리. `PlayerInfo.team` 에 0~3 은 탱크 자리, 이 값은 관전석이다. */
export const WATCH = SLOTS

export const tank: RoomGame<GameState, Action, TankSettings> = {
  id: 'tank',
  minPlayers: 2,
  maxPlayers: 8,
  defaultSettings: { teamMode: false, map: 'hills' },
  // 빈 탱크 자리부터 채우고, 다 차 있으면 관전석에 앉힌다. 0, 1, 2, 3 순서라 팀전에서도 번갈아 찬다.
  pickTeam(players) {
    const taken = new Set(players.map((p) => p.team))
    for (let s = 0; s < SLOTS; s++) if (!taken.has(s)) return s
    return WATCH
  },
  validateStart(players, s) {
    const seated = players.filter((p) => p.team < SLOTS)
    if (seated.length < 2) return '탱크 자리에 두 명 이상 앉아야 해요'
    if (new Set(seated.map((p) => p.team)).size !== seated.length) return '한 자리에 두 명이 앉아 있어요'
    if (s.teamMode && new Set(seated.map((p) => p.team % 2)).size < 2) return '두 팀에 한 명 이상씩 앉아야 해요'
    return null
  },
  createGame(players, s) {
    return createGame({
      players: players.filter((p) => p.team < SLOTS).map((p) => ({ id: p.id, name: p.name, slot: p.team })),
      teamMode: s.teamMode,
      // 맵 설정이 생기기 전에 만든 방은 언덕으로 한다.
      map: s.map && MAPS[s.map] ? s.map : 'hills',
      seed: Math.floor(Math.random() * 2 ** 32),
    })
  },
  applyAction: (state, action) => applyAction(state, action),
  ruleError: (err) => (err instanceof RuleError ? err.message : null),
  isPlaying: (state, id) => state.tanks.some((t) => t.id === id),
}

export type TankRoomApi = RoomApi<GameState, Action, TankSettings>
