// 빌드 버전과 새 배포 확인. 이 앱은 한 번 열면 페이지를 다시 불러오지 않으므로, 배포 전에 열어 둔 탭은
// 새로고침할 때까지 옛 코드로 돈다. 그런 탭이 새 코드와 같은 방에 들어가면 게임 상태 형식이 어긋난다.

declare const __APP_VERSION__: string

/** 빌드 시각(ms). 개발 서버와 테스트에서는 'dev'. */
export const APP_VERSION: string = __APP_VERSION__

/** 배포된 최신 버전이 이 탭과 다른지. 개발 빌드이거나 확인하지 못하면 false. */
export async function newerDeployed(): Promise<boolean> {
  if (APP_VERSION === 'dev') return false
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
    if (!r.ok) return false
    const { version } = (await r.json()) as { version?: string }
    return !!version && version !== APP_VERSION
  } catch {
    return false
  }
}
