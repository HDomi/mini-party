import { useEffect, type CSSProperties } from 'react'
import { Backdrop } from './Backdrop'
import { celebrateWin } from './effects'

/** Shown to the last player left in a running game. The room is already deleted. */
export function ForfeitWin({ teamName, color, onLeave }: { teamName: string; color: string; onLeave: () => void }) {
  useEffect(() => celebrateWin(color), [color])
  return (
    <main className="lobby">
      <Backdrop />
      <div className="win-card forfeit" style={{ '--c': color } as CSSProperties}>
        <h2>승리했어요!</h2>
        <p>다른 플레이어가 모두 나가서 {teamName}의 승리로 끝났어요.</p>
        <button className="btn primary big" onClick={onLeave}>
          메인화면으로 가기
        </button>
      </div>
    </main>
  )
}
