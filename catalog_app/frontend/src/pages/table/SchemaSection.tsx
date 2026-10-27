import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import KeyIcon from '@mui/icons-material/Key'
import QueryStatsIcon from '@mui/icons-material/QueryStats'
import SecurityIcon from '@mui/icons-material/Security'
import VerifiedIcon from '@mui/icons-material/Verified'
import ViewWeekOutlinedIcon from '@mui/icons-material/ViewWeekOutlined'
import { tablesApi } from '../../api/tables'
import type { Column, Table as TableType } from '../../api/types'
import { MONO, MetaPill, Section, compactNumber, formatDateTime } from '../../components/ui'
import { tokens } from '../../theme'
import { useTableRefresh } from './shared'

function ColumnDescription({ col, editable, saving, onSave }: {
  col: Column
  editable: boolean
  saving: boolean
  onSave: (description: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const text = col.description || (editable ? 'Add description' : '—')

  if (!editable) {
    return <Typography variant="body2" color="text.secondary">{col.description || '—'}</Typography>
  }
  if (draft === null) {
    return (
      <ButtonBase
        onClick={() => setDraft(col.description ?? '')}
        aria-label={`Edit description of ${col.name}`}
        sx={{
          width: '100%', justifyContent: 'space-between', gap: 1, textAlign: 'left', px: 0.75, py: 0.5, mx: -0.75,
          borderRadius: `${tokens.radius}px`, color: col.description ? tokens.ink2 : tokens.ink3,
          fontStyle: col.description ? 'normal' : 'italic', fontSize: '0.875rem', lineHeight: 1.5,
          '& .edit-hint': { opacity: 0 }, '&:hover, &.Mui-focusVisible': { bgcolor: tokens.paper2, '& .edit-hint': { opacity: 1 } },
        }}
      >
        <span>{saving ? 'Saving…' : text}</span>
        <EditOutlinedIcon className="edit-hint" aria-hidden sx={{ fontSize: 15, color: tokens.ink3, flexShrink: 0 }} />
      </ButtonBase>
    )
  }
  const commit = () => {
    if (draft.trim() !== (col.description ?? '').trim()) onSave(draft.trim())
    setDraft(null)
  }
  return (
    <TextField
      autoFocus
      fullWidth
      multiline
      size="small"
      variant="standard"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
        if (e.key === 'Escape') setDraft(null)
      }}
      placeholder="Describe this column"
      inputProps={{ 'aria-label': `Description of ${col.name}` }}
      helperText="Enter to save · Esc to cancel"
    />
  )
}

function ColumnStats({ col }: { col: Column }) {
  if (!col.last_stats_at) return <Typography variant="caption" color="text.secondary">—</Typography>
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }} title={`Pulled ${formatDateTime(col.last_stats_at)}`}>
      {col.approx_count_distinct != null && <Typography variant="caption">~{compactNumber(col.approx_count_distinct)} distinct</Typography>}
      {col.null_pct != null && (
        <Typography variant="caption" sx={{ color: col.null_pct > 20 ? tokens.warning : 'text.secondary', fontWeight: col.null_pct > 20 ? 600 : 400 }}>
          {col.null_pct}% null
        </Typography>
      )}
      {(col.min_val != null || col.max_val != null) && (
        <Typography variant="caption" sx={{ ...MONO, fontSize: '0.6875rem', color: tokens.ink3, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }} noWrap>
          {col.min_val ?? '?'} – {col.max_val ?? '?'}
        </Typography>
      )}
    </Box>
  )
}

export default function SchemaSection({ table, editor }: { table: TableType; editor: boolean }) {
  const { replace, refetch } = useTableRefresh(table)
  const [savingColumn, setSavingColumn] = useState<string | null>(null)

  const describe = useMutation({
    mutationFn: (vars: { id: string; description: string }) => tablesApi.patchColumns(table.id, [vars]),
    onMutate: (vars) => setSavingColumn(vars.id),
    onSuccess: replace,
    onSettled: () => setSavingColumn(null),
  })
  const pii = useMutation({
    mutationFn: ({ colId, isPii }: { colId: string; isPii: boolean }) => tablesApi.togglePii(table.id, colId, isPii),
    onSuccess: refetch,
  })
  const stats = useMutation({ mutationFn: () => tablesApi.pullStats(table.id), onSuccess: refetch })

  const columns = [...table.columns].sort((a, b) => a.position - b.position)
  const statsPulled = columns.some((c) => c.last_stats_at)

  return (
    <Section
      title="Schema"
      icon={<ViewWeekOutlinedIcon fontSize="small" />}
      count={columns.length}
      actions={editor && (
        <Tooltip title="Approximate distinct values, null rate and min/max per column (runs a BigQuery query)">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={stats.isPending ? <CircularProgress size={14} /> : <QueryStatsIcon />}
              disabled={stats.isPending || columns.length === 0}
              onClick={() => stats.mutate()}
            >
              {stats.isPending ? 'Pulling stats…' : statsPulled ? 'Refresh column stats' : 'Pull column stats'}
            </Button>
          </span>
        </Tooltip>
      )}
    >
      <TableContainer sx={{ border: `1px solid ${tokens.rule}`, borderRadius: `${tokens.radius}px` }}>
        <Table size="small" aria-label={`Columns of ${table.table_id}`}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 40 }}>#</TableCell>
              <TableCell>Column</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Nullable</TableCell>
              <TableCell>PII</TableCell>
              <TableCell>Stats</TableCell>
              <TableCell sx={{ minWidth: 240 }}>Description</TableCell>
              {table.is_validated && <TableCell align="center">Validated</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {columns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={table.is_validated ? 8 : 7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                  No columns yet — they are read from BigQuery on the next sync.
                </TableCell>
              </TableRow>
            ) : columns.map((col) => (
              <TableRow key={col.id} hover>
                <TableCell sx={{ ...MONO, color: tokens.ink3 }}>{col.position + 1}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {col.is_primary_key && <KeyIcon titleAccess="Primary key" sx={{ fontSize: 14, color: tokens.warning }} />}
                    <Typography component="span" sx={{ ...MONO, fontWeight: col.is_primary_key ? 600 : 500, color: tokens.ink }}>{col.name}</Typography>
                  </Box>
                </TableCell>
                <TableCell sx={{ ...MONO, fontSize: '0.75rem', color: tokens.ink2, whiteSpace: 'nowrap' }}>{col.data_type || '—'}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ color: col.is_nullable ? tokens.ink3 : tokens.ink, fontWeight: col.is_nullable ? 400 : 600 }}>
                    {col.is_nullable ? 'Yes' : 'Required'}
                  </Typography>
                </TableCell>
                <TableCell>
                  {editor ? (
                    <Tooltip title={col.is_pii ? 'Flagged as PII — select to unflag' : 'Not PII — select to flag'}>
                      <IconButton
                        size="small"
                        aria-label={`PII: ${col.name}`}
                        aria-pressed={col.is_pii}
                        onClick={() => pii.mutate({ colId: col.id, isPii: !col.is_pii })}
                        disabled={pii.isPending}
                      >
                        <SecurityIcon sx={{ fontSize: 16, color: col.is_pii ? tokens.danger : tokens.ruleStrong }} />
                      </IconButton>
                    </Tooltip>
                  ) : col.is_pii ? <MetaPill tone="danger">PII</MetaPill> : <Typography variant="caption" color="text.secondary">—</Typography>}
                </TableCell>
                <TableCell><ColumnStats col={col} /></TableCell>
                <TableCell>
                  <ColumnDescription
                    col={col}
                    editable={editor}
                    saving={savingColumn === col.id}
                    onSave={(description) => describe.mutate({ id: col.id, description })}
                  />
                </TableCell>
                {table.is_validated && (
                  <TableCell align="center">
                    {table.validated_columns.includes(col.name)
                      ? <VerifiedIcon titleAccess="Validated" sx={{ fontSize: 16, color: tokens.success }} />
                      : <Typography variant="caption" color="text.secondary">—</Typography>}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Section>
  )
}
