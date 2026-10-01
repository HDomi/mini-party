import { useEffect } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { UpdateBanner } from '@/components/UpdateBanner'
import { VolumeControl } from '@/components/VolumeControl'
import { gameBySlug } from '@/games/registry'
import { HomePage } from '@/pages/HomePage'
import { navigate, usePath } from '@/router'

export default function App() {
  const [, slug = ''] = usePath().split('/')
  return (
    <>
      {/* 다른 게임이나 메인화면으로 가면 오류 상태를 버리고 새로 그린다. 게임 안의 경로 이동은 그대로 둔다. */}
      <ErrorBoundary key={slug}>
        <Screen />
      </ErrorBoundary>
      <VolumeControl />
      <UpdateBanner />
    </>
  )
}

function Screen() {
  const path = usePath()
  const [, slug = '', ...rest] = path.split('/')
  const game = gameBySlug(slug)

  const unknown = slug !== '' && !game
  useEffect(() => {
    if (unknown) navigate('/', { replace: true })
  }, [unknown])

  if (game?.App) return <game.App key={game.id} sub={rest.join('/')} />
  return <HomePage />
}
