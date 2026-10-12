/** 메뉴 로고와 로비 자리 그림에 쓰는, 통 위로 눈만 내놓고 떠는 개구리 얼굴. */
export function FrogFace({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 84 64" className={className} aria-hidden>
      <ellipse cx="42" cy="42" rx="34" ry="22" fill="#6fc34a" stroke="#3a2a22" strokeWidth="3" />
      <circle cx="26" cy="20" r="13" fill="#6fc34a" stroke="#3a2a22" strokeWidth="3" />
      <circle cx="58" cy="20" r="13" fill="#6fc34a" stroke="#3a2a22" strokeWidth="3" />
      <circle cx="26" cy="21" r="9" fill="#fff" />
      <circle cx="58" cy="21" r="9" fill="#fff" />
      <circle cx="28" cy="23" r="4.2" fill="#141414" />
      <circle cx="56" cy="23" r="4.2" fill="#141414" />
      <path d="M17 8 L31 4" stroke="#2f5a1e" strokeWidth="3" strokeLinecap="round" />
      <path d="M67 8 L53 4" stroke="#2f5a1e" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 46 Q42 38 52 46" fill="none" stroke="#2f5a1e" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="20" cy="40" rx="5" ry="3" fill="#ff8fa6" opacity="0.8" />
      <ellipse cx="64" cy="40" rx="5" ry="3" fill="#ff8fa6" opacity="0.8" />
      <path d="M72 26 q4 6 0 9 q-4 -3 0 -9z" fill="#8fd6ff" stroke="#3a2a22" strokeWidth="1.5" />
    </svg>
  )
}
