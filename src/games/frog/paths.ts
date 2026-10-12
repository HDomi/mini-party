/** `/frog`, `/frog/bot`, `/frog/ABCD`. 1인 플레이 `bot` 은 세 글자라 네 글자 방 코드와 겹치지 않는다. */
export function frogPath(sub?: string): string {
  return sub ? `/frog/${sub}` : '/frog'
}
