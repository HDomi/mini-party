// 렌더링 품질. 그래픽 가속이 없는 PC(크롬 하드웨어 가속 꺼짐, 드라이버 차단, 원격 데스크톱·가상 PC)에서는
// WebGL 이 SwiftShader 같은 소프트웨어 렌더러로 떨어져 CPU 가 그림을 전부 그린다. 그대로 두면 CPU 를 꽉 채우므로
// 그런 환경을 알아채 해상도·그림자·안티에일리어싱·초당 그리는 횟수를 낮춘다.
//
// 주소에 `?quality=low` / `?quality=high` 를 붙이면 감지 결과 대신 그 값을 쓴다(이 탭에서 기억한다).

export interface Quality {
  /** 그래픽 가속이 없거나 낮은 품질을 강제했다. */
  low: boolean
  /** 게임 화면이 1초에 그리는 최대 횟수. 고주사율 모니터에서도 이 이상 그리지 않는다. */
  fps: number
  /** 판이 바뀌거나 입력이 있은 뒤 `ACTIVE_MS` 가 지나 조용할 때의 횟수. 턴제라 대부분 이 상태다. */
  idleFps: number
  /** 메뉴 배경처럼 흐리게 깔리는 화면의 최대 횟수. */
  backdropFps: number
  /** WebGL 렌더러 이름(진단용). */
  renderer: string
  /** 감지했는지, 주소로 정했는지. */
  source: 'detected' | 'forced'
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i

/** 그래픽 가속 여부를 한 번 확인한다. 확인용 컨텍스트는 바로 버린다. */
function probe(): { software: boolean; renderer: string } {
  try {
    const c = document.createElement('canvas')
    // 이 옵션을 주면 소프트웨어 렌더링밖에 안 되는 환경에서는 컨텍스트를 주지 않는다.
    const fast = c.getContext('webgl', { failIfMajorPerformanceCaveat: true })
    const gl = fast ?? document.createElement('canvas').getContext('webgl')
    if (!gl) return { software: true, renderer: 'WebGL 없음' }
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return { software: !fast || SOFTWARE.test(renderer), renderer }
  } catch {
    return { software: false, renderer: '알 수 없음' }
  }
}

/** 주소의 `?name=value` 를 이 탭에 기억한다. 라우터가 이동하면서 주소의 `?` 뒤를 지우기 때문이다. */
export function rememberedParam(name: string): string | null {
  if (typeof location === 'undefined') return null
  const key = `party:${name}`
  try {
    const v = new URLSearchParams(location.search).get(name)
    if (v !== null) sessionStorage.setItem(key, v)
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

let cached: Quality | null = null

export function quality(): Quality {
  if (cached) return cached
  if (typeof document === 'undefined') return { low: false, fps: 60, idleFps: 30, backdropFps: 30, renderer: '', source: 'detected' }
  const forced = rememberedParam('quality')
  const { software, renderer } = probe()
  const low = forced === 'low' ? true : forced === 'high' ? false : software
  cached = {
    low,
    fps: low ? 30 : 60,
    idleFps: low ? 8 : 30,
    backdropFps: low ? 8 : 30,
    renderer,
    source: forced === 'low' || forced === 'high' ? 'forced' : 'detected',
  }
  return cached
}

/** 판이 바뀌거나 입력이 있은 뒤 이만큼은 `fps` 로 그린다. 칼·주사위·윷가락 연출이 이 안에 끝난다. */
export const ACTIVE_MS = 4000

/**
 * 그릴 때를 정한다. 소프트웨어 렌더링에서는 그리는 횟수 × 픽셀 수만큼 CPU 를 쓰므로, 할 일이 없을 때는 덜 그린다.
 * `poke` 로 활동을 알리면 바로 한 번 그리고 `ACTIVE_MS` 동안 `activeFps` 로, 그 뒤로는 `idleFps` 로 그린다.
 */
export function framePacer(activeFps: number, idleFps: number) {
  let poked = -Infinity
  let next = 0
  return {
    poke() {
      poked = performance.now()
      next = 0
      renderStats.pokes++
    },
    /** rAF 시각 `t` 에 그려야 하는지. `busy` 면 연출 중이라 `ACTIVE_MS` 가 지나도 `activeFps` 로 그린다. */
    due(t: number, busy = false) {
      const fps = busy || t - poked < ACTIVE_MS ? activeFps : idleFps
      // 1ms 여유를 둬서 60Hz 모니터에서 60fps 가 한 프레임씩 밀리지 않게 한다.
      if (t < next - 1) return false
      next = Math.max(next + 1000 / fps, t)
      return true
    },
  }
}

/**
 * 사람이 실제로 한 입력인지. 크롬은 커서가 가만히 있어도 그 아래 화면이 바뀌면 움직임 없는 pointermove 를 보낸다.
 * 이걸 활동으로 치면 커서를 캔버스 위에 올려 두기만 해도 계속 빠르게 그리게 된다.
 */
export function isRealInput(e: Event): boolean {
  if (e.type !== 'pointermove' && e.type !== 'mousemove') return true
  const m = e as PointerEvent
  return m.movementX !== 0 || m.movementY !== 0
}

/** 진단 표시가 읽는 값. 캔버스들이 그릴 때마다 갱신한다. */
export const renderStats = { frames: 0, dpr: 0, pokes: 0 }
