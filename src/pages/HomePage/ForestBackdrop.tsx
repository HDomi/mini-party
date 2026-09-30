import styles from './ForestBackdrop.module.scss'

const INK = '#3a2a22'

/** 동화책 같은 숲 풍경. 화면 폭이 달라도 아래쪽 언덕이 보이도록 바닥 기준으로 잘라 채운다. */
export function ForestBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden>
      <svg className={styles.scene} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="fb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9fdcff" />
            <stop offset="0.55" stopColor="#d9f3ff" />
            <stop offset="1" stopColor="#f2fbe6" />
          </linearGradient>
          <radialGradient id="fb-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.55" stopColor="#fff6c2" />
            <stop offset="1" stopColor="#fff6c2" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="1440" height="900" fill="url(#fb-sky)" />
        <circle cx="1180" cy="150" r="150" fill="url(#fb-sun)" />
        <circle cx="1180" cy="150" r="62" fill="#ffe27a" stroke={INK} strokeWidth="4" />

        <g className={styles.cloudsSlow} fill="#fff" stroke={INK} strokeOpacity="0.18" strokeWidth="3">
          <Cloud x={180} y={140} s={1.1} />
          <Cloud x={820} y={90} s={0.8} />
        </g>
        <g className={styles.cloudsFast} fill="#fff" stroke={INK} strokeOpacity="0.18" strokeWidth="3">
          <Cloud x={520} y={230} s={0.65} />
          <Cloud x={1320} y={300} s={0.7} />
        </g>

        {/* 먼 언덕 */}
        <path d="M0 560 C 180 470 360 500 520 540 S 860 470 1040 520 S 1320 480 1440 520 L1440 900 L0 900 Z" fill="#cdeeb0" />
        <g>
          <Pine x={300} y={520} h={70} fill="#8cc97a" />
          <Pine x={340} y={528} h={54} fill="#8cc97a" />
          <Pine x={1100} y={512} h={66} fill="#8cc97a" />
          <Pine x={1140} y={522} h={50} fill="#8cc97a" />
        </g>

        {/* 중간 언덕 */}
        <path d="M0 650 C 220 570 420 600 640 640 S 1000 580 1200 620 S 1380 600 1440 610 L1440 900 L0 900 Z" fill="#a8dc7e" />
        <Tree x={150} y={630} r={48} fill="#6fbf5a" />
        <Tree x={1290} y={612} r={54} fill="#6fbf5a" />
        <Tree x={760} y={636} r={36} fill="#7fcb62" />

        {/* 가까운 언덕 */}
        <path d="M0 760 C 260 690 520 720 760 750 S 1180 700 1440 730 L1440 900 L0 900 Z" fill="#7cc55e" stroke={INK} strokeOpacity="0.25" strokeWidth="3" />
        <Tree x={60} y={760} r={70} fill="#4f9e45" />
        <Tree x={1380} y={742} r={78} fill="#4f9e45" />
        <Bush x={420} y={742} />
        <Bush x={1010} y={728} />

        {/* 꽃 */}
        <g stroke={INK} strokeWidth="2.5">
          {FLOWERS.map(([x, y, c]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="7" fill={c} />
          ))}
        </g>

        <path d="M0 850 C 360 820 1080 820 1440 850 L1440 900 L0 900 Z" fill="#5aae4e" />
      </svg>
    </div>
  )
}

const FLOWERS: [number, number, string][] = [
  [240, 790, '#ffd35c'],
  [290, 805, '#ff8fa3'],
  [560, 780, '#fff'],
  [880, 790, '#ffd35c'],
  [1180, 770, '#ff8fa3'],
  [1230, 792, '#fff'],
]

function Cloud({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M-110 30 C -150 30 -150 -20 -105 -22 C -100 -70 -30 -80 -10 -40 C 10 -90 100 -80 100 -25 C 150 -30 160 30 110 30 Z"
    />
  )
}

function Tree({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  return (
    <g stroke={INK} strokeWidth="3.5">
      <rect x={x - r * 0.12} y={y - r * 0.5} width={r * 0.24} height={r * 0.9} rx={r * 0.08} fill="#a8703f" />
      <circle cx={x} cy={y - r * 1.1} r={r} fill={fill} />
      <circle cx={x - r * 0.35} cy={y - r * 1.35} r={r * 0.22} fill="#fff" fillOpacity="0.28" stroke="none" />
    </g>
  )
}

function Pine({ x, y, h, fill }: { x: number; y: number; h: number; fill: string }) {
  return <path d={`M${x} ${y - h} L${x + h * 0.38} ${y} L${x - h * 0.38} ${y} Z`} fill={fill} />
}

function Bush({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x - 70} ${y + 20} C ${x - 80} ${y - 20} ${x - 30} ${y - 30} ${x - 15} ${y - 10} C ${x - 5} ${y - 45} ${x + 50} ${y - 40} ${x + 50} ${y - 5} C ${x + 85} ${y - 10} ${x + 90} ${y + 20} ${x + 60} ${y + 20} Z`}
      fill="#63b653"
      stroke={INK}
      strokeWidth="3"
    />
  )
}
