// 방을 만든 코드와 지금 코드의 게임 상태 형식 버전 비교. 배포 전에 열어 둔 탭(옛 코드)과 새 코드가
// 한 방에 들어가면 서로 다른 형식으로 상태를 쓰고 읽어 판이 깨진다.

/** `reload`: 방이 더 새 버전이라 내가 새로고침해야 한다. `old-room`: 방이 이전 버전이라 새로 만들어야 한다. */
export type RoomSkew = 'reload' | 'old-room'

/** 버전을 저장하기 전에 만든 방은 비교하지 않는다(형식은 게임이 따로 확인한다). */
export function roomSkew(roomVersion: number | undefined, mine: number): RoomSkew | null {
  if (roomVersion === undefined || roomVersion === mine) return null
  return roomVersion > mine ? 'reload' : 'old-room'
}

export const SKEW_TEXT: Record<RoomSkew, { title: string; body: string }> = {
  reload: {
    title: '새 버전이 나왔어요',
    body: '이 방은 새 버전으로 만들어졌어요. 새로고침하면 들어갈 수 있어요.',
  },
  'old-room': {
    title: '이전 버전으로 만든 방이에요',
    body: '방을 만든 사람이 이전 버전을 쓰고 있어요. 모두 새로고침한 뒤 방을 새로 만들어 주세요.',
  },
}
