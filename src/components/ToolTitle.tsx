export default function ToolTitle({ title, summary }: { title: string; summary?: string }) {
  return <div className="tool-titlebar"><h1>{title}</h1>{summary && <p>{summary}</p>}</div>
}
