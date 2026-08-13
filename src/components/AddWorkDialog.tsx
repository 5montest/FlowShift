import { useState } from 'react'
import QuestionDialog from './QuestionDialog'
import { createManualWork } from '../lib/manual-work'
import type { WorkGroup } from '../types'

// カレンダーに載らない業務の手動登録。回数と時間は自己申告（観測ではない）。
export default function AddWorkDialog({ onAdd, onClose }: {
  onAdd: (group: WorkGroup) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [occurrences, setOccurrences] = useState(4)
  const [averageMinutes, setAverageMinutes] = useState(30)
  const [recurring, setRecurring] = useState(true)
  const valid = title.trim().length > 0 && Number.isInteger(occurrences) && occurrences >= 1 && occurrences <= 2500 && Number.isInteger(averageMinutes) && averageMinutes >= 1 && averageMinutes <= 43_200

  return <QuestionDialog title="業務を追加" description="カレンダーに載らない業務を登録します。この内容はブラウザにだけ保存され、内訳と声かけの対象になります。" busy={false} onClose={onClose}>
    <div className="profile-form">
      <label>業務の名前
        <input type="text" value={title} maxLength={500} placeholder="例：問い合わせメールの一次対応" onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>回数（4週間あたり）
        <input type="number" min={1} max={2500} value={occurrences} onChange={(event) => setOccurrences(event.target.valueAsNumber)} />
      </label>
      <label>1回あたりの時間（分）
        <input type="number" min={1} max={43200} step={5} value={averageMinutes} onChange={(event) => setAverageMinutes(event.target.valueAsNumber)} />
      </label>
      <label className="add-work-recurring">
        <input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} />
        定期的にやっている業務
      </label>
      <div className="profile-actions">
        <button type="button" className="text-button" onClick={onClose}>キャンセル</button>
        <button type="button" className="primary-button" disabled={!valid} onClick={() => { onAdd(createManualWork({ title, occurrences, averageMinutes, recurring })); onClose() }}>登録する</button>
      </div>
    </div>
  </QuestionDialog>
}
