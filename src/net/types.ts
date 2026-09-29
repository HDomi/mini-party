export interface PlayerInfo {
  id: string
  name: string
  team: number
  online: boolean
  joinedAt: number
}

export interface RoomSettings {
  teamMode: boolean
  teamCount: number
  piecesPerTeam: number
}

export interface RoomData {
  createdAt: number
  hostId: string
  settings: RoomSettings
  players?: Record<string, PlayerInfo>
  /** Serialized GameState. Stored as a string to dodge RTDB's array/null quirks. */
  game?: string | null
  /** When a player last went offline. `scripts/sweep-rooms.ts` deletes rooms idle past ROOM_IDLE_MS. */
  lastSeen?: number
}

export interface Backend {
  readonly kind: 'firebase' | 'local'
  /** `onError` fires when the listener is cancelled by the server (e.g. permission denied). */
  subscribe(code: string, cb: (room: RoomData | null) => void, onError?: (err: Error) => void): () => void
  /** Creates the room unless a fresh one already uses the code. */
  createRoom(code: string, room: RoomData): Promise<boolean>
  /**
   * Registers the player and keeps `online` in sync until the returned fn is called.
   * Pass `leaving = true` when the player is leaving the room for good: the last one out deletes it.
   */
  join(code: string, player: PlayerInfo, onError?: (err: Error) => void): (leaving: boolean) => void
  updatePlayer(code: string, id: string, patch: Partial<PlayerInfo>): Promise<void>
  updateSettings(code: string, patch: Partial<RoomSettings>): Promise<void>
  /** Atomic read-modify-write of the game. Return undefined from fn to abort. */
  transactGame(code: string, fn: (game: string | null) => string | null | undefined): Promise<boolean>
  deleteRoom(code: string): Promise<void>
}

export const ROOM_TTL_MS = 12 * 60 * 60 * 1000
