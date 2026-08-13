import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import QuestionDialog from './QuestionDialog'
import { useAsyncAction } from '../lib/useAsync'
import type { UserProfile } from '../../shared/profile-schema'

const jobTypes = ['開発・エンジニア', '営業', '企画・マーケティング', '管理部門', 'カスタマーサポート', 'その他'] as const
const roleLevels = ['メンバー', 'リーダー・主任', '管理職', '経営・役員'] as const
const holidayPatterns = ['土日祝で固定', 'シフト制・不定期'] as const

// 初回連携時のヒアリング。全項目任意で、あとからヘッダーのアカウントメニューで変更できる。
export default function ProfileDialog({ profile, onSave, onSkip }: {
  profile: UserProfile | null
  onSave: (profile: UserProfile) => Promise<void>
  onSkip: () => void
}) {
  const [jobType, setJobType] = useState(profile?.jobType ?? '')
  const [roleLevel, setRoleLevel] = useState(profile?.roleLevel ?? '')
  const [workStart, setWorkStart] = useState(profile?.workStart ?? '')
  const [workEnd, setWorkEnd] = useState(profile?.workEnd ?? '')
  const [holidayPattern, setHolidayPattern] = useState(profile?.holidayPattern ?? '')
  const { status, errorMessage, run } = useAsyncAction('保存できませんでした。')

  function submit() {
    const next: UserProfile = {
      ...(jobType ? { jobType: jobType as UserProfile['jobType'] } : {}),
      ...(roleLevel ? { roleLevel: roleLevel as UserProfile['roleLevel'] } : {}),
      ...(workStart && workEnd ? { workStart, workEnd } : {}),
      ...(holidayPattern ? { holidayPattern: holidayPattern as UserProfile['holidayPattern'] } : {}),
    }
    void run(() => onSave(next))
  }

  return <QuestionDialog title="あなたの働き方を教えてください" description="質問と分析の精度向上のためAIへ送信され、アカウントに保存されます。すべて任意で、あとからいつでも変更できます。" busy={status === 'loading'} onClose={onSkip}>
    <div className="profile-form">
      <label>職種
        <select value={jobType} onChange={(event) => setJobType(event.target.value)}>
          <option value="">未設定</option>
          {jobTypes.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label>役職
        <select value={roleLevel} onChange={(event) => setRoleLevel(event.target.value)}>
          <option value="">未設定</option>
          {roleLevels.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label>所定労働時間
        <span className="profile-time-range">
          <input type="time" value={workStart} onChange={(event) => setWorkStart(event.target.value)} aria-label="始業時刻" />
          〜
          <input type="time" value={workEnd} onChange={(event) => setWorkEnd(event.target.value)} aria-label="終業時刻" />
        </span>
      </label>
      <label>休みの取り方
        <select value={holidayPattern} onChange={(event) => setHolidayPattern(event.target.value)}>
          <option value="">未設定</option>
          {holidayPatterns.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      {status === 'error' && <p className="calendar-error" role="alert">{errorMessage}</p>}
      <div className="profile-actions">
        <button type="button" className="text-button" onClick={onSkip} disabled={status === 'loading'}>あとで設定する</button>
        <button type="button" className="primary-button" onClick={submit} disabled={status === 'loading'}>{status === 'loading' ? <><LoaderCircle className="animate-spin" />保存中</> : '保存する'}</button>
      </div>
    </div>
  </QuestionDialog>
}
