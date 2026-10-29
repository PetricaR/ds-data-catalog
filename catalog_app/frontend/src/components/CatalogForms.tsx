import type { FormEvent, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { errorDetail } from '../api/client'
import { searchApi } from '../api/search'
import type { Column, SensitivityLabel } from '../api/types'
import { tokens } from '../theme'
import { MONO } from './ui'

/** The catalog-owned details of a dataset or table: what sync never overwrites. */
export interface DetailsDraft {
  display_name: string
  description: string
  owner: string
  data_steward: string // datasets only
  tags: string[]
  sensitivity_label: SensitivityLabel
}

export const emptyDetails = (): DetailsDraft => ({
  display_name: '', description: '', owner: '', data_steward: '', tags: [], sensitivity_label: 'internal',
})

export function detailsOf(entity: {
  display_name: string | null
  description: string | null
  owner: string | null
  data_steward?: string | null
  tags: string[]
  sensitivity_label: SensitivityLabel
}): DetailsDraft {
  return {
    display_name: entity.display_name ?? '',
    description: entity.description ?? '',
    owner: entity.owner ?? '',
    data_steward: entity.data_steward ?? '',
    tags: entity.tags,
    sensitivity_label: entity.sensitivity_label,
  }
}

const SENSITIVITY: { value: SensitivityLabel; label: string; help: string }[] = [
  { value: 'public', label: 'Public', help: 'Fine to share outside the company' },
  { value: 'internal', label: 'Internal', help: 'Anyone in the company' },
  { value: 'confidential', label: 'Confidential', help: 'Need to know; handle with care' },
  { value: 'restricted', label: 'Restricted', help: 'Only editors and admins can open it' },
]

const normaliseTags = (tags: string[]) =>
  [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))]

export function DetailsFields({ draft, onChange, kind }: {
  draft: DetailsDraft
  onChange: (draft: DetailsDraft) => void
  kind: 'dataset' | 'table'
}) {
  const { data: knownTags = [] } = useQuery({ queryKey: ['tags'], queryFn: searchApi.tags, staleTime: 60_000 })
  const set = (patch: Partial<DetailsDraft>) => onChange({ ...draft, ...patch })
  return (
    <>
      <TextField label="Display name" fullWidth value={draft.display_name} onChange={(e) => set({ display_name: e.target.value })} />
      <TextField
        label="Description" fullWidth multiline minRows={3}
        placeholder={`What is in this ${kind}, where it comes from, and what it should (and shouldn't) be used for.`}
        value={draft.description}
        onChange={(e) => set({ description: e.target.value })}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: kind === 'dataset' ? '1fr 1fr' : '1fr' }, gap: 2 }}>
        <TextField label="Owner" placeholder="team-or-person@example.com" value={draft.owner} onChange={(e) => set({ owner: e.target.value })} />
        {kind === 'dataset' && (
          <TextField
            label="Data steward" placeholder="steward@example.com"
            helperText="Named on Google Chat alerts about this dataset"
            value={draft.data_steward}
            onChange={(e) => set({ data_steward: e.target.value })}
          />
        )}
      </Box>
      <Autocomplete
        multiple freeSolo autoSelect
        options={knownTags}
        value={draft.tags}
        onChange={(_, tags) => set({ tags: normaliseTags(tags) })}
        renderInput={(params) => <TextField {...params} label="Tags" placeholder="Type a tag and press Enter" />}
        ChipProps={{ size: 'small', sx: MONO }}
      />
      <TextField
        select label="Sensitivity" value={draft.sensitivity_label}
        onChange={(e) => set({ sensitivity_label: e.target.value as SensitivityLabel })}
        helperText={SENSITIVITY.find((s) => s.value === draft.sensitivity_label)?.help}
      >
        {SENSITIVITY.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
      </TextField>
    </>
  )
}

/**
 * For registering: anything left empty or at its default is left out. A new entry gets the API's
 * defaults, and one removed earlier comes back with its own tags and label instead of losing them.
 */
export function detailsPayload(draft: DetailsDraft, kind: 'dataset' | 'table') {
  const text = (v: string) => v.trim() || undefined
  return {
    display_name: text(draft.display_name),
    description: text(draft.description),
    owner: text(draft.owner),
    ...(kind === 'dataset' && { data_steward: text(draft.data_steward) }),
    tags: draft.tags.length ? draft.tags : undefined,
    sensitivity_label: draft.sensitivity_label === 'internal' ? undefined : draft.sensitivity_label,
  }
}

/**
 * For edits: only what changed, so an untouched field doesn't log a change (or send a Chat alert).
 * A cleared field is sent as an empty string, which clears it.
 */
export function detailsChanges(draft: DetailsDraft, saved: DetailsDraft, kind: 'dataset' | 'table') {
  const changes: Partial<Omit<DetailsDraft, 'tags' | 'sensitivity_label'>> & Pick<Partial<DetailsDraft>, 'tags' | 'sensitivity_label'> = {}
  const fields = ['display_name', 'description', 'owner', ...(kind === 'dataset' ? ['data_steward'] as const : [])] as const
  for (const field of fields) {
    const next = draft[field].trim()
    if (next !== saved[field].trim()) changes[field] = next
  }
  if (draft.tags.join('\n') !== saved.tags.join('\n')) changes.tags = draft.tags
  if (draft.sensitivity_label !== saved.sensitivity_label) changes.sensitivity_label = draft.sensitivity_label
  return changes
}

export function FormDialog({ open, onClose, title, submitLabel, pending, error, errorFallback, canSubmit = true, onSubmit, children }: {
  open: boolean
  onClose: () => void
  title: string
  submitLabel: string
  pending: boolean
  error: unknown
  errorFallback: string
  canSubmit?: boolean
  onSubmit: () => void
  children: ReactNode
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (canSubmit && !pending) onSubmit()
  }
  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="sm">
      <form onSubmit={submit}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error != null && <Alert severity="error">{errorDetail(error, errorFallback)}</Alert>}
            {children}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!canSubmit || pending}>
            {pending ? <CircularProgress size={18} color="inherit" /> : submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export function ConfirmDialog({ open, onClose, title, children, confirmLabel, pending, error, onConfirm }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  confirmLabel: string
  pending: boolean
  error?: unknown
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {error != null && <Alert severity="error" sx={{ mb: 2 }}>{errorDetail(error, 'That did not work. Try again.')}</Alert>}
        <DialogContentText component="div">{children}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={pending}>Cancel</Button>
        <Button
          variant="contained" color="error" onClick={onConfirm} disabled={pending}
          startIcon={pending ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export type ColumnDraft = Pick<Column, 'name' | 'data_type' | 'description'>

const BQ_TYPES = ['STRING', 'INT64', 'NUMERIC', 'FLOAT64', 'BOOL', 'DATE', 'DATETIME', 'TIMESTAMP', 'JSON', 'BYTES', 'GEOGRAPHY', 'RECORD']

/** Columns for a table registered by hand; a sync replaces them with BigQuery's schema. */
export function ColumnsEditor({ columns, onChange }: { columns: ColumnDraft[]; onChange: (columns: ColumnDraft[]) => void }) {
  const set = (i: number, patch: Partial<ColumnDraft>) => onChange(columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  return (
    <Box>
      <Typography variant="subtitle2" component="h3">Columns</Typography>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
        Optional. If the table exists in BigQuery, the next sync of its project fills in the real schema.
      </Typography>
      {columns.map((c, i) => (
        <Box key={i} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 140px 1.3fr auto' }, gap: 1, mb: 1, alignItems: 'start' }}>
          <TextField size="small" label="Name" value={c.name} onChange={(e) => set(i, { name: e.target.value })} InputProps={{ sx: MONO }} />
          <Autocomplete
            freeSolo autoSelect size="small" options={BQ_TYPES}
            value={c.data_type ?? ''}
            onChange={(_, v) => set(i, { data_type: (v ?? '').toUpperCase() || null })}
            renderInput={(params) => <TextField {...params} label="Type" />}
          />
          <TextField size="small" label="Description" value={c.description ?? ''} onChange={(e) => set(i, { description: e.target.value })} />
          <IconButton aria-label={`Remove column ${c.name || i + 1}`} onClick={() => onChange(columns.filter((_, idx) => idx !== i))} sx={{ mt: 0.25, '&:hover': { color: tokens.danger } }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...columns, { name: '', data_type: 'STRING', description: '' }])}>
        Add column
      </Button>
    </Box>
  )
}

