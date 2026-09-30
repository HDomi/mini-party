/** `/yut`, `/yut/bot`, `/yut/ABCD`. 1인 플레이 `bot` 은 세 글자라 네 글자 방 코드와 겹치지 않는다. */
export function yutPath(sub?: string): string {
  return sub ? `/yut/${sub}` : '/yut'
}
