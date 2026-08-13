import { ArrowRight } from 'lucide-react'
import ToolTitle from '../components/ToolTitle'
import { projectStatusLabels } from '../lib/labels'
import type { ImprovementProject } from '../types'

export default function ProjectsScreen({ projects, onOpen }: { projects: ImprovementProject[]; onOpen: (project: ImprovementProject) => void }) {
  return <main className="tool-main"><ToolTitle title="保存した仮説" summary="確認・承認した業務モデルと検証計画だけを保存しています。" />{projects.length ? <div className="project-list">{projects.map((project) => <button key={project.id} type="button" onClick={() => onOpen(project)}><span><strong>{project.taskName}</strong><small>{new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' }).format(new Date(project.updatedAt))}</small></span><span className={`project-status status-${project.status.toLowerCase()}`}>{projectStatusLabels[project.status]}</span><ArrowRight size={20} /></button>)}</div> : <div className="empty-projects"><h2>保存した仮説はありません</h2><p>業務の仮説を保存すると、ここから検証を続けられます。</p></div>}</main>
}
