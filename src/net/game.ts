import type { PlayerInfo } from './types'

/**
 * 공통 방 계층(`useRoom`)이 게임마다 다르게 해야 하는 것. 게임 상태는 JSON으로 직렬화해 저장한다.
 *
 * - `State`: 한 판의 상태. `apply`는 순수 함수여야 한다(transaction이 재시도하며 여러 번 부른다).
 * - `Action`: 플레이어 입력.
 * - `Settings`: 로비에서 호스트가 고르는 방 설정.
 */
export interface RoomGame<State, Action, Settings extends object> {
  /** `RoomData.gameType` 값. */
  id: string
  /**
   * 게임 상태 형식 버전. 방을 만들 때 `RoomData.gameVersion` 에 저장된다. 상태 모양이 바뀌어 이전 코드와
   * 한 방에서 같이 쓸 수 없게 되면 올린다. 버전이 다른 클라이언트는 자리에 앉지 않고 안내를 본다(`useRoom` 의 `skew`).
   */
  version: number
  maxPlayers: number
  minPlayers: number
  defaultSettings: Settings
  /** 새로 앉는 플레이어의 team. 이미 좌석이 있으면 부르지 않는다. */
  pickTeam(players: PlayerInfo[]): number
  /** 시작할 수 없으면 사용자에게 보일 메시지를 돌려준다. 인원 수는 공통 계층이 먼저 검사한다. */
  validateStart?(players: PlayerInfo[], settings: Settings): string | null
  createGame(players: PlayerInfo[], settings: Settings): State
  /** 규칙 위반이면 throw한다. 사용자에게 보일 위반은 `ruleError`가 메시지로 바꾼다. */
  applyAction(state: State, action: Action, opts: { proxy: boolean }): State
  /** 규칙 위반 에러면 메시지, 아니면(버그) null. */
  ruleError(err: unknown): string | null
  /** `playerId`가 이 판에 참가 중인지. 아니면 관전자다. */
  isPlaying(state: State, playerId: string): boolean
}
