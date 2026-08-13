import { useState } from 'react'

export type RequestStatus = 'idle' | 'loading' | 'error'

export function useAsyncAction(fallbackMessage = '処理を完了できませんでした。') {
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function run(action: () => Promise<void>) {
    setStatus('loading')
    setErrorMessage('')
    try {
      await action()
      setStatus('idle')
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : fallbackMessage)
    }
  }

  return { status, errorMessage, run }
}
