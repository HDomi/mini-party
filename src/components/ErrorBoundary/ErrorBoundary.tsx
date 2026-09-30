import { Component, type ErrorInfo, type ReactNode } from 'react'
import { navigate } from '@/router'
import styles from './ErrorBoundary.module.scss'

/**
 * 화면을 그리다 예외가 나면 React 가 트리 전체를 비워 배경만 남는다. 대신 안내 카드를 보여 준다.
 * 다른 화면으로 가면 다시 마운트되도록 바깥에서 `key` 를 준다.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('render failed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className={styles.screen}>
        <div className={styles.card}>
          <h2>화면을 그리지 못했어요</h2>
          <p>잠시 후 다시 시도해 주세요. 계속 안 되면 처음 화면에서 다시 들어와 주세요.</p>
          <div className={styles.row}>
            <button className="btn primary big" onClick={() => this.setState({ error: null })}>
              다시 시도
            </button>
            <button className="btn big" onClick={() => navigate('/')}>
              처음으로
            </button>
          </div>
        </div>
      </main>
    )
  }
}
