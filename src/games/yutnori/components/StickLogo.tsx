export function StickLogo() {
  return (
    <div className="stick-logo" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={i === 1 ? 'flat' : ''} style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  )
}
