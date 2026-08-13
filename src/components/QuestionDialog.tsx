import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

// 追加の入力（修正・情報を追加・追加質問・検証ノートの未確認）を、ページに注入せず
// 中央のオーバーレイで行う。閉じれば元の位置のまま — 「押して→スクロール」を作らない。
export default function QuestionDialog({ title, description, busy = false, onClose, children }: {
  title: string
  description?: string
  // 送信中はEsc・背景クリック・×で閉じない
  busy?: boolean
  onClose: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      opener?.focus()
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  return <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section ref={panelRef} tabIndex={-1} className="question-dialog" role="dialog" aria-modal="true" aria-labelledby="question-dialog-heading">
      <header className="question-dialog-header">
        <div><h2 id="question-dialog-heading">{title}</h2>{description && <p>{description}</p>}</div>
        <button type="button" className="dialog-close" onClick={onClose} disabled={busy} aria-label="閉じる"><X size={22} /></button>
      </header>
      <div className="question-dialog-body">{children}</div>
    </section>
  </div>
}
