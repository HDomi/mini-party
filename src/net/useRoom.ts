import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { applyAction, createGame, RuleError, type Action, type GameState } from '../game/rules'
import { backend, playerId } from './index'
import type { PlayerInfo, RoomData, RoomSettings } from './types'

export function useRoom(code: string, name: string) {
  const [room, setRoom] = useState<RoomData | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [connError, setConnError] = useState<string | null>(null)

  useEffect(() => {
    setConnError(null)
    // RTDB는 연결하지 못하면(예: 연결 한도 초과) 조용히 재시도만 계속하므로 직접 타임아웃을 건다.
    const timer = window.setTimeout(() => setConnError('서버 응답이 없어요. 잠시 후 다시 시도해 주세요'), 10_000)
    const unsub = backend.subscribe(
      code,
      (r) => {
        window.clearTimeout(timer)
        setConnError(null)
        setRoom(r)
      },
      (err) => {
        window.clearTimeout(timer)
        console.error('room subscription cancelled', err)
        setConnError('서버에 연결하지 못했어요')
      },
    )
    return () => {
      window.clearTimeout(timer)
      unsub()
    }
  }, [code])

  const players = useMemo(
    () => Object.values(room?.players ?? {}).sort((a, b) => a.joinedAt - b.joinedAt),
    [room?.players],
  )
  const game = useMemo<GameState | null>(() => (room?.game ? JSON.parse(room.game) : null), [room?.game])
  const me = room?.players?.[playerId]
  const inGame = !!game && playerId in game.names

  // layout effect는 passive cleanup보다 먼저 실행되므로, 아래 join cleanup이 새로 들어온 이름을 본다.
  const latestName = useRef(name)
  useLayoutEffect(() => {
    latestName.current = name
  }, [name])

  // 방이 로비 상태일 때 플레이어를 앉힌다. 이미 좌석이 있으면 언제든 다시 연결한다.
  const canSeat = !!room && (!!me || (!game && players.length < 6))
  useEffect(() => {
    if (!canSeat || !name) return
    const taken = new Set(players.map((p) => p.team))
    const team = me?.team ?? [0, 1, 2, 3, 4, 5].find((t) => !taken.has(t)) ?? 0
    const info: PlayerInfo = { id: playerId, name, team, online: true, joinedAt: me?.joinedAt ?? Date.now() }
    const stop = backend.join(code, info, (err) => {
      console.error('join failed', err)
      setConnError('방에 들어가지 못했어요')
    })
    // 이름 변경은 나가지 않고 이 effect를 다시 실행한다. 언마운트나 방 전환이 실제로 나가는 경우다.
    return () => stop(latestName.current === name)
    // 방이 업데이트될 때마다가 아니라 좌석 자체가 바뀔 때만 다시 실행한다.
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

  // 서버가 쓰기를 거부하면 reject된다. unhandled rejection으로 두지 않고 화면에 알린다.
  const guard = useCallback(
    async <T,>(p: Promise<T>): Promise<T | undefined> => {
      try {
        return await p
      } catch (err) {
        console.error(err)
        flash('서버와 통신하지 못했어요')
        return undefined
      }
    },
    [flash],
  )

  const act = useCallback(
    async (action: Action, proxy = false) => {
      let err: string | null = null
      await guard(backend.transactGame(code, (cur) => {
        err = null
        if (!cur) return undefined
        try {
          return JSON.stringify(applyAction(JSON.parse(cur), action, { proxy }))
        } catch (e) {
          if (e instanceof RuleError) err = e.message
          else throw e
          return undefined
        }
      }))
      if (err) flash(err)
    },
    [code, flash, guard],
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
    await guard(backend.transactGame(code, () => JSON.stringify(game)))
  }, [room, players, code, flash, guard])

  const toLobby = useCallback(() => guard(backend.transactGame(code, () => null)), [code, guard])
  const updatePlayerTeam = useCallback(
    (id: string, team: number) => guard(backend.updatePlayer(code, id, { team })),
    [code, guard],
  )
  const setSettings = useCallback((patch: Partial<RoomSettings>) => guard(backend.updateSettings(code, patch)), [code, guard])
  const deleteRoom = useCallback(() => guard(backend.deleteRoom(code)), [code, guard])

  return { room, players, game, me, inGame, hostId, error, connError, act, start, toLobby, updatePlayerTeam, setSettings, deleteRoom, flash }
}

export type RoomApi = ReturnType<typeof useRoom>
