import { useState, type ReactElement, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import LinearProgress from '@mui/material/LinearProgress'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import BarChartIcon from '@mui/icons-material/BarChart'
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined'
import HistoryIcon from '@mui/icons-material/History'
import PolicyOutlinedIcon from '@mui/icons-material/PolicyOutlined'
import RuleIcon from '@mui/icons-material/Rule'
import { errorDetail } from '../../api/client'
import { tablesApi } from '../../api/tables'
import type { Table as TableType } from '../../api/types'
import { MONO, MetaPill, Section, StatTile, compactNumber, formatBytes, formatDate, formatDateTime, plural } from '../../components/ui'
import { tokens } from '../../theme'
import { useTableRefresh } from './shared'

const TABLE_BOX = { border: `1px solid ${tokens.rule}`, borderRadius: `${tokens.radius}px` } as const

/** A section whose content comes from running something on demand; "Run" also opens it. */
function OnDemandSection<T>({ title, icon, runLabel, runningLabel, run, summary, intro, pendingNote, render }: {
  title: string
  icon: ReactElement
  runLabel: string
  runningLabel: string
  run: { mutate: () => void; isPending: boolean; isError: boolean; error: unknown; data: T | undefined }
  summary?: (data: T) => ReactNode
  intro: ReactNode
  pendingNote?: string
  render: (data: T) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Section
      title={title}
      icon={icon}
      count={run.data && summary ? summary(run.data) : undefined}
      defaultOpen={false}
      open={open}
      onOpenChange={setOpen}
      actions={
        <Button
          size="small"
          variant="outlined"
          startIcon={run.isPending ? <CircularProgress size={14} /> : icon}
          disabled={run.isPending}
          onClick={() => { setOpen(true); run.mutate() }}
        >
          {run.isPending ? runningLabel : run.data ? 'Run again' : runLabel}
        </Button>
      }
    >
      {run.isError && <Alert severity="error" sx={{ mb: 2 }}>{errorDetail(run.error, `${title} failed.`)}</Alert>}
      {run.isPending && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }} role="status">
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">{pendingNote ?? 'Working…'}</Typography>
        </Box>
      )}
      {!run.data && !run.isPending && !run.isError && <Typography variant="body2" color="text.secondary">{intro}</Typography>}
      {run.data && !run.isPending && render(run.data)}
    </Section>
  )
}

// Editors only: these run as the catalog's service account
export function UsageSection({ table }: { table: TableType }) {
  const run = useMutation({ mutationFn: () => tablesApi.getUsage(table.id), onError: () => {} })
  return (
    <OnDemandSection
      title="Usage"
      icon={<BarChartIcon fontSize="small" />}
      runLabel="Fetch usage"
      runningLabel="Fetching…"
      run={run}
      summary={(d) => `${compactNumber(d.total_queries)} queries / ${d.period_days}d`}
      intro="Who queried this table in the last 30 days, from BigQuery's INFORMATION_SCHEMA.JOBS."
      render={(d) => (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '220px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
          <StatTile
            label={`Queries, last ${d.period_days} days`}
            value={compactNumber(d.total_queries)}
            hint={d.last_queried_at ? `Last ${formatDateTime(d.last_queried_at)}` : 'Not queried in this period'}
          />
          {d.top_users.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No queries found in this period.</Typography>
          ) : (
            <TableContainer sx={TABLE_BOX}>
              <Table size="small" aria-label="Top users">
                <TableHead>
                  <TableRow><TableCell>User</TableCell><TableCell align="right">Queries</TableCell><TableCell align="right">Avg scanned</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {d.top_users.map((u) => (
                    <TableRow key={u.email} hover>
                      <TableCell sx={{ ...MONO, overflowWrap: 'anywhere' }}>{u.email}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{u.query_count.toLocaleString()}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: tokens.ink3 }}>{formatBytes(u.avg_bytes)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}
    />
  )
}

export function PiiScanSection({ table }: { table: TableType }) {
  const { refetch } = useTableRefresh(table)
  const run = useMutation({ mutationFn: () => tablesApi.scanPii(table.id), onSuccess: refetch, onError: () => {} })
  return (
    <OnDemandSection
      title="PII detection"
      icon={<PolicyOutlinedIcon fontSize="small" />}
      runLabel="Run DLP scan"
      runningLabel="Scanning…"
      run={run}
      summary={(d) => {
        const n = Object.keys(d.findings_by_column ?? {}).length
        return n ? `${n} PII column${n === 1 ? '' : 's'}` : 'no PII found'
      }}
      intro="Scans a sample of rows with Cloud DLP and updates the PII flags in the schema."
      pendingNote="Scanning a sample with Cloud DLP…"
      render={(d) => {
        const findings = Object.entries(d.findings_by_column ?? {})
        return (
          <Box>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1.5 }}>
              Sampled up to {d.scanned_rows_limit.toLocaleString()} rows for {d.info_types_checked.length} info types · {formatDateTime(d.scanned_at)}
            </Typography>
            {findings.length === 0 ? (
              <Alert severity="success">No PII found in the sampled rows.</Alert>
            ) : (
              <TableContainer sx={TABLE_BOX}>
                <Table size="small" aria-label="PII findings">
                  <TableHead><TableRow><TableCell>Column</TableCell><TableCell>Detected types</TableCell></TableRow></TableHead>
                  <TableBody>
                    {findings.map(([col, types]) => (
                      <TableRow key={col} hover>
                        <TableCell sx={{ ...MONO, fontWeight: 600 }}>{col}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {types.map((t) => <MetaPill key={t} tone="danger" mono>{t}</MetaPill>)}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )
      }}
    />
  )
}

// Above this, the null check asks first: it reads every column of the whole table
const CONFIRM_SCAN_BYTES = 10 * 1024 ** 3

export function NullCheckSection({ table }: { table: TableType }) {
  const run = useMutation({ mutationFn: () => tablesApi.qualityCheck(table.id), onError: () => {} })
  const size = table.size_bytes
  const confirmed = {
    ...run,
    mutate: () => {
      const big = size == null || size > CONFIRM_SCAN_BYTES
      const read = size == null ? 'the whole table (its size is unknown)' : `about ${formatBytes(size)}`
      if (!big || confirm(`This check reads ${read} in BigQuery, billed to ${table.dataset_project_id}. Run it?`)) run.mutate()
    },
  }
  return (
    <OnDemandSection
      title="Null rates and date ranges"
      icon={<RuleIcon fontSize="small" />}
      runLabel="Run check"
      runningLabel="Checking…"
      run={confirmed}
      summary={(d) => `${d.columns.filter((c) => c.null_count > 0).length} of ${plural(d.columns.length, 'col')} with nulls`}
      intro={
        <>
          Counts the nulls in every column, and finds the earliest and latest value of each date and timestamp column, in
          one BigQuery query over the whole table{table.size_bytes != null && <> (it reads about {formatBytes(table.size_bytes)})</>}.
        </>
      }
      pendingNote="Running the check in BigQuery…"
      render={(d) => (
        <Box>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1.5 }}>
            {d.total_rows.toLocaleString()} rows · {formatDateTime(d.checked_at)}
          </Typography>
          <TableContainer sx={TABLE_BOX}>
            <Table size="small" aria-label="Null rates per column">
              <TableHead>
                <TableRow>
                  <TableCell>Column</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Nulls</TableCell>
                  <TableCell sx={{ minWidth: 160 }}>Null rate</TableCell>
                  <TableCell>Earliest – latest</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {d.columns.map((c) => (
                  <TableRow key={c.name} hover>
                    <TableCell sx={{ ...MONO, fontWeight: 600, overflowWrap: 'anywhere' }}>{c.name}</TableCell>
                    <TableCell sx={{ ...MONO, fontSize: '0.75rem', color: tokens.ink3 }}>{c.data_type ?? '—'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{c.null_count.toLocaleString()}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                          variant="determinate" value={c.null_rate} aria-label={`Null rate of ${c.name}`}
                          color={c.null_rate >= 50 ? 'warning' : 'primary'}
                          sx={{ flex: 1, maxWidth: 120 }}
                        />
                        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 44, textAlign: 'right' }}>{c.null_rate}%</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ ...MONO, fontSize: '0.75rem', color: tokens.ink2 }}>
                      {c.min_value || c.max_value ? `${c.min_value ?? '?'} – ${c.max_value ?? '?'}` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    />
  )
}

export function DataplexSection({ table }: { table: TableType }) {
  const run = useMutation({ mutationFn: () => tablesApi.dataplexQuality(table.id), onError: () => {} })
  return (
    <OnDemandSection
      title="Data quality (Dataplex)"
      icon={<FactCheckOutlinedIcon fontSize="small" />}
      runLabel="Run Dataplex scan"
      runningLabel="Running…"
      run={run}
      summary={(d) => d.data_quality_result && `${d.data_quality_result.score ?? '?'}% · ${d.data_quality_result.passed ? 'passed' : 'failed'}`}
      intro="Runs a managed Dataplex data-quality scan on the table. It can take a couple of minutes."
      pendingNote="Running the Dataplex scan and waiting for its result…"
      render={(d) => {
        const r = d.data_quality_result
        if (!r) return <Typography variant="body2" color="text.secondary">The scan returned no quality result.</Typography>
        const dimensions = r.dimensions ?? []
        return (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '220px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
            <StatTile
              label={r.passed ? 'Overall score · passed' : 'Overall score · failed'}
              value={`${r.score ?? '?'}%`}
              meter={r.score ?? undefined}
              hint={r.row_count != null ? `${r.row_count.toLocaleString()} rows checked` : undefined}
            />
            {dimensions.length > 0 && (
              <Box>
                <Typography variant="overline" component="h3" sx={{ color: tokens.ink3, display: 'block', mb: 1 }}>Dimensions</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {dimensions.map((dim) => (
                    <MetaPill key={dim.dimension} tone={dim.passed ? 'success' : 'danger'}>
                      {dim.dimension.toLowerCase()} · {dim.score ?? '?'}% · {dim.passed ? 'passed' : 'failed'}
                    </MetaPill>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )
      }}
    />
  )
}

const CHANGE_TONE = { COLUMN_ADDED: 'success', COLUMN_REMOVED: 'danger' } as const

export function SchemaHistorySection({ table }: { table: TableType }) {
  const run = useMutation({ mutationFn: () => tablesApi.getSchemaHistory(table.id), onError: () => {} })
  return (
    <OnDemandSection
      title="Schema history"
      icon={<HistoryIcon fontSize="small" />}
      runLabel="Load history"
      runningLabel="Loading…"
      run={run}
      summary={(d) => `${d.changes.length} change${d.changes.length === 1 ? '' : 's'}`}
      intro="Column additions, removals and type changes over the last 30 days, from Cloud Asset Inventory."
      render={(d) => d.changes.length === 0 ? (
        <Alert severity="success">No schema changes in the last {d.period_days} days.</Alert>
      ) : (
        <TableContainer sx={TABLE_BOX}>
          <Table size="small" aria-label="Schema changes">
            <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Change</TableCell><TableCell>Column</TableCell><TableCell>Details</TableCell></TableRow></TableHead>
            <TableBody>
              {d.changes.map((c, i) => (
                <TableRow key={i} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap', color: tokens.ink3 }}>{formatDate(c.detected_at)}</TableCell>
                  <TableCell>
                    <MetaPill tone={CHANGE_TONE[c.type as keyof typeof CHANGE_TONE] ?? 'warning'}>
                      {(c.type ?? '').replace(/^COLUMN_/, '').replace(/_/g, ' ').toLowerCase()}
                    </MetaPill>
                  </TableCell>
                  <TableCell sx={{ ...MONO, fontWeight: 600 }}>{c.column ?? '—'}</TableCell>
                  <TableCell sx={{ ...MONO, fontSize: '0.75rem', color: tokens.ink3 }}>
                    {c.old_type && c.new_type ? `${c.old_type} → ${c.new_type}`
                      : c.old_mode && c.new_mode ? `${c.old_mode} → ${c.new_mode}`
                      : c.new_type ?? c.old_type ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    />
  )
}
