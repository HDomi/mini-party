import { ROOM_TTL_MS, type Backend, type PlayerInfo, type RoomData, type RoomSettings } from './types'

// 개발용 backend: 방은 localStorage에 저장하고 탭끼리는 BroadcastChannel로 동기화한다.
// 같은 브라우저에서 탭을 여러 개 열면 혼자서 대전할 수 있다.

const key = (code: string) => `yutnori:room:${code}`

export class LocalBackend implements Backend {
  readonly kind = 'local' as const
  private channel = new BroadcastChannel('yutnori')
  private listeners = new Map<string, Set<(room: RoomData | null) => void>>()

  constructor() {
    // localStorage의 탭 간 동기화는 늦게 일어나므로 메시지에 방 데이터 자체를 싣는다.
    this.channel.onmessage = (e: MessageEvent<{ code: string; raw: string | null }>) => {
      const { code, raw } = e.data
      if (raw === null) localStorage.removeItem(key(code))
      else if (localStorage.getItem(key(code)) !== raw) localStorage.setItem(key(code), raw)
      this.emit(code, raw === null ? null : (JSON.parse(raw) as RoomData))
    }
  }

  private read(code: string): RoomData | null {
    const raw = localStorage.getItem(key(code))
    return raw ? (JSON.parse(raw) as RoomData) : null
  }

  private write(code: string, room: RoomData) {
    const raw = JSON.stringify(room)
    localStorage.setItem(key(code), raw)
    this.channel.postMessage({ code, raw })
    this.emit(code, room)
  }

  private emit(code: string, room: RoomData | null) {
    this.listeners.get(code)?.forEach((cb) => cb(room && structuredClone(room)))
  }

  private mutate(code: string, fn: (room: RoomData) => void) {
    const room = this.read(code)
    if (!room) return
    fn(room)
    this.write(code, room)
  }

  subscribe(code: string, cb: (room: RoomData | null) => void) {
    if (!this.listeners.has(code)) this.listeners.set(code, new Set())
    this.listeners.get(code)!.add(cb)
    queueMicrotask(() => cb(this.read(code)))
    return () => {
      this.listeners.get(code)?.delete(cb)
    }
  }

  async createRoom(code: string, room: RoomData) {
    const cur = this.read(code)
    if (cur && Date.now() - cur.createdAt < ROOM_TTL_MS) return false
    this.write(code, room)
    return true
  }

  join(code: string, player: PlayerInfo) {
    this.mutate(code, (room) => {
      const cur = room.players?.[player.id]
      room.players = { ...room.players, [player.id]: { ...player, ...cur, name: player.name, online: true } }
    })
    const offline = () =>
      this.mutate(code, (room) => {
        if (!room.players?.[player.id]) return
        room.players[player.id].online = false
        room.lastSeen = Date.now()
      })
    window.addEventListener('pagehide', offline)
    return (leaving: boolean) => {
      window.removeEventListener('pagehide', offline)
      const others = Object.values(this.read(code)?.players ?? {}).some((p) => p.id !== player.id && p.online)
      if (leaving && !others) void this.deleteRoom(code)
      else offline()
    }
  }

  async updatePlayer(code: string, id: string, patch: Partial<PlayerInfo>) {
    this.mutate(code, (room) => {
      if (room.players?.[id]) room.players[id] = { ...room.players[id], ...patch }
    })
  }

  async updateSettings(code: string, patch: Partial<RoomSettings>) {
    this.mutate(code, (room) => {
      room.settings = { ...room.settings, ...patch }
    })
  }

  async deleteRoom(code: string) {
    localStorage.removeItem(key(code))
    this.channel.postMessage({ code, raw: null })
    this.emit(code, null)
  }

  async transactGame(code: string, fn: (game: string | null) => string | null | undefined) {
    const room = this.read(code)
    if (!room) return false
    const next = fn(room.game ?? null)
    if (next === undefined) return false
    room.game = next
    this.write(code, room)
    return true
  }
}
