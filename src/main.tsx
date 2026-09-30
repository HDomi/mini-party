import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// StrictMode 는 쓰지 않는다: 개발 모드 전용 이중 마운트가 drei 의 <Html> 루트와 경합해 라벨이 사라진다.
createRoot(document.getElementById('root')!).render(<App />)
