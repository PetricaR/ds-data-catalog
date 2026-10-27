import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { bqApi } from '../api/bq'
import { errorDetail } from '../api/client'
import type { GCPSource } from '../api/types'
import { tokens } from '../theme'

export interface SyncRow {
  source: GCPSource
  state: 'pending' | 'running' | 'ok' | 'partial' | 'error'
  message?: string
}

// Everything a sync can change
const SYNCED_QUERIES = ['bq-sources', 'datasets', 'dataset', 'tables', 'table', 'stats', 'tags', 'search', 'schema-changes']

/**
 * Syncs sources one request at a time, so each stays well inside the proxy timeout and the user
 * sees per-project progress. Without an argument it syncs every active source.
 */
export function useSourceSync() {
  const qc = useQueryClient()
  const [rows, setRows] = useState<SyncRow[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  async function run(only?: GCPSource[]) {
    setRunning(true)
    setError('')
    let sources = only
    if (!sources) {
      try {
        sources = (await bqApi.listSources()).filter((s) => s.is_active)
      } catch (e) {
        setError(errorDetail(e, 'Could not load the connected projects.'))
        setRunning(false)
        return
      }
    }
    if (!sources.length) {
      setRows([])
      setError('No active BigQuery projects to sync. Add one under GCP Sources first.')
      setRunning(false)
      return
    }

    const update = (index: number, row: Partial<SyncRow>) =>
      setRows((all) => all.map((r, i) => (i === index ? { ...r, ...row } : r)))
    setRows(sources.map((source) => ({ source, state: 'pending' })))

    for (const [index, source] of sources.entries()) {
      update(index, { state: 'running' })
      try {
        const { result } = await bqApi.syncSource(source.id)
        const tables = result.tables_added + result.tables_updated
        update(index, result.errors.length
          ? {
              state: tables ? 'partial' : 'error',
              message: result.errors.length > 1
                ? `${result.errors[0]} (and ${result.errors.length - 1} more)`
                : result.errors[0],
            }
          : { state: 'ok', message: `${tables.toLocaleString()} table${tables === 1 ? '' : 's'} synced` })
      } catch (e) {
        update(index, {
          state: 'error',
          message: errorDetail(e, 'The request failed or timed out — a large project may still be syncing. Check GCP Sources in a few minutes.'),
        })
      }
    }

    SYNCED_QUERIES.forEach((key) => qc.invalidateQueries({ queryKey: [key] }))
    setRunning(false)
  }

  const reset = () => {
    setRows([])
    setError('')
  }

  return { rows, running, error, done: !running && rows.length > 0, run, reset }
}

function RowIcon({ state }: { state: SyncRow['state'] }) {
  if (state === 'running') return <CircularProgress size={16} aria-label="Syncing" />
  if (state === 'ok') return <CheckCircleIcon fontSize="small" sx={{ color: tokens.success }} titleAccess="Synced" />
  if (state === 'partial') return <WarningAmberIcon fontSize="small" sx={{ color: tokens.warning }} titleAccess="Synced with warnings" />
  if (state === 'error') return <ErrorIcon fontSize="small" sx={{ color: tokens.danger }} titleAccess="Failed" />
  return <HourglassEmptyIcon fontSize="small" sx={{ color: tokens.ruleStrong }} titleAccess="Waiting" />
}

const STATE_TEXT: Partial<Record<SyncRow['state'], string>> = { pending: 'waiting', running: 'syncing…' }

const MESSAGE_SX = { display: 'block', overflowWrap: 'anywhere', color: 'text.secondary', fontSize: '0.8125rem', lineHeight: 1.5 } as const

// Google's errors can run to a page of JSON; show the start and keep the rest one click away
function SyncMessage({ text }: { text: string }) {
  if (text.length <= 180) return <Typography component="span" sx={MESSAGE_SX}>{text}</Typography>
  return (
    <Box component="details" sx={{ ...MESSAGE_SX, '& summary': { cursor: 'pointer' } }}>
      <summary>{text.slice(0, 160).trimEnd()}… <Box component="span" sx={{ color: tokens.accent }}>more</Box></summary>
      <Box component="span" sx={{ display: 'block', mt: 0.5, maxHeight: 200, overflowY: 'auto' }}>{text}</Box>
    </Box>
  )
}

export function SyncProgressList({ rows }: { rows: SyncRow[] }) {
  return (
    <Box component="ul" aria-live="polite" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {rows.map((row) => (
        <Box component="li" key={row.source.id} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
          <Box sx={{ pt: 0.25, display: 'flex' }}><RowIcon state={row.state} /></Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600}>{row.source.display_name || row.source.project_id}</Typography>
            <SyncMessage text={row.message ?? STATE_TEXT[row.state] ?? ''} />

          </Box>
        </Box>
      ))}
    </Box>
  )
}
