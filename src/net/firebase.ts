import { initializeApp } from 'firebase/app'
import {
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  runTransaction,
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

  subscribe(code: string, cb: (room: RoomData | null) => void) {
    return onValue(ref(this.db, `${ROOT}/${code}`), (snap) => cb(snap.val()))
  }

  async createRoom(code: string, room: RoomData) {
    const res = await runTransaction(ref(this.db, `${ROOT}/${code}`), (cur: RoomData | null) => {
      if (cur && Date.now() - cur.createdAt < ROOM_TTL_MS) return undefined
      return room
    })
    return res.committed
  }

  join(code: string, player: Parameters<Backend['join']>[1]) {
    const playerRef = ref(this.db, `${ROOT}/${code}/players/${player.id}`)
    const unsub = onValue(ref(this.db, '.info/connected'), async (snap) => {
      if (snap.val() !== true) return
      await onDisconnect(playerRef).update({ online: false })
      // `joinedAt` keeps the first value so seat order survives reconnects.
      await runTransaction(playerRef, (cur) => ({
        ...player,
        ...(cur ?? {}),
        name: player.name,
        online: true,
      }))
    })
    return () => {
      unsub()
      void update(playerRef, { online: false })
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
}
