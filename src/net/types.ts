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
}

export interface Backend {
  readonly kind: 'firebase' | 'local'
  subscribe(code: string, cb: (room: RoomData | null) => void): () => void
  /** Creates the room unless a fresh one already uses the code. */
  createRoom(code: string, room: RoomData): Promise<boolean>
  /** Registers the player and keeps `online` in sync until the returned fn is called. */
  join(code: string, player: PlayerInfo): () => void
  updatePlayer(code: string, id: string, patch: Partial<PlayerInfo>): Promise<void>
  updateSettings(code: string, patch: Partial<RoomSettings>): Promise<void>
  /** Atomic read-modify-write of the game. Return undefined from fn to abort. */
  transactGame(code: string, fn: (game: string | null) => string | null | undefined): Promise<boolean>
  deleteRoom(code: string): Promise<void>
}

export const ROOM_TTL_MS = 12 * 60 * 60 * 1000
