import { ArrowLeft, House, Menu } from 'lucide-react'
import type { Screen } from '../types'

const toolSteps: { screens: Screen[]; label: string }[] = [
  { screens: ['discovery'], label: '業務を選ぶ' },
  { screens: ['interview'], label: '質問に答える' },
  { screens: ['review'], label: '内容を確認' },
  { screens: ['redesign'], label: '仮説' },
]

function Logo() {
  return <span className="wordmark"><i aria-hidden="true">F</i><b>FlowShift</b></span>
}

export default function AppHeader({ screen, onBack, onHome, onRestart }: { screen: Screen; onBack: () => void; onHome: () => void; onRestart: () => void }) {
  const activeIndex = toolSteps.findIndex((step) => step.screens.includes(screen))
  const location = screen === 'dashboard' ? 'ワークスペース' : screen === 'projects' ? '保存した業務' : screen === 'project' ? '業務の詳細' : toolSteps[activeIndex]?.label
  return (
    <header className="app-header">
      <div className="header-inner">
        {screen === 'home' ? (
          <button type="button" onClick={onHome} className="brand-button" aria-label="最初の画面へ戻る"><Logo /></button>
        ) : screen === 'dashboard' ? (
          <button type="button" onClick={onHome} className="brand-button" aria-label="ワークスペースへ戻る"><Logo /></button>
        ) : (
          <>
            <button type="button" className="header-back" onClick={onBack} aria-label="前の画面へ戻る"><ArrowLeft size={22} /></button>
            <strong className="header-location">{location}</strong>
            {activeIndex >= 0 && <span className="step-count">ステップ {activeIndex + 1} / {toolSteps.length}</span>}
          </>
        )}
        {screen !== 'home' && <details className="header-menu"><summary aria-label="メニュー"><Menu size={22} /></summary><div>
          <button type="button" onClick={onHome}><House size={18} />ワークスペース</button>
          {screen !== 'dashboard' && <button type="button" onClick={onRestart}>最初からやり直す</button>}
        </div></details>}
      </div>
    </header>
  )
}
