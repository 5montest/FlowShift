import type { ReactNode } from 'react'

export default function SummaryItem({ title, children }: { title: string; children: ReactNode }) {
  return <div><dt>{title}</dt><dd>{children}</dd></div>
}
