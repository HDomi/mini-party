/** `/yacht`, `/yacht/bot`, `/yacht/ABCD`. 1인 플레이 `bot` 은 세 글자라 네 글자 방 코드와 겹치지 않는다. */
export function yachtPath(sub?: string): string {
  return sub ? `/yacht/${sub}` : '/yacht'
}
