import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import axios from 'axios'

const EVENT = 'catalog:error'

/** Show an error toast from anywhere — used for failed mutations that have no inline error UI. */
export function notifyError(message: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: message }))
}

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 403) {
      return error.response.data?.detail
        ? `Permission denied — ${error.response.data.detail}`
        : 'You do not have permission to do this.'
    }
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
  }
  return 'Something went wrong. Please try again.'
}

export default function Notifier() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const onError = (e: Event) => setMessage((e as CustomEvent<string>).detail)
    window.addEventListener(EVENT, onError)
    return () => window.removeEventListener(EVENT, onError)
  }, [])

  return (
    <Snackbar
      open={!!message}
      autoHideDuration={6000}
      onClose={() => setMessage(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert severity="error" variant="filled" onClose={() => setMessage(null)} sx={{ width: '100%' }}>
        {message}
      </Alert>
    </Snackbar>
  )
}
