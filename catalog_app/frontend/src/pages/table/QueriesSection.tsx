import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import CodeIcon from '@mui/icons-material/Code'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import type { ExampleQuery, Table } from '../../api/types'
import { CopyButton, MONO, Section } from '../../components/ui'
import { tokens } from '../../theme'
import { CODE_SX } from './PreviewSection'
import { useSaveQueries } from './shared'

function QueryForm({ initial, saving, onCancel, onSave }: {
  initial: ExampleQuery
  saving: boolean
  onCancel: () => void
  onSave: (q: ExampleQuery) => void
}) {
  const [draft, setDraft] = useState(initial)
  const valid = draft.title.trim() && draft.sql.trim()
  return (
    <Box
      component="form"
      onSubmit={(e) => { e.preventDefault(); if (valid) onSave({ title: draft.title.trim(), sql: draft.sql.trim() }) }}
      sx={{ border: `1px solid ${tokens.accent}`, borderRadius: `${tokens.radius}px`, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}
    >
      <TextField size="small" label="Title" required autoFocus placeholder="e.g. Orders from the last 7 days" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
      <TextField
        label="SQL" required multiline minRows={3} maxRows={14} placeholder="SELECT …" value={draft.sql}
        onChange={(e) => setDraft((d) => ({ ...d, sql: e.target.value }))}
        InputProps={{ sx: { ...MONO } }}
      />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button size="small" onClick={onCancel}>Cancel</Button>
        <Button size="small" type="submit" variant="contained" disabled={!valid || saving} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>
          Save
        </Button>
      </Box>
    </Box>
  )
}

export default function QueriesSection({ table, editor }: { table: Table; editor: boolean }) {
  const save = useSaveQueries(table)
  const queries = table.example_queries ?? []
  const [editing, setEditing] = useState<number | null>(null) // -1 = adding
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggle = (i: number) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    return next
  })

  const commit = (q: ExampleQuery) => {
    const updated = editing === -1 ? [...queries, q] : queries.map((old, i) => (i === editing ? q : old))
    save.mutate(updated, { onSuccess: () => setEditing(null) })
  }
  const remove = (i: number) => {
    if (!confirm(`Delete the example query "${queries[i].title}"?`)) return
    setExpanded(new Set())
    save.mutate(queries.filter((_, idx) => idx !== i))
  }

  return (
    <Section
      title="Example queries"
      icon={<CodeIcon fontSize="small" />}
      count={queries.length}
      actions={editor && editing === null && (
        <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setEditing(-1)}>Add query</Button>
      )}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {queries.map((q, i) => editing === i ? (
          <QueryForm key={`edit-${i}`} initial={q} saving={save.isPending} onCancel={() => setEditing(null)} onSave={commit} />
        ) : (
          <Box key={`q-${i}`} sx={{ border: `1px solid ${tokens.rule}`, borderRadius: `${tokens.radius}px` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pr: 0.5 }}>
              <ButtonBase
                onClick={() => toggle(i)}
                aria-expanded={expanded.has(i)}
                sx={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', gap: 1, px: 1.5, py: 1, textAlign: 'left' }}
              >
                <ExpandMoreIcon aria-hidden sx={{ fontSize: 18, color: tokens.ink3, transition: 'transform .2s', transform: expanded.has(i) ? 'none' : 'rotate(-90deg)' }} />
                <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{q.title || 'Untitled'}</Typography>
              </ButtonBase>
              <CopyButton text={q.sql} label={`Copy SQL of ${q.title}`} />
              {editor && (
                <>
                  <Tooltip title="Edit">
                    <span>
                      <IconButton size="small" aria-label={`Edit ${q.title}`} onClick={() => setEditing(i)} disabled={editing !== null || save.isPending}>
                        <EditOutlinedIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <span>
                      <IconButton size="small" aria-label={`Delete ${q.title}`} onClick={() => remove(i)} disabled={editing !== null || save.isPending}>
                        <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </>
              )}
            </Box>
            {expanded.has(i) && <Box component="pre" sx={{ ...CODE_SX, m: 1.5, mt: 0 }}>{q.sql}</Box>}
          </Box>
        ))}

        {editing === -1 && (
          <QueryForm initial={{ title: '', sql: '' }} saving={save.isPending} onCancel={() => setEditing(null)} onSave={commit} />
        )}

        {queries.length === 0 && editing === null && (
          <Typography variant="body2" color="text.secondary">
            No example queries yet.{editor && ' Add a SQL snippet that shows how this table is meant to be used.'}
          </Typography>
        )}
      </Box>
    </Section>
  )
}
