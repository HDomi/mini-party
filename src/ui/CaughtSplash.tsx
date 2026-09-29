import type { CSSProperties } from 'react'

const TAUNTS = ['집으로 돌아가는 중…', '처음부터 다시…', '킹받네 진짜', '억울해 ㅠㅠ', '복수한다 두고 봐', '이건 아니잖아']

export interface Caught {
  seq: number
  by: string
  color: string
  byColor: string
}

/** Full-screen "잡혔다" splash, shown only to the players whose piece just got sent home. */
export function CaughtSplash({ caught }: { caught: Caught }) {
  const taunt = TAUNTS[caught.seq % TAUNTS.length]
  return (
    <div className="caught" style={{ '--c': caught.color, '--by': caught.byColor } as CSSProperties}>
      <div className="caught-card">
        <CryingPiece />
        <strong>잡혔다 ㅠㅠ</strong>
        <span className="caught-by">
          <b>{caught.by}</b>한테 잡힘
        </span>
        <span className="caught-taunt">{taunt}</span>
      </div>
    </div>
  )
}

function CryingPiece() {
  return (
    <svg className="caught-piece" viewBox="0 0 160 130" aria-hidden>
      <ellipse cx="80" cy="118" rx="58" ry="8" fill="rgba(58,42,34,0.18)" />
      <path
        d="M20 104 C18 58 44 30 80 30 C116 30 142 58 140 104 C140 112 132 116 124 116 L36 116 C28 116 20 112 20 104 Z"
        fill="var(--c)"
        stroke="var(--ink)"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path d="M42 56 C50 44 62 40 70 42" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.45" />
      {/* ㅠ eyes */}
      <g stroke="var(--ink)" strokeWidth="5" strokeLinecap="round">
        <path d="M44 66 H70 M50 66 V78 M64 66 V78" />
        <path d="M90 66 H116 M96 66 V78 M110 66 V78" />
      </g>
      <path d="M68 98 C72 90 88 90 92 98" fill="none" stroke="var(--ink)" strokeWidth="5" strokeLinecap="round" />
      <path className="tear" d="M52 80 C46 92 58 92 52 80 Z" />
      <path className="tear t2" d="M108 80 C102 92 114 92 108 80 Z" />
      <path className="tear t3" d="M60 82 C54 94 66 94 60 82 Z" />
      <path className="tear t4" d="M100 82 C94 94 106 94 100 82 Z" />
    </svg>
  )
}
