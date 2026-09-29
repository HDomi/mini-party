import { initializeApp } from 'firebase/app'
import {
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  update,
  type Database,
} from 'firebase/database'
import { ROOM_TTL_MS, type Backend, type RoomData } from './types'

const ROOT = 'yutnori/rooms'

export class FirebaseBackend implements Backend {
  readonly kind = 'firebase' as const
  private db: Database

  constructor(databaseURL: string) {
    const app = initializeApp({ databaseURL })
    this.db = getDatabase(app)
  }

  subscribe(code: string, cb: (room: RoomData | null) => void, onError?: (err: Error) => void) {
    return onValue(
      ref(this.db, `${ROOT}/${code}`),
      (snap) => cb(snap.val()),
      (err) => onError?.(err),
    )
  }

  async createRoom(code: string, room: RoomData) {
    const res = await runTransaction(ref(this.db, `${ROOT}/${code}`), (cur: RoomData | null) => {
      if (cur && Date.now() - cur.createdAt < ROOM_TTL_MS) return undefined
      return room
    })
    return res.committed
  }

  join(code: string, player: Parameters<Backend['join']>[1], onError?: (err: Error) => void) {
    const roomRef = ref(this.db, `${ROOT}/${code}`)
    const playerRef = ref(this.db, `${ROOT}/${code}/players/${player.id}`)
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
    }
  }

  async updatePlayer(code: string, id: string, patch: object) {
    await update(ref(this.db, `${ROOT}/${code}/players/${id}`), patch)
  }

  async updateSettings(code: string, patch: object) {
    await update(ref(this.db, `${ROOT}/${code}/settings`), patch)
  }

  async transactGame(code: string, fn: (game: string | null) => string | null | undefined) {
    const res = await runTransaction(ref(this.db, `${ROOT}/${code}/game`), (cur: string | null) => fn(cur ?? null))
    return res.committed
  }

  async deleteRoom(code: string) {
    await remove(ref(this.db, `${ROOT}/${code}`))
  }
}
