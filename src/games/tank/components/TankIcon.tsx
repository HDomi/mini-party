/** 로비·HUD 에 쓰는 작은 탱크 그림. 전장 캔버스의 탱크와 같은 모양이다. */
export function TankIcon({ color, size = 34, flip = false, className }: { color: string; size?: number; flip?: boolean; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size * 0.75}
      viewBox="-18 -26 36 27"
      aria-hidden
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <g stroke="#3a2a22" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <line x1="0" y1="-14" x2="15" y2="-23" strokeWidth="6" />
        <line x1="0" y1="-14" x2="15" y2="-23" stroke={color} strokeWidth="2.6" />
        <path d="M -7.5 -12 A 7.5 7.5 0 0 1 7.5 -12 Z" fill={color} />
        <path d="M -14 -6 L 14 -6 L 10.5 -13 L -10.5 -13 Z" fill={color} />
        <rect x="-15" y="-7" width="30" height="7" rx="3.5" fill="#3a2a22" />
      </g>
      {[-10.5, -3.5, 3.5, 10.5].map((x) => (
        <circle key={x} cx={x} cy={-3.5} r={2.2} fill="#9b8b7b" />
      ))}
    </svg>
  )
}
