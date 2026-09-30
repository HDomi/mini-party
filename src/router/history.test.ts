import { beforeAll, describe, expect, it, vi } from 'vitest'

// 배포 환경과 같은 base 로 모듈을 불러온다(BASE 는 모듈 로드 시점에 읽힌다).
vi.stubEnv('BASE_URL', '/mini-party/')
const loc = { pathname: '/mini-party/', origin: 'https://hdomi.github.io' }
vi.stubGlobal('location', loc)

let router: typeof import('./history')
beforeAll(async () => {
  router = await import('./history')
})

describe('currentPath', () => {
  it.each([
    ['/mini-party/', '/'],
    ['/mini-party', '/'],
    ['/mini-party/yut', '/yut'],
    ['/mini-party/yut/', '/yut'],
    ['/mini-party/yut/ABCD', '/yut/ABCD'],
  ])('%s -> %s', (pathname, expected) => {
    loc.pathname = pathname
    expect(router.currentPath()).toBe(expected)
  })
})

describe('toUrl', () => {
  it('prefixes the base once', () => {
    expect(router.toUrl('/')).toBe('/mini-party/')
    expect(router.toUrl('/yut/ABCD')).toBe('/mini-party/yut/ABCD')
    expect(router.absoluteUrl('/yut/ABCD')).toBe('https://hdomi.github.io/mini-party/yut/ABCD')
  })
})
