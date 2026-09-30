import { useEffect, useRef } from 'react'
import { COLORS } from '../game/rules'
import { generateMap, type Generated } from '../game/maps'
import { makeRng, MAP_KINDS, MAPS, type MapKind } from '../game/world'
import { buildTerrainArt, drawGround, drawSea, drawSky } from '../scene/terrainArt'
import styles from './Menu.module.scss'

/** 썸네일용 예시 판. 맵마다 한 번만 만든다. 실제 판은 시작할 때마다 새로 생성된다. */
const samples = new Map<MapKind, Generated>()
function sample(kind: MapKind): Generated {
  let g = samples.get(kind)
  if (!g) {
    g = generateMap(kind, makeRng(20260930 + MAP_KINDS.indexOf(kind)), 4)
    samples.set(kind, g)
  }
  return g
}

function MapThumb({ kind }: { kind: MapKind }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = canvas.clientWidth || 120
    const h = canvas.clientHeight || 80
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext('2d')!
    const spec = MAPS[kind]
    const { terrain, spots } = sample(kind)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawSky(ctx, kind, w, h)
    // 맵 전체 폭과 탱크가 서는 높이까지 담는다.
    const s = Math.min(w / spec.w, h / spec.fitH)
    const left = (spec.w - w / s) / 2
    ctx.setTransform(s * dpr, 0, 0, -s * dpr, -left * s * dpr, h * dpr)
    drawGround(ctx, kind, buildTerrainArt(terrain), left, w / s)
    spots.forEach((p, i) => {
      ctx.fillStyle = COLORS[i]
      ctx.strokeStyle = '#3a2a22'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.roundRect(p.x - 18, p.y, 36, 18, 6)
      ctx.fill()
      ctx.stroke()
    })
    drawSea(ctx, kind, left, w / s)
  }, [kind])
  return <canvas ref={ref} className={styles.mapThumb} aria-hidden />
}

/** 맵 고르기. 썸네일은 예시 판이다. */
export function MapPicker({ value, onChange, disabled }: { value: MapKind; onChange: (m: MapKind) => void; disabled?: boolean }) {
  return (
    <div className={styles.maps} role="radiogroup" aria-label="맵">
      {MAP_KINDS.map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={value === m}
          className={`${styles.mapCard} ${value === m ? styles.on : ''}`}
          disabled={disabled && value !== m}
          onClick={() => onChange(m)}
        >
          <MapThumb kind={m} />
          <b>{MAPS[m].name}</b>
          <small>{MAPS[m].hint}</small>
        </button>
      ))}
    </div>
  )
}
