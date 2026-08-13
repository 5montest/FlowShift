import { ArrowRight, LoaderCircle } from 'lucide-react'
import type { CalendarStatus } from '../types'

type CalendarState = CalendarStatus & { loading: boolean }

export default function HomeScreen({ calendar, busy, error, onConnect, onCalendarStart, onDisconnect, onProjects }: {
  calendar: CalendarState
  busy: boolean
  error: string
  onConnect: () => void
  onCalendarStart: () => Promise<void>
  onDisconnect: () => Promise<void>
  onProjects: () => Promise<void>
}) {
  return (
    <main className="home-grid">
      <section className="home-intro"><div>
        <h1 className="hero-title">業務を見つけ、<br /><span>理解してから作り直す。</span></h1>
        <p className="hero-description">カレンダーから繰り返し業務の存在を見つけます。その予定だけで結論を出さず、あなたへの質問から目的・判断・制約を整理し、検証できる再設計仮説を作ります。</p>
        <div className="home-actions">
          {calendar.connected ? <>
            <button type="button" onClick={() => void onCalendarStart()} className="primary-button" disabled={busy}>{busy ? <><LoaderCircle className="animate-spin" />過去4週間を取得中</> : <>業務傾向を見る<ArrowRight size={20} /></>}</button>
            <button type="button" onClick={() => void onProjects()} className="secondary-button" disabled={busy}>保存した仮説</button>
            <button type="button" onClick={() => void onDisconnect()} className="text-button" disabled={busy}>接続を解除</button>
          </> : <button type="button" onClick={onConnect} className="primary-button" disabled={calendar.loading || !calendar.configured}>{calendar.loading ? '接続状態を確認中' : 'Google Calendarを接続'}<ArrowRight size={20} /></button>}
        </div>
        <p className="calendar-note">{calendar.connected ? `${calendar.email ?? 'Googleアカウント'}と接続済み` : calendar.configured ? '予定の読み取り権限だけを使用します。' : 'Google OAuthのローカル設定が必要です。'}</p>
        {error && <p className="calendar-error" role="alert">{error}</p>}
        <ul className="service-notes" aria-label="データの取り扱い">
          <li>Calendarは業務について質問を始める索引として使います</li>
          <li>選択した業務の観測情報と回答だけを分析のため外部AIサービスへ送信します</li>
          <li>Calendar全件や会話全文は保存せず、あなたが保存した仮説だけを残します</li>
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
