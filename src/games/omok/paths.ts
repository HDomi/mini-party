/** `/omok`, `/omok/bot`, `/omok/ABCD`. 1인 플레이 `bot` 은 세 글자라 네 글자 방 코드와 겹치지 않는다. */
export function omokPath(sub?: string): string {
  return sub ? `/omok/${sub}` : '/omok'
}
