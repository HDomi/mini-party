import { useCallback, useEffect, useMemo, useState } from 'react'
import { applyAction, createGame, RuleError, type Action, type GameState } from '../game/rules'
import { backend, playerId } from './index'
import type { PlayerInfo, RoomData, RoomSettings } from './types'

export function useRoom(code: string, name: string) {
  const [room, setRoom] = useState<RoomData | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => backend.subscribe(code, setRoom), [code])

  const players = useMemo(
    () => Object.values(room?.players ?? {}).sort((a, b) => a.joinedAt - b.joinedAt),
    [room?.players],
  )
  const game = useMemo<GameState | null>(() => (room?.game ? JSON.parse(room.game) : null), [room?.game])
  const me = room?.players?.[playerId]
  const inGame = !!game && playerId in game.names

  // Seat the player while the room is in the lobby; reconnect them whenever they already have a seat.
  const canSeat = !!room && (!!me || (!game && players.length < 6))
  useEffect(() => {
    if (!canSeat || !name) return
    const taken = new Set(players.map((p) => p.team))
    const team = me?.team ?? [0, 1, 2, 3, 4, 5].find((t) => !taken.has(t)) ?? 0
    const info: PlayerInfo = { id: playerId, name, team, online: true, joinedAt: me?.joinedAt ?? Date.now() }
    return backend.join(code, info)
    // Only re-run when the seat itself changes, not on every room update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, canSeat, name])

  const hostId = useMemo(() => {
    if (!room) return null
    if (room.players?.[room.hostId]?.online) return room.hostId
    return players.find((p) => p.online)?.id ?? room.hostId
  }, [room, players])

  const flash = useCallback((msg: string) => {
    setError(msg)
    window.setTimeout(() => setError((cur) => (cur === msg ? null : cur)), 2200)
  }, [])

  const act = useCallback(
    async (action: Action, proxy = false) => {
      let err: string | null = null
      await backend.transactGame(code, (cur) => {
        err = null
        if (!cur) return undefined
        try {
          return JSON.stringify(applyAction(JSON.parse(cur), action, { proxy }))
        } catch (e) {
          if (e instanceof RuleError) err = e.message
          else throw e
          return undefined
        }
      })
      if (err) flash(err)
    },
    [code, flash],
  )

  const start = useCallback(async () => {
    if (!room) return
    const s = room.settings
    const seated = players.filter((p) => p.online)
    if (seated.length < 2) return flash('2명 이상 있어야 시작할 수 있어요')
    if (s.teamMode && new Set(seated.map((p) => p.team % s.teamCount)).size < 2) {
      return flash('팀이 두 개 이상 있어야 해요')
    }
    const game = createGame({
      players: seated.map((p) => ({ id: p.id, name: p.name, team: s.teamMode ? p.team % s.teamCount : 0 })),
      teamMode: s.teamMode,
      piecesPerTeam: s.piecesPerTeam,
    })
    await backend.transactGame(code, () => JSON.stringify(game))
  }, [room, players, code, flash])

  const toLobby = useCallback(() => backend.transactGame(code, () => null), [code])
  const updatePlayerTeam = useCallback((id: string, team: number) => backend.updatePlayer(code, id, { team }), [code])
  const setSettings = useCallback((patch: Partial<RoomSettings>) => backend.updateSettings(code, patch), [code])
  const deleteRoom = useCallback(() => backend.deleteRoom(code), [code])

  return { room, players, game, me, inGame, hostId, error, act, start, toLobby, updatePlayerTeam, setSettings, deleteRoom, flash }
}

export type RoomApi = ReturnType<typeof useRoom>
