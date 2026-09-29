import { useRef, useSyncExternalStore, type PointerEvent } from 'react'
import { getVolume, setVolume, subscribeVolume } from './sound'

/** Fixed top-right volume bar. Drag or click to set; the speaker toggles mute. */
export function VolumeControl() {
  const volume = useSyncExternalStore(subscribeVolume, getVolume)
  const bar = useRef<HTMLDivElement>(null)
  const lastOn = useRef(volume || 0.6)
  if (volume > 0) lastOn.current = volume

  const fromPointer = (e: PointerEvent) => {
    const r = bar.current!.getBoundingClientRect()
    setVolume(Math.round(((e.clientX - r.left) / r.width) * 20) / 20)
  }

  return (
    <div className="volume">
      <button
        className="volume-icon"
        onClick={() => setVolume(volume > 0 ? 0 : lastOn.current)}
        aria-label={volume > 0 ? '음소거' : '소리 켜기'}
      >
        {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
      </button>
      <div
        ref={bar}
        className="volume-bar"
        role="slider"
        tabIndex={0}
        aria-label="음량"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(volume * 100)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          fromPointer(e)
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && fromPointer(e)}
        onKeyDown={(e) => {
          const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.1 : 0
          if (!step) return
          e.preventDefault()
          setVolume(Math.round((volume + step) * 10) / 10)
        }}
      >
        <i style={{ width: `${volume * 100}%` }} />
      </div>
    </div>
  )
}
