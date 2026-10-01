// 3×3 칸 중 눈이 찍히는 자리(scene/textures 와 같다).
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
}

/** 메뉴와 점수표에 쓰는 납작한 주사위. */
export function DieIcon({ value, className }: { value: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="#fffaf1" stroke="#3a2a22" strokeWidth="2.5" />
      {PIPS[value].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={8.5 + x * 7.5} cy={8.5 + y * 7.5} r={value === 1 ? 4.6 : 2.6} fill={value === 1 ? '#d94436' : '#3a2a22'} />
      ))}
    </svg>
  )
}
