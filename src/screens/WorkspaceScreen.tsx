import { useMemo, useState } from 'react'
import { ArrowRight, Check, TrendingDown } from 'lucide-react'
import { projectContext, projectName } from '../../shared/project-schema'
import { computeReduction, rankDiscoveryCandidates, summarizeWorkGroups } from '../../shared/work-group'
import { formatMinutes } from '../lib/format'
import { projectStatusLabels } from '../lib/labels'
import type { ImprovementProject, WorkGroup } from '../types'

// 接続済みユーザーのホーム。アプリが最初に話しかけ、その下に定点観測（時間の内訳・
// 検証中の仮説・採用済み仮説の削減）を置く。
export default function WorkspaceScreen({ email, groups, projects, busy, error, savedNotice, onRefresh, onStartSession, onOpenProject, onDisconnect }: {
  email?: string
  groups: WorkGroup[]
  projects: ImprovementProject[]
  busy: boolean
  error: string
  savedNotice: string
  onRefresh: () => Promise<void>
  onStartSession: (group: WorkGroup) => void
  onOpenProject: (project: ImprovementProject) => void
  onDisconnect: () => Promise<void>
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const summary = useMemo(() => summarizeWorkGroups(groups), [groups])
  const candidates = useMemo(() => rankDiscoveryCandidates(groups, projects.map((project) => projectContext(project).observed.title)), [groups, projects])
  const focus = candidates[0]
  const mentions = candidates.slice(0, 2)
  const categories = useMemo(() => Object.entries(groups.reduce<Record<string, number>>((result, group) => {
    result[group.category] = (result[group.category] ?? 0) + group.totalMinutes
    return result
  }, {})).sort((a, b) => b[1] - a[1]), [groups])
  const maxCategoryMinutes = Math.max(1, ...categories.map(([, minutes]) => minutes))
  const categoryGroups = selectedCategory ? groups.filter((group) => group.category === selectedCategory).sort((a, b) => b.totalMinutes - a.totalMinutes) : []
  const activeProjects = projects.filter((project) => !['REJECTED', 'ADOPTED'].includes(project.status))
  const adoptedProjects = projects.filter((project) => project.status === 'ADOPTED')

  return <main className="dashboard-main">
    <section className="opening-block" aria-label="アプリからの声かけ">
      {focus ? <>
        <p className="opening-observation">
          過去4週間のカレンダーを見ると、<br />
          {mentions.map((group, index) => <span key={group.id}><strong>{group.title}</strong>を{group.occurrences}回（合計{formatMinutes(group.totalMinutes)}）{index < mentions.length - 1 ? '、' : ''}<br /></span>)}
          行っています。
        </p>
        <p className="opening-ask">まず「{focus.title}」について、実際には何をしているか教えてください。<br />3つの質問に答えると、この業務の整理ができます。</p>
        <div className="opening-actions">
          <button type="button" className="primary-button" onClick={() => onStartSession(focus)}>{focus.title}について答える<ArrowRight size={20} /></button>
          <details className="work-picker"><summary>別の業務から始める</summary>
            <div className="work-picker-list">{groups.map((group) => <button key={group.id} type="button" onClick={() => onStartSession(group)}><span><strong>{group.title}</strong><small>{group.category}・平均{formatMinutes(group.averageMinutes)}</small></span><span>{group.occurrences}回</span><span>{formatMinutes(group.totalMinutes)}</span></button>)}</div>
          </details>
        </div>
      </> : <>
        <p className="opening-observation">過去4週間のカレンダーには、繰り返しの予定が見つかりませんでした。</p>
        <p className="opening-ask">業務を1つ選んで、実際には何をしているか教えてください。</p>
        <div className="opening-actions">
          {groups.length ? <details className="work-picker" open><summary>業務を選ぶ</summary>
            <div className="work-picker-list">{groups.map((group) => <button key={group.id} type="button" onClick={() => onStartSession(group)}><span><strong>{group.title}</strong><small>{group.category}・平均{formatMinutes(group.averageMinutes)}</small></span><span>{group.occurrences}回</span><span>{formatMinutes(group.totalMinutes)}</span></button>)}</div>
          </details> : <p className="opening-empty">カレンダーに時間のある予定が登録されると、ここから始められます。</p>}
        </div>
      </>}
    </section>
    {savedNotice && <p className="workspace-notice" role="status"><Check size={18} />{savedNotice}</p>}
    {error && <p className="calendar-error" role="alert">{error}</p>}
    <div className="dashboard-grid">
      <section className="work-breakdown"><header><h2>業務時間の内訳</h2><p>過去4週間の合計{formatMinutes(summary.calendarMinutes)}。棒を選ぶと業務まで見られます。</p></header>
        {categories.length ? <div className="category-bars">{categories.map(([category, minutes]) => <button key={category} type="button" aria-pressed={selectedCategory === category} onClick={() => setSelectedCategory((current) => current === category ? null : category)}><span>{category}</span><i><b style={{ width: `${Math.max(6, Math.round(minutes / maxCategoryMinutes * 100))}%` }} /></i><strong>{formatMinutes(minutes)}</strong></button>)}</div> : <p>カレンダーの業務を取得すると内訳が表示されます。</p>}
        {selectedCategory && <div className="category-drilldown"><h3>{selectedCategory}</h3>{categoryGroups.map((group) => <button key={group.id} type="button" onClick={() => onStartSession(group)}><span><strong>{group.title}</strong><small>{group.occurrences}回 / 4週間</small></span><span>{formatMinutes(group.totalMinutes)}</span><ArrowRight size={18} /></button>)}</div>}
      </section>
      <section className="active-projects"><header><h2>検証中の仮説</h2><p>未確認の項目と、次に進める検証です。</p></header>
        {activeProjects.length ? <div>{activeProjects.map((project) => {
          const contextDirty = Boolean(project.pendingContext)
          const observed = projectContext(project).observed
          const unknownCount = project.proposal.analysis.criticalUnknowns.length
          const next = contextDirty ? '追加した情報を仮説へ反映' : project.proposal.analysis.criticalUnknowns[0]?.question ?? project.proposal.validationPlan.items[0]?.title
          return <button key={project.id} type="button" className="project-card" onClick={() => onOpenProject(project)}><header><strong>{projectName(project)}</strong><span className={`project-status status-${project.status.toLowerCase()}`}>{contextDirty ? '更新待ち' : projectStatusLabels[project.status]}</span></header><p className="project-hypothesis">{project.proposal.redesign.headline}</p><dl><div><dt>過去4週間</dt><dd>{observed.occurrences}回・{formatMinutes(observed.totalMinutes)}</dd></div><div><dt>{contextDirty ? '反映待ち' : '未確認'}</dt><dd>{contextDirty ? '業務情報を更新済み' : `${unknownCount}件`}</dd></div></dl>{next && <small>次にやること：{next}</small>}<span className="project-continue">続ける<ArrowRight size={18} /></span></button>
        })}</div> : <div className="empty-dashboard-projects"><p>検証中の仮説はまだありません。</p><span>業務について答えて仮説を保存すると、ここから続けられます。</span></div>}
        {adoptedProjects.length > 0 && <div className="reduction-summary"><h3><TrendingDown size={18} />採用した仮説の効果</h3>
          {adoptedProjects.map((project) => {
            const reduction = computeReduction(projectContext(project).observed, groups)
            return <button key={project.id} type="button" className="reduction-row" onClick={() => onOpenProject(project)}>
              <strong>{projectName(project)}</strong>
              <span>4週間 {formatMinutes(reduction.baselineMinutes)} → {reduction.currentMinutes ? formatMinutes(reduction.currentMinutes) : '0分'}</span>
              <b className={reduction.deltaMinutes > 0 ? 'is-down' : ''}>{reduction.deltaMinutes > 0 ? `−${formatMinutes(reduction.deltaMinutes)}` : reduction.deltaMinutes < 0 ? `+${formatMinutes(-reduction.deltaMinutes)}` : '±0'}</b>
            </button>
          })}
          <p className="reduction-note">保存時点と直近4週間の、同じ業務のカレンダー実測の比較です。</p>
        </div>}
      </section>
    </div>
    <details className="saved-projects-list"><summary>保存した仮説をすべて見る（{projects.length}件）</summary>
      {projects.length ? <div className="project-list">{projects.map((project) => <button key={project.id} type="button" onClick={() => onOpenProject(project)}><span><strong>{projectName(project)}</strong><small>{new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' }).format(new Date(project.updatedAt))}</small></span><span className={`project-status status-${project.status.toLowerCase()}`}>{projectStatusLabels[project.status]}</span><ArrowRight size={20} /></button>)}</div> : <p className="empty-projects-inline">保存した仮説はまだありません。</p>}
    </details>
    <div className="dashboard-actions"><span className="workspace-account">{email ? `${email} で利用中` : ''}</span><div><button type="button" className="secondary-button" disabled={busy} onClick={() => void onRefresh()}>{busy ? '更新中' : 'カレンダーを更新'}</button><button type="button" className="text-button" onClick={() => void onDisconnect()}>接続を解除</button></div></div>
  </main>
}
