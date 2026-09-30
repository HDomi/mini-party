// 방은 비밀 경로 세그먼트 아래에 둔다. 데이터베이스 규칙은 `/miniparty_key`와 일치하는
// 세그먼트만 열어 두므로, 키(암호화된 번들 안에 담겨 배포됨) 없이는 누구도
// 방을 읽거나 쓸 수 없다.

/** 키가 유효한 RTDB 경로 세그먼트가 되도록 보장하는 역할도 한다(`.`, `#`, `$`, `[`, `]`, `/` 불가). */
export const DB_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

export function roomsRoot(key: string | undefined): string {
  if (!key || !DB_KEY_PATTERN.test(key)) throw new Error('database key must be 16-128 chars of A-Z a-z 0-9 _ -')
  return `miniparty/${key}/rooms`
}
