import { ArrowRight } from 'lucide-react'
import type { CalendarStatus } from '../types'

type CalendarState = CalendarStatus & { loading: boolean }

export default function ConnectScreen({ calendar, error, onConnect }: {
  calendar: CalendarState
  error: string
  onConnect: () => void
}) {
  return (
    <main className="home-grid">
      <section className="home-intro"><div>
        <h1 className="hero-title">業務を見つけ、<br /><span>理解してから作り直す。</span></h1>
        <p className="hero-description">カレンダーから繰り返し業務を見つけて、アプリからあなたに質問します。予定だけで結論を出さず、目的・判断・制約を整理してから、検証できる見直し仮説を作ります。</p>
        <div className="home-actions">
          <button type="button" onClick={onConnect} className="primary-button" disabled={calendar.loading || !calendar.configured}>{calendar.loading ? '接続状態を確認中' : 'Google Calendarを接続'}<ArrowRight size={20} /></button>
        </div>
        <p className="calendar-note">{calendar.configured ? '予定の読み取り権限だけを使用します。' : 'Google OAuthのローカル設定が必要です。'}</p>
        {error && <p className="calendar-error" role="alert">{error}</p>}
        <ul className="service-notes" aria-label="データの取り扱い">
          <li>カレンダーは業務について質問を始める索引として使います</li>
          <li>選択した業務の観測情報と回答だけを分析のため外部AIサービスへ送信します</li>
          <li>カレンダー全件や会話全文は保存せず、あなたが保存した仮説だけを残します</li>
        </ul>
      </div></section>
      <section className="hero-example" aria-label="FlowShiftで扱う業務モデルの例">
        <header className="example-header"><p>業務モデル / 過去4週間</p><h2>朝会</h2><strong>20回・合計5時間</strong></header>
        <div className="domain-model-preview">
          <p>目的：チームが変化を把握し、対応を判断できる状態にする</p>
          <ul>
            <li><span><strong>予定共有</strong><small>各メンバーの予定を揃える</small></span><b className="treatment-system">System化候補</b></li>
            <li><span><strong>変更確認</strong><small>前回からの差分を確認する</small></span><b className="treatment-system">System化候補</b></li>
            <li><span><strong>困りごとの相談</strong><small>支援の要否を人が判断する</small></span><b className="treatment-human">Human・維持</b></li>
            <li><span><strong>新人教育</strong><small>必要な回と対象を確認する</small></span><b className="treatment-unknown">? 未確認</b></li>
          </ul>
        </div>
        <p className="example-note">表示は例です。実際は、あなたのカレンダーから見つけた業務をこの形に整理します。</p>
      </section>
    </main>
  )
}
