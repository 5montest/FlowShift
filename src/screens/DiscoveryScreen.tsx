import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, CircleHelp, LoaderCircle } from 'lucide-react'
import { isDiscoveryCandidate, summarizeWorkGroups } from '../../shared/work-group'
import ToolTitle from '../components/ToolTitle'
import { formatMinutes, formatPeriod } from '../lib/format'
import type { WorkGroup } from '../types'

type WorkFilter = 'all' | 'repeat' | 'meeting'

export default function DiscoveryScreen({ groups, selectedGroup, onSelectGroup, onSelect }: {
  groups: WorkGroup[]
  selectedGroup: WorkGroup
  onSelectGroup: (group: WorkGroup) => void
  onSelect: () => Promise<void>
}) {
  const [filter, setFilter] = useState<WorkFilter>('all')
  const [showMobileDetail, setShowMobileDetail] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const summary = useMemo(() => summarizeWorkGroups(groups), [groups])
  const candidates = groups.filter(isDiscoveryCandidate)
  const baseGroups = candidates.length ? candidates : groups
  const visibleGroups = baseGroups.filter((group) => filter === 'all' || (filter === 'repeat' && group.evidence.recurring) || (filter === 'meeting' && group.category === '会議'))

  async function selectWork() {
    if (preparing) return
    setPreparing(true)
    try { await onSelect() } finally { setPreparing(false) }
  }

  return (
    <main className="tool-main">
      <ToolTitle title="過去4週間の業務傾向" summary="カレンダーで分かったことです。" />
      <section className="discovery-summary" aria-label="過去4週間の集計">
        <div><span>カレンダー上の業務</span><strong>{formatMinutes(summary.calendarMinutes)}</strong></div>
        <div><span>繰り返し予定</span><strong>{formatMinutes(summary.recurringMinutes)}</strong></div>
        <div><span>会議</span><strong>{formatMinutes(summary.meetingMinutes)}</strong></div>
        <div><span>確認候補</span><strong>{summary.candidateCount}業務</strong></div>
      </section>
      <div className="work-toolbar" aria-label="表示条件">
        <strong>{candidates.length ? '今、詳しく聞く価値がありそうな業務' : '繰り返し候補がないため、観測した業務を表示'}</strong>
        <div className="filter-buttons">{([['all', 'すべて'], ['repeat', '繰り返し'], ['meeting', '会議']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      </div>
      <div className={`work-browser ${showMobileDetail ? 'show-detail' : ''}`}>
        <section className="work-list" aria-labelledby="work-list-heading">
          <h2 id="work-list-heading">業務</h2>
          <div className="work-table-head"><span>業務</span><span>回数</span><span>合計時間</span></div>
          {visibleGroups.map((group) => <button key={group.id} type="button" className={`work-group-row${group.id === selectedGroup.id ? ' is-selected' : ''}`} onClick={() => { onSelectGroup(group); setShowMobileDetail(true) }}><span><strong>{group.title}</strong><small>{group.category}・平均{formatMinutes(group.averageMinutes)}</small></span><span>{group.occurrences}回</span><span>{formatMinutes(group.totalMinutes)}</span></button>)}
          {!visibleGroups.length && <p className="empty-work-list">この条件に合う業務はありません。</p>}
        </section>
        <aside className="selection-pane" aria-labelledby="selected-work-heading">
          <button type="button" className="mobile-list-back" onClick={() => setShowMobileDetail(false)}><ArrowLeft size={18} />一覧へ戻る</button>
          <p className="eyebrow">カレンダーで分かったこと</p><h2 id="selected-work-heading">{selectedGroup.title}</h2><p className="work-meta">{selectedGroup.category}・{formatPeriod(selectedGroup)}</p>
          <dl className="evidence-list"><div><dt>回数</dt><dd>{selectedGroup.occurrences}回</dd></div><div><dt>合計時間</dt><dd>{formatMinutes(selectedGroup.totalMinutes)}</dd></div><div><dt>1回あたり</dt><dd>平均{formatMinutes(selectedGroup.averageMinutes)}</dd></div><div><dt>登録</dt><dd>{selectedGroup.evidence.recurring ? '同一の定例予定' : '同じタイトルの予定'}</dd></div></dl>
          <div className="observation-note"><CircleHelp size={20} /><p>この情報だけでは、目的や必要性は分かりません。次に、あなたが知っている業務の背景を確認します。</p></div>
          <button type="button" className="primary-button full-width" onClick={() => void selectWork()} disabled={preparing}>{preparing ? <><LoaderCircle className="animate-spin" />質問を準備中</> : <>この業務について答える<ArrowRight size={20} /></>}</button>
        </aside>
      </div>
    </main>
  )
}
