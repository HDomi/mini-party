export interface PlayerInfo {
  id: string
  name: string
  team: number
  online: boolean
  joinedAt: number
}

/** 게임별 방 설정. 각 게임이 자기 형태를 정하고, 공통 계층은 내용을 모른다. */
export type RoomSettings = Record<string, unknown>

export interface RoomData<S extends object = RoomSettings> {
  /** 이 방에서 하는 게임. 방 코드는 게임끼리 공유하므로 코드만으로 어느 게임인지 알 수 있다. */
  gameType: string
  createdAt: number
  hostId: string
  settings: S
  players?: Record<string, PlayerInfo>
  /** 직렬화된 게임 상태. RTDB의 배열/null 관련 특이 동작을 피하려고 문자열로 저장한다. */
  game?: string | null
  /** 플레이어가 마지막으로 오프라인이 된 시각. `scripts/sweep-rooms.ts`가 ROOM_IDLE_MS 넘게 비어 있던 방을 삭제한다. */
  lastSeen?: number
}

export interface Backend {
  readonly kind: 'firebase' | 'local'
  /** 서버가 리스너를 취소하면(예: 권한 거부) `onError`가 호출된다. */
  subscribe(code: string, cb: (room: RoomData | null) => void, onError?: (err: Error) => void): () => void
  /** 같은 코드를 쓰는 만료 전 방이 이미 있으면 만들지 않고, 없으면 방을 만든다. */
  createRoom(code: string, room: RoomData): Promise<boolean>
  /**
   * 플레이어를 등록하고, 반환된 fn이 호출될 때까지 `online`을 동기화한다.
   * 플레이어가 방을 완전히 떠날 때는 `leaving = true`를 넘긴다. 마지막으로 나가는 사람이 방을 삭제한다.
   */
  join(code: string, player: PlayerInfo, onError?: (err: Error) => void): (leaving: boolean) => void
  updatePlayer(code: string, id: string, patch: Partial<PlayerInfo>): Promise<void>
  updateSettings(code: string, patch: RoomSettings): Promise<void>
  /** 게임의 원자적 read-modify-write. fn에서 undefined를 반환하면 중단한다. */
  transactGame(code: string, fn: (game: string | null) => string | null | undefined): Promise<boolean>
  deleteRoom(code: string): Promise<void>
}

export const ROOM_TTL_MS = 12 * 60 * 60 * 1000
