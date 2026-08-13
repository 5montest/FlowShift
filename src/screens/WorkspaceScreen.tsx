import { useMemo, useState } from 'react'
import { ArrowRight, Bell, BellOff, CalendarSearch, ChartColumnBig, Check, Code, Coffee, Database, FileText, FlaskConical, Headset, LoaderCircle, PencilLine, Plus, RefreshCw, Shapes, TrendingDown, Users } from 'lucide-react'
import StatusBadge from '../components/StatusBadge'
import { isManualWork } from '../lib/manual-work'
import { projectContext, projectName } from '../../shared/project-schema'
import { computeReduction, normalizeWorkTitle, rankDiscoveryCandidates, summarizeWorkGroups } from '../../shared/work-group'
import { draftProgressLabel } from '../lib/drafts'
import { formatMinutes, formatPeriod } from '../lib/format'
import { projectStatusLabels } from '../lib/labels'
import type { ImprovementProject, SessionDraft, WorkGroup } from '../types'

type CalendarRange = { timeMin: string; timeMax: string } | null

// 固定7分類の見分けを速くするためのアイコン（shared/work-group.tsのタクソノミーと対応）
const categoryIcons: Record<string, typeof Users> = {
  '会議': Users, '資料作成': FileText, 'データ処理': Database, '顧客対応': Headset, '開発・制作': Code, '休憩・私用': Coffee, 'その他': Shapes,
}

// 接続済みユーザーのホーム。アプリが最初に話しかけ、その下に定点観測（時間の内訳・
// 進行中の仮説・採用済み仮説の削減）を置く。
export default function WorkspaceScreen({ groups, projects, drafts, mutedWork, busy, error, needsReconnect, savedNotice, calendarRange, fetchedAt, onRefresh, onReconnect, onStartSession, onOpenProject, onDiscardDraft, onMuteWork, onUnmuteWork, onAddWork, onRemoveManualWork }: {
  groups: WorkGroup[]
  projects: ImprovementProject[]
  drafts: SessionDraft[]
  mutedWork: Set<string>
  busy: boolean
  error: string
  needsReconnect: boolean
  savedNotice: string
  calendarRange: CalendarRange
  fetchedAt: Date | null
  onRefresh: () => Promise<void>
  onReconnect: () => void
  onStartSession: (group: WorkGroup) => void
  onOpenProject: (project: ImprovementProject) => void
  onDiscardDraft: (groupId: string) => void
  onMuteWork: (title: string) => void
  onUnmuteWork: (title: string) => void
  onAddWork: () => void
  onRemoveManualWork: (id: string) => void
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [detailGroup, setDetailGroup] = useState<WorkGroup | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState<SessionDraft | null>(null)
  const [confirmRemoveWork, setConfirmRemoveWork] = useState<WorkGroup | null>(null)
  const draftIds = useMemo(() => new Set(drafts.map((draft) => draft.group.id)), [drafts])
  const summary = useMemo(() => summarizeWorkGroups(groups), [groups])
  // 却下した業務はまた声かけの候補に戻す（進行中・採用・保留のみ除外）
  const activeTitles = useMemo(() => projects.filter((project) => project.status !== 'REJECTED').map((project) => projectContext(project).observed.title), [projects])
  const activeTitleKeys = useMemo(() => new Set(activeTitles.map(normalizeWorkTitle)), [activeTitles])
  const candidates = useMemo(() => rankDiscoveryCandidates(groups, [...activeTitles, ...mutedWork]), [groups, activeTitles, mutedWork])
  const allCandidates = useMemo(() => rankDiscoveryCandidates(groups), [groups])
  const focus = candidates[0]
  const mentions = candidates.slice(0, 2)
  const categories = useMemo(() => Object.entries(groups.reduce<Record<string, number>>((result, group) => {
    result[group.category] = (result[group.category] ?? 0) + group.totalMinutes
    return result
  }, {})).sort((a, b) => b[1] - a[1]), [groups])
  const maxCategoryMinutes = Math.max(1, ...categories.map(([, minutes]) => minutes))
  const categoryGroups = selectedCategory ? groups.filter((group) => group.category === selectedCategory).sort((a, b) => b.totalMinutes - a.totalMinutes) : []
  const activeProjects = projects.filter((project) => !['REJECTED', 'ADOPTED', 'ON_HOLD'].includes(project.status))
  const adoptedProjects = projects.filter((project) => project.status === 'ADOPTED')
  const adoptedReductions = useMemo(() => adoptedProjects.map((project) => ({ project, reduction: computeReduction(projectContext(project).observed, groups) })), [adoptedProjects, groups])
  const totalSavedMinutes = adoptedReductions.filter(({ reduction }) => reduction.matched).reduce((total, { reduction }) => total + reduction.deltaMinutes, 0)
  const detailDraft = detailGroup ? drafts.find((draft) => draft.group.id === detailGroup.id) ?? null : null
  const detailProject = detailGroup ? projects.find((project) => normalizeWorkTitle(projectContext(project).observed.title) === normalizeWorkTitle(detailGroup.title)) ?? null : null
  const rangeFormat = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' })
  const timeFormat = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  function pickerRow(group: WorkGroup) {
    return <button key={group.id} type="button" onClick={() => onStartSession(group)}><span><strong>{group.title}</strong><small>{group.category}・平均{formatMinutes(group.averageMinutes)}{isManualWork(group) && '・手動登録'}{draftIds.has(group.id) && '・下書きあり'}{activeTitleKeys.has(normalizeWorkTitle(group.title)) && '・仮説あり'}{mutedWork.has(normalizeWorkTitle(group.title)) && '・声かけ対象外'}</small></span><span>{group.occurrences}回</span><span>{formatMinutes(group.totalMinutes)}</span></button>
  }

  return <main className="dashboard-main">
    {savedNotice && <p className="workspace-notice" role="status"><Check size={18} />{savedNotice}</p>}
    {needsReconnect && <section className="reconnect-banner" role="alert"><div><strong>Googleとの接続が切れました</strong><p>再接続すると続きから使えます。下書きや保存済みの仮説はそのまま残ります。</p></div><button type="button" className="primary-button" onClick={onReconnect}>再接続する</button></section>}
    <section className="opening-block" aria-label="アプリからの声かけ">
      {busy && !groups.length ? <>
        <p className="opening-observation"><LoaderCircle size={18} className="animate-spin" /> カレンダーを読み込んでいます…</p>
      </> : focus ? <>
        <p className="opening-observation">
          <CalendarSearch size={18} />過去4週間のカレンダーを見ると、{mentions.map((group, index) => <span key={group.id}><strong>{group.title}</strong>を{group.occurrences}回（合計{formatMinutes(group.totalMinutes)}）{index < mentions.length - 1 ? '、' : ''}</span>)}行っています。
        </p>
        {draftIds.has(focus.id)
          ? <p className="opening-ask">「{focus.title}」の続きから再開できます。前回の回答はそのまま残っています。</p>
          : <p className="opening-ask">まず「{focus.title}」について、実際には何をしているか教えてください。3つの質問に答えると、この業務の整理ができます。</p>}
        <div className="opening-actions">
          <button type="button" className="primary-button" onClick={() => onStartSession(focus)}>{draftIds.has(focus.id) ? `「${focus.title}」の続きから答える` : `${focus.title}について答える`}<ArrowRight size={20} /></button>
          <details className="work-picker"><summary>別の業務から始める</summary>
            <div className="work-picker-list">{groups.map(pickerRow)}</div>
          </details>
        </div>
      </> : allCandidates.length > 0 ? <>
        <p className="opening-observation"><CalendarSearch size={18} />繰り返しの業務は、いま仮説の検証中です。</p>
        <p className="opening-ask">検証を続けるか、別の業務からも始められます。</p>
        <div className="opening-actions">
          {groups.length > 0 && <details className="work-picker"><summary>別の業務から始める</summary>
            <div className="work-picker-list">{groups.map(pickerRow)}</div>
          </details>}
        </div>
      </> : <>
        <p className="opening-observation"><CalendarSearch size={18} />過去4週間のカレンダーには、繰り返しの予定が見つかりませんでした。</p>
        <p className="opening-ask">業務を1つ選んで、実際には何をしているか教えてください。</p>
        <div className="opening-actions">
          {groups.length ? <details className="work-picker" open><summary>業務を選ぶ</summary>
            <div className="work-picker-list">{groups.map(pickerRow)}</div>
          </details> : <>
            <p className="opening-empty">カレンダーに時間のある予定（終日以外）が登録されると、ここから始められます。</p>
            <button type="button" className="secondary-button" onClick={onAddWork}><Plus size={18} />カレンダーに載らない業務を追加する</button>
          </>}
        </div>
      </>}
    </section>
    {error && <p className="calendar-error" role="alert">{error}</p>}
    {drafts.length > 0 && <section className="session-drafts" aria-label="作業中の下書き">
      <header><h2><PencilLine size={18} className="heading-icon" />作業中の下書き</h2><p>途中まで答えた業務です。このブラウザにだけ保存され、30日で自動的に消えます。</p></header>
      <div>{drafts.map((draft) => <div key={draft.group.id} className="draft-row">
        <button type="button" className="draft-resume" onClick={() => onStartSession(draft.group)}>
          <span><strong>{draft.group.title}</strong><small>{draftProgressLabel(draft)}・{timeFormat.format(new Date(draft.updatedAt))}</small></span>
          <span className="draft-continue">続きから答える<ArrowRight size={18} /></span>
        </button>
        <button type="button" className="text-button" onClick={() => setConfirmDiscard(draft)}>破棄</button>
      </div>)}</div>
    </section>}
    <div className="dashboard-grid">
      <section className="work-breakdown"><header className="breakdown-header"><div><h2><ChartColumnBig size={18} className="heading-icon" />業務時間の内訳</h2><p>{calendarRange ? `${rangeFormat.format(new Date(calendarRange.timeMin))}〜${rangeFormat.format(new Date(calendarRange.timeMax))}の合計${formatMinutes(summary.calendarMinutes)}` : `過去4週間の合計${formatMinutes(summary.calendarMinutes)}`}{groups.some(isManualWork) ? '（手動登録の業務を含む）' : ''}{fetchedAt ? `（${timeFormat.format(fetchedAt)}時点）` : ''}。棒を選ぶと業務の一覧と詳細を確認できます。</p></div><div className="breakdown-actions"><button type="button" className="secondary-button" onClick={onAddWork}><Plus size={16} />業務を追加</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void onRefresh()}><RefreshCw size={16} className={busy ? 'animate-spin' : undefined} />{busy ? '更新中' : 'カレンダーを更新'}</button></div></header>
        {categories.length ? <div className="category-bars">{categories.map(([category, minutes]) => <div key={category} className="category-row">
          <button type="button" className="category-bar" aria-pressed={selectedCategory === category} aria-expanded={selectedCategory === category} onClick={() => setSelectedCategory((current) => current === category ? null : category)}><span>{(() => { const Icon = categoryIcons[category]; return Icon ? <Icon size={16} /> : null })()}{category}</span><i><b style={{ width: `${Math.max(6, Math.round(minutes / maxCategoryMinutes * 100))}%` }} /></i><strong>{formatMinutes(minutes)}</strong></button>
          {selectedCategory === category && <div className="category-drilldown">{categoryGroups.map((group) => <button key={group.id} type="button" onClick={() => setDetailGroup(group)}><span><strong>{group.title}</strong><small>{group.occurrences}回 / 4週間{isManualWork(group) && '・手動登録'}{draftIds.has(group.id) && '・下書きあり'}{activeTitleKeys.has(normalizeWorkTitle(group.title)) && '・仮説あり'}</small></span><span>{formatMinutes(group.totalMinutes)}</span><ArrowRight size={18} /></button>)}</div>}
        </div>)}</div> : <p>カレンダーの業務を取得すると内訳が表示されます。</p>}
      </section>
      <section className="active-projects"><header><h2><FlaskConical size={18} className="heading-icon" />進行中の仮説</h2><p>未確認の項目と、次に進める検証です。</p></header>
        {activeProjects.length ? <div>{activeProjects.map((project) => {
          const contextDirty = Boolean(project.pendingContext)
          const observed = projectContext(project).observed
          const unknownCount = project.proposal.analysis.criticalUnknowns.length
          const next = contextDirty ? '追加した情報を仮説へ反映' : project.proposal.analysis.criticalUnknowns[0]?.question ?? project.proposal.validationPlan.items[0]?.title
          return <button key={project.id} type="button" className="project-card" onClick={() => onOpenProject(project)}><header><strong>{projectName(project)}</strong>{contextDirty ? <span className="project-status status-dirty"><RefreshCw size={14} />更新待ち</span> : <StatusBadge status={project.status} />}</header><p className="project-hypothesis">{project.proposal.redesign.headline}</p><dl><div><dt>保存時点</dt><dd>{observed.occurrences}回・{formatMinutes(observed.totalMinutes)}</dd></div><div><dt>{contextDirty ? '反映待ち' : '未確認'}</dt><dd>{contextDirty ? '業務情報を更新済み' : `${unknownCount}件`}</dd></div></dl>{next && <small>次にやること：{next}</small>}<span className="project-continue">続ける<ArrowRight size={18} /></span></button>
        })}</div> : <div className="empty-dashboard-projects"><p>進行中の仮説はまだありません。</p><span>業務について答えて仮説を保存すると、ここから検証を続けられます。採用すると削減時間もここで追えます。</span></div>}
        {adoptedReductions.length > 0 && <div className="reduction-summary"><h3><TrendingDown size={18} />採用した仮説の効果{totalSavedMinutes !== 0 && <b className={totalSavedMinutes > 0 ? 'is-down' : ''}>合計 {totalSavedMinutes > 0 ? `−${formatMinutes(totalSavedMinutes)}` : `+${formatMinutes(-totalSavedMinutes)}`} / 4週間</b>}</h3>
          {adoptedReductions.map(({ project, reduction }) => <button key={project.id} type="button" className="reduction-row" onClick={() => onOpenProject(project)}>
            <strong>{projectName(project)}</strong>
            {reduction.matched ? <>
              <span>{reduction.baselineOccurrences}回/{formatMinutes(reduction.baselineMinutes)} → {reduction.currentOccurrences}回/{formatMinutes(reduction.currentMinutes)}</span>
              <b className={reduction.deltaMinutes > 0 ? 'is-down' : ''}>{reduction.deltaMinutes > 0 ? `−${formatMinutes(reduction.deltaMinutes)}` : reduction.deltaMinutes < 0 ? `+${formatMinutes(-reduction.deltaMinutes)}` : '±0'}</b>
            </> : <span className="reduction-unmatched">直近4週間のカレンダーに見当たりません</span>}
          </button>)}
          <p className="reduction-note">保存時点と直近4週間の、同じ業務のカレンダー実測の比較です。</p>
        </div>}
      </section>
    </div>
    {projects.length > 0 && <details className="saved-projects-list"><summary>保存した仮説をすべて見る（{projects.length}件）</summary>
      <div className="project-list">{projects.map((project) => <button key={project.id} type="button" onClick={() => onOpenProject(project)}><span><strong>{projectName(project)}</strong><small>{new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' }).format(new Date(project.updatedAt))}</small></span><StatusBadge status={project.status} /><ArrowRight size={20} /></button>)}</div>
    </details>}
    {detailGroup && <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog group-detail" role="dialog" aria-modal="true" aria-labelledby="group-detail-heading">
      <p className="eyebrow">カレンダーで分かったこと</p>
      <h2 id="group-detail-heading">{detailGroup.title}</h2>
      <dl className="group-detail-facts">
        <div><dt>分類</dt><dd>{(() => { const Icon = categoryIcons[detailGroup.category]; return Icon ? <Icon size={16} /> : null })()}{detailGroup.category}</dd></div>
        <div><dt>期間</dt><dd>{formatPeriod(detailGroup)}</dd></div>
        <div><dt>回数</dt><dd>{detailGroup.occurrences}回 / 4週間</dd></div>
        <div><dt>合計時間</dt><dd>{formatMinutes(detailGroup.totalMinutes)}</dd></div>
        <div><dt>1回あたり</dt><dd>平均{formatMinutes(detailGroup.averageMinutes)}</dd></div>
        <div><dt>登録</dt><dd>{isManualWork(detailGroup) ? '手動で登録した業務（自己申告）' : detailGroup.recurring ? '同一の定例予定' : '同じタイトルの予定'}</dd></div>
        {detailDraft && <div><dt>下書き</dt><dd>{draftProgressLabel(detailDraft)}</dd></div>}
        {detailProject && <div><dt>仮説</dt><dd>{projectStatusLabels[detailProject.status]}</dd></div>}
      </dl>
      {mutedWork.has(normalizeWorkTitle(detailGroup.title))
        ? <button type="button" className="text-button mute-toggle" onClick={() => onUnmuteWork(detailGroup.title)}><Bell size={15} />声かけの対象に戻す</button>
        : <button type="button" className="text-button mute-toggle" onClick={() => onMuteWork(detailGroup.title)}><BellOff size={15} />この業務は声かけの対象外にする（休憩・私用など）</button>}
      {isManualWork(detailGroup) && <button type="button" className="text-button mute-toggle" onClick={() => setConfirmRemoveWork(detailGroup)}>この登録を削除する</button>}
      <div className="group-detail-actions">
        <button type="button" className="secondary-button" onClick={() => setDetailGroup(null)}>閉じる</button>
        {detailProject && <button type="button" className="secondary-button" onClick={() => { setDetailGroup(null); onOpenProject(detailProject) }}>仮説を開く</button>}
        <button type="button" className="primary-button" onClick={() => { setDetailGroup(null); onStartSession(detailGroup) }}>{detailDraft ? '続きから答える' : 'この業務について答える'}<ArrowRight size={18} /></button>
      </div>
    </section></div>}
    {confirmRemoveWork && <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-work-heading"><h2 id="remove-work-heading">手動登録を削除しますか？</h2><p>「{confirmRemoveWork.title}」を一覧と内訳から削除します。保存済みの仮説と下書きは残ります。</p><div><button type="button" className="secondary-button" onClick={() => setConfirmRemoveWork(null)}>キャンセル</button><button type="button" className="primary-button" onClick={() => { onRemoveManualWork(confirmRemoveWork.id); setConfirmRemoveWork(null); setDetailGroup(null) }}>削除する</button></div></section></div>}
    {confirmDiscard && <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="discard-heading"><h2 id="discard-heading">下書きを破棄しますか？</h2><p>「{confirmDiscard.group.title}」の回答と作成済みの仮説を、このブラウザから削除します。保存済みの仮説は残ります。</p><div><button type="button" className="secondary-button" onClick={() => setConfirmDiscard(null)}>キャンセル</button><button type="button" className="primary-button" onClick={() => { onDiscardDraft(confirmDiscard.group.id); setConfirmDiscard(null) }}>破棄する</button></div></section></div>}
  </main>
}
