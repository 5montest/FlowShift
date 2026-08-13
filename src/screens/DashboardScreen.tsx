import { useMemo, useState } from 'react'
import { ArrowRight, Check, Plus } from 'lucide-react'
import { summarizeWorkGroups } from '../../shared/work-group'
import { formatMinutes } from '../lib/format'
import { projectStatusLabels } from '../lib/labels'
import type { ImprovementProject, WorkGroup } from '../types'

export default function DashboardScreen({ email, groups, projects, busy, error, savedNotice, onRefresh, onDiscover, onOpenProject, onDisconnect }: {
  email?: string
  groups: WorkGroup[]
  projects: ImprovementProject[]
  busy: boolean
  error: string
  savedNotice: string
  onRefresh: () => Promise<void>
  onDiscover: (group?: WorkGroup) => void
  onOpenProject: (project: ImprovementProject) => void
  onDisconnect: () => Promise<void>
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const summary = useMemo(() => summarizeWorkGroups(groups), [groups])
  const categories = useMemo(() => Object.entries(groups.reduce<Record<string, number>>((result, group) => {
    result[group.category] = (result[group.category] ?? 0) + group.totalMinutes
    return result
  }, {})).sort((a, b) => b[1] - a[1]), [groups])
  const maxCategoryMinutes = Math.max(1, ...categories.map(([, minutes]) => minutes))
  const categoryGroups = selectedCategory ? groups.filter((group) => group.category === selectedCategory).sort((a, b) => b.totalMinutes - a.totalMinutes) : []
  const activeProjects = projects.filter((project) => !['REJECTED', 'ADOPTED'].includes(project.status))

  return <main className="dashboard-main">
    <section className="workspace-overview">
      <header className="dashboard-heading"><div><p>{email ? `${email} で利用中` : '業務ポートフォリオ'}</p><h1>現在の業務構造</h1><span>過去4週間の業務と、検証中の再設計仮説を同じ場所で確認できます。</span></div>{email && <button type="button" className="secondary-button" disabled={busy} onClick={() => void onRefresh()}>{busy ? '更新中' : 'Calendarを更新'}</button>}</header>
      <section className="dashboard-summary" aria-label="過去4週間の集計">
        <div><span>Calendar上の業務</span><strong>{formatMinutes(summary.calendarMinutes)}</strong></div>
        <div><span>繰り返し業務</span><strong>{formatMinutes(summary.recurringMinutes)}</strong></div>
        <div><span>会議</span><strong>{formatMinutes(summary.meetingMinutes)}</strong></div>
        <div><span>改善検討中</span><strong>{activeProjects.length}件</strong></div>
      </section>
    </section>
    {savedNotice && <p className="workspace-notice" role="status"><Check size={18} />{savedNotice}</p>}
    {error && <p className="calendar-error" role="alert">{error}</p>}
    <div className="dashboard-grid">
      <section className="work-breakdown"><header><h2>業務時間の内訳</h2><p>棒を選ぶと、業務まで詳しく見られます。</p></header>
        {categories.length ? <div className="category-bars">{categories.map(([category, minutes]) => <button key={category} type="button" aria-pressed={selectedCategory === category} onClick={() => setSelectedCategory((current) => current === category ? null : category)}><span>{category}</span><i><b style={{ width: `${Math.max(6, Math.round(minutes / maxCategoryMinutes * 100))}%` }} /></i><strong>{formatMinutes(minutes)}</strong></button>)}</div> : <p>Calendar上の業務を取得すると内訳が表示されます。</p>}
        {selectedCategory && <div className="category-drilldown"><h3>{selectedCategory}</h3>{categoryGroups.map((group) => <button key={group.id} type="button" onClick={() => onDiscover(group)}><span><strong>{group.title}</strong><small>{group.occurrences}回 / 4週間</small></span><span>{formatMinutes(group.totalMinutes)}</span><ArrowRight size={18} /></button>)}</div>}
      </section>
      <section className="active-projects"><header><h2>改善中の業務</h2><p>未確認の項目と、次に進める検証です。</p></header>
        {activeProjects.length ? <div>{activeProjects.map((project) => {
          const unknownCount = project.proposal.analysis.criticalUnknowns.length
          const next = project.contextDirty ? '追加した情報を仮説へ反映' : project.proposal.analysis.criticalUnknowns[0]?.question ?? project.validations[0]?.title
          return <button key={project.id} type="button" className="project-card" onClick={() => onOpenProject(project)}><header><strong>{project.taskName}</strong><span className={`project-status status-${project.status.toLowerCase()}`}>{project.contextDirty ? '更新待ち' : projectStatusLabels[project.status]}</span></header><p className="project-hypothesis">{project.proposal.redesign.headline}</p><dl><div><dt>過去4週間</dt><dd>{project.businessContext.observed.occurrences}回・{formatMinutes(project.businessContext.observed.totalMinutes)}</dd></div><div><dt>{project.contextDirty ? '反映待ち' : '未確認'}</dt><dd>{project.contextDirty ? '業務情報を更新済み' : `${unknownCount}件`}</dd></div></dl>{next && <small>次にやること：{next}</small>}<span className="project-continue">続ける<ArrowRight size={18} /></span></button>
        })}</div> : <div className="empty-dashboard-projects"><p>改善中の業務はまだありません。</p><span>業務を選び、再設計仮説を保存するとここから続けられます。</span></div>}
      </section>
    </div>
    <div className="dashboard-actions"><button type="button" className="primary-button" onClick={() => onDiscover()}><Plus size={20} />新しい業務を見直す</button>{email && <button type="button" className="text-button" onClick={() => void onDisconnect()}>Google Calendarの接続を解除</button>}</div>
  </main>
}
