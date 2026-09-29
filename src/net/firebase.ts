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

/** Grace period before closing the socket, so back-to-back holds (Home -> room, rename re-join) don't bounce it. */
const IDLE_CLOSE_MS = 2000

export class FirebaseBackend implements Backend {
  readonly kind = 'firebase' as const
  private db: Database
  private root: string

  // Listeners, seats and in-flight writes each hold the connection. The socket closes once the last
  // one lets go, so tabs sitting on Home don't count against the concurrent-connection quota.
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

  /** Holds the connection until `fn` settles. Writes resolve on server ack, so nothing is cut off. */
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
          // Stamps `lastSeen` even when the tab dies, so the sweeper can tell when the room emptied.
          await onDisconnect(roomRef).update({
            [`players/${player.id}/online`]: false,
            lastSeen: serverTimestamp(),
          })
          // `joinedAt` keeps the first value so seat order survives reconnects.
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
      // A transaction rather than update() so a room that is already gone isn't recreated as a stub.
      // The onDisconnect stays armed until this lands, covering us if it never does.
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
        // Only when leaving: a re-join (e.g. after a rename) has already armed its own onDisconnect here.
        .then(() => (leaving ? onDisconnect(roomRef).cancel() : undefined))
        .catch(() => {})
        // Released only now: going offline earlier would drop the leave write and fire the onDisconnect.
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
