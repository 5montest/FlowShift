export default function EvidenceColumn({ title, items, tone, empty }: { title: string; items: string[]; tone: string; empty: string }) {
  return <section className={`evidence-column ${tone}`}><h3>{title}</h3>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{empty}</p>}</section>
}
