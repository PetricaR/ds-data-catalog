import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined'
import EditNoteIcon from '@mui/icons-material/EditNote'
import { errorDetail } from '../../api/client'
import { tablesApi } from '../../api/tables'
import type { Table } from '../../api/types'
import { MONO, MetaPill, Section } from '../../components/ui'
import { tokens } from '../../theme'
import { useTableRefresh } from './shared'

const lines = (text: string) => [...new Set(text.split('\n').map((s) => s.trim()).filter(Boolean))]

// A long `project.dataset.table` ref breaks after a dot before anywhere else; the span keeps it one flex item in the pill
const breakAfterDots = (ref: string) => <span>{ref.split(/(?<=\.)/).flatMap((part, i) => (i ? [<wbr key={i} />, part] : [part]))}</span>

function RefList({ title, refs }: { title: string; refs: string[] }) {
  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="overline" component="h3" sx={{ color: tokens.ink3, display: 'block', mb: 1 }}>{title}</Typography>
      {refs.length === 0 ? (
        <Typography variant="body2" color="text.secondary">None recorded</Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 0.75 }}>
          {refs.map((ref) => <li key={ref}><MetaPill mono wrap>{breakAfterDots(ref)}</MetaPill></li>)}
        </Box>
      )}
    </Box>
  )
}

export default function LineageSection({ table, editor }: { table: Table; editor: boolean }) {
  const { refetch } = useTableRefresh(table)
  const [draft, setDraft] = useState<{ upstream: string; downstream: string } | null>(null)
  const upstream = table.upstream_refs ?? []
  const downstream = table.downstream_refs ?? []

  const save = useMutation({
    mutationFn: (d: { upstream: string; downstream: string }) => tablesApi.updateLineage(table.id, lines(d.upstream), lines(d.downstream)),
    onSuccess: () => { refetch(); setDraft(null) },
  })
  const discover = useMutation({ mutationFn: () => tablesApi.discoverLineage(table.id), onSuccess: refetch, onError: () => {} })

  return (
    <Section
      title="Lineage"
      icon={<AccountTreeOutlinedIcon fontSize="small" />}
      count={upstream.length + downstream.length || undefined}
      actions={editor && !draft && (
        <>
          <Tooltip title="Read upstream and downstream tables from Google Cloud Data Lineage">
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={discover.isPending ? <CircularProgress size={14} /> : <CloudSyncOutlinedIcon />}
                onClick={() => discover.mutate()}
                disabled={discover.isPending}
              >
                {discover.isPending ? 'Discovering…' : 'Discover from GCP'}
              </Button>
            </span>
          </Tooltip>
          {/* The draft starts from the current refs, including ones discovered since the page loaded */}
          <Button size="small" variant="outlined" startIcon={<EditNoteIcon />} onClick={() => setDraft({ upstream: upstream.join('\n'), downstream: downstream.join('\n') })}>
            Edit
          </Button>
        </>
      )}
    >
      {discover.isError && <Alert severity="error" sx={{ mb: 2 }}>{errorDetail(discover.error, 'Lineage discovery failed.')}</Alert>}
      {discover.isSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => discover.reset()}>
          Found {discover.data.discovered_upstream.length} upstream and {discover.data.discovered_downstream.length} downstream table(s); they were added to the lists below.
        </Alert>
      )}
      {draft ? (
        <Box component="form" onSubmit={(e) => { e.preventDefault(); save.mutate(draft) }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <TextField
              multiline minRows={3} label="Upstream tables (inputs)" placeholder="project.dataset.table" helperText="One per line"
              value={draft.upstream} onChange={(e) => setDraft((d) => d && { ...d, upstream: e.target.value })}
              InputProps={{ sx: MONO }}
            />
            <TextField
              multiline minRows={3} label="Downstream tables (consumers)" placeholder="project.dataset.table" helperText="One per line"
              value={draft.downstream} onChange={(e) => setDraft((d) => d && { ...d, downstream: e.target.value })}
              InputProps={{ sx: MONO }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1.5 }}>
            <Button size="small" onClick={() => setDraft(null)}>Cancel</Button>
            <Button size="small" type="submit" variant="contained" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
          </Box>
        </Box>
      ) : (
        // A top-down pipeline: inputs, then this table, then its consumers
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
          <RefList title="Upstream" refs={upstream} />
          <ArrowDownwardIcon aria-hidden fontSize="small" sx={{ color: tokens.ruleStrong }} />
          <MetaPill tone="accent" mono wrap>{table.table_id}</MetaPill>
          <ArrowDownwardIcon aria-hidden fontSize="small" sx={{ color: tokens.ruleStrong }} />
          <RefList title="Downstream" refs={downstream} />
        </Box>
      )}
    </Section>
  )
}
