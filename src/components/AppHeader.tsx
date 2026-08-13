import { ArrowLeft, House, Menu } from 'lucide-react'
import type { Screen } from '../types'

const locations: Partial<Record<Screen, string>> = {
  session: '業務について聞く',
  hypothesis: '仮説',
  note: '検証ノート',
}

function Logo() {
  return <span className="wordmark"><i aria-hidden="true">F</i><b>FlowShift</b></span>
}

export default function AppHeader({ screen, onBack, onHome, onRestart }: { screen: Screen; onBack: () => void; onHome: () => void; onRestart: () => void }) {
  return (
    <header className="app-header">
      <div className="header-inner">
        {screen === 'connect' || screen === 'workspace' ? (
          <button type="button" onClick={onHome} className="brand-button" aria-label="ワークスペースへ戻る"><Logo /></button>
        ) : (
          <>
            <button type="button" className="header-back" onClick={onBack} aria-label="前の画面へ戻る"><ArrowLeft size={22} /></button>
            <strong className="header-location">{locations[screen]}</strong>
          </>
        )}
        {screen !== 'connect' && <details className="header-menu"><summary aria-label="メニュー"><Menu size={22} /></summary><div>
          <button type="button" onClick={onHome}><House size={18} />ワークスペース</button>
          {screen !== 'workspace' && <button type="button" onClick={onRestart}>最初からやり直す</button>}
        </div></details>}
      </div>
    </header>
  )
}
