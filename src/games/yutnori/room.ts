import type { RoomGame } from '@/net/game'
import type { RoomApi } from '@/net/useRoom'
import { applyAction, createGame, RuleError, TEAM_COLORS, type Action, type GameState } from './game/rules'

export interface YutSettings {
  teamMode: boolean
  teamCount: number
  piecesPerTeam: number
}

export const yutnori: RoomGame<GameState, Action, YutSettings> = {
  id: 'yutnori',
  version: 1,
  minPlayers: 2,
  maxPlayers: TEAM_COLORS.length,
  defaultSettings: { teamMode: false, teamCount: 2, piecesPerTeam: 4 },
  pickTeam(players) {
    const taken = new Set(players.map((p) => p.team))
    const free = TEAM_COLORS.findIndex((_, t) => !taken.has(t))
    return free === -1 ? 0 : free
  },
  validateStart(players, s) {
    if (s.teamMode && new Set(players.map((p) => p.team % s.teamCount)).size < 2) return '팀이 두 개 이상 있어야 해요'
    return null
  },
  createGame(players, s) {
    return createGame({
      players: players.map((p) => ({ id: p.id, name: p.name, team: s.teamMode ? p.team % s.teamCount : 0 })),
      teamMode: s.teamMode,
      piecesPerTeam: s.piecesPerTeam,
    })
  },
  applyAction: (state, action, { proxy }) => applyAction(state, action, { proxy }),
  ruleError: (err) => (err instanceof RuleError ? err.message : null),
  isPlaying: (state, id) => id in state.names,
}

export type YutRoomApi = RoomApi<GameState, Action, YutSettings>
