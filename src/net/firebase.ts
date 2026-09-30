import { initializeApp } from 'firebase/app'
import {
  getDatabase,
  goOffline,
  goOnline,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  update,
  type Database,
} from 'firebase/database'
import { roomsRoot } from './paths'
import { ROOM_TTL_MS, type Backend, type RoomData } from './types'

/** 소켓을 닫기 전 유예 시간. 연달아 오는 hold(Home -> 방, 이름 변경 후 재입장)에 소켓이 끊겼다 붙지 않게 한다. */
const IDLE_CLOSE_MS = 2000

export class FirebaseBackend implements Backend {
  readonly kind = 'firebase' as const
  private db: Database
  private root: string

  // 리스너, 좌석, 진행 중인 쓰기가 각각 연결을 잡는다. 마지막 하나까지 놓으면 소켓을 닫으므로
  // Home에 머물러 있는 탭은 동시 연결 한도에 잡히지 않는다.
  private holds = 0
  private idleTimer: ReturnType<typeof setTimeout> | undefined

  constructor(databaseURL: string, key: string | undefined) {
    this.root = roomsRoot(key)
    const app = initializeApp({ databaseURL })
    this.db = getDatabase(app)
  }

  private hold() {
    clearTimeout(this.idleTimer)
    if (this.holds++ === 0) goOnline(this.db)
  }

  private release() {
    if (--this.holds > 0) return
    this.idleTimer = setTimeout(() => goOffline(this.db), IDLE_CLOSE_MS)
  }

  /** `fn`이 끝날 때까지 연결을 유지한다. 쓰기는 서버 ack 시점에 resolve되므로 중간에 끊기는 것이 없다. */
  private async held<T>(fn: () => Promise<T>): Promise<T> {
    this.hold()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  subscribe(code: string, cb: (room: RoomData | null) => void, onError?: (err: Error) => void) {
    this.hold()
    const unsub = onValue(
      ref(this.db, `${this.root}/${code}`),
      (snap) => cb(snap.val()),
      (err) => onError?.(err),
    )
    let released = false
    return () => {
      unsub()
      if (released) return
      released = true
      this.release()
    }
  }

  createRoom(code: string, room: RoomData) {
    return this.held(async () => {
      const res = await runTransaction(ref(this.db, `${this.root}/${code}`), (cur: RoomData | null) => {
        if (cur && Date.now() - cur.createdAt < ROOM_TTL_MS) return undefined
        return room
      })
      return res.committed
    })
  }

  join(code: string, player: Parameters<Backend['join']>[1], onError?: (err: Error) => void) {
    const roomRef = ref(this.db, `${this.root}/${code}`)
    const playerRef = ref(this.db, `${this.root}/${code}/players/${player.id}`)
    this.hold()
    const unsub = onValue(
      ref(this.db, '.info/connected'),
      async (snap) => {
        if (snap.val() !== true) return
        try {
          // 탭이 죽어도 `lastSeen`을 기록해 sweeper가 방이 언제 비었는지 알 수 있게 한다.
          await onDisconnect(roomRef).update({
            [`players/${player.id}/online`]: false,
            lastSeen: serverTimestamp(),
          })
          // `joinedAt`은 처음 값을 유지해 재연결 후에도 좌석 순서가 그대로 남는다.
          await runTransaction(playerRef, (cur) => ({
            ...player,
            ...(cur ?? {}),
            name: player.name,
            online: true,
          }))
        } catch (err) {
          onError?.(err as Error)
        }
      },
      (err) => onError?.(err),
    )
    return (leaving: boolean) => {
      unsub()
      // 이미 사라진 방이 stub으로 다시 생기지 않도록 update() 대신 transaction을 쓴다.
      // 이 쓰기가 반영될 때까지 onDisconnect는 걸린 채로 남아, 끝내 반영되지 않는 경우에 대비한다.
      runTransaction(roomRef, (cur: RoomData | null) => {
        if (!cur) return null
        const players = cur.players ?? {}
        if (!players[player.id]) return undefined
        const othersOnline = Object.values(players).some((p) => p.id !== player.id && p.online)
        if (leaving && !othersOnline) return null
        return {
          ...cur,
          players: { ...players, [player.id]: { ...players[player.id], online: false } },
          lastSeen: Date.now(),
        }
      })
        // 나갈 때만 취소한다. 재입장(예: 이름 변경 후)은 이미 여기에 자기 onDisconnect를 걸어 두었다.
        .then(() => (leaving ? onDisconnect(roomRef).cancel() : undefined))
        .catch(() => {})
        // 이 시점에야 release한다. 더 일찍 오프라인이 되면 나가기 쓰기가 유실되고 onDisconnect가 실행된다.
        .finally(() => this.release())
    }
  }

  updatePlayer(code: string, id: string, patch: object) {
    return this.held(() => update(ref(this.db, `${this.root}/${code}/players/${id}`), patch))
  }

  updateSettings(code: string, patch: object) {
    return this.held(() => update(ref(this.db, `${this.root}/${code}/settings`), patch))
  }

  transactGame(code: string, fn: (game: string | null) => string | null | undefined) {
    return this.held(async () => {
      const res = await runTransaction(ref(this.db, `${this.root}/${code}/game`), (cur: string | null) => fn(cur ?? null))
      return res.committed
    })
  }

  deleteRoom(code: string) {
    return this.held(() => remove(ref(this.db, `${this.root}/${code}`)))
  }
}
