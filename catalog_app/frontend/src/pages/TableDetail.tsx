import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import TextField from '@mui/material/TextField'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import KeyIcon from '@mui/icons-material/Key'
import VerifiedIcon from '@mui/icons-material/Verified'
import PreviewIcon from '@mui/icons-material/Preview'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import CodeIcon from '@mui/icons-material/Code'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import EditNoteIcon from '@mui/icons-material/EditNote'
import SaveIcon from '@mui/icons-material/Save'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import SecurityIcon from '@mui/icons-material/Security'
import BarChartIcon from '@mui/icons-material/BarChart'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import ValidationWizard from '../components/ValidationWizard'
import { tablesApi } from '../api/tables'
import { datasetsApi } from '../api/datasets'
import { schemaChangesApi } from '../api/schemaChanges'
import type { ExampleQuery, SensitivityLabel } from '../api/types'

function bytes(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`
  return `${n} B`
}

export default function TableDetail() {
  const { datasetId, tableId } = useParams<{ datasetId: string; tableId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const previewScrollRef = useRef<HTMLDivElement>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [queries, setQueries] = useState<ExampleQuery[] | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null) // -1 = new
  const [editDraft, setEditDraft] = useState<ExampleQuery>({ title: '', sql: '' })
  const [expandedQueries, setExpandedQueries] = useState<Set<number>>(new Set())

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [editingColId, setEditingColId] = useState<string | null>(null)
  const [colDescDraft, setColDescDraft] = useState('')
  const [editingLineage, setEditingLineage] = useState(false)
  const [lineageDraft, setLineageDraft] = useState({ upstream: [''], downstream: [''] })

  const toggleExpand = (i: number) =>
    setExpandedQueries((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })

  const copySQL = (i: number, sql: string) => {
    navigator.clipboard.writeText(sql)
    setCopiedIndex(i)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const { data: tableChanges = [] } = useQuery({
    queryKey: ['schema-changes', tableId],
    queryFn: () => schemaChangesApi.list({ acknowledged: false, table_id: tableId }),
    enabled: !!tableId,
  })

  const ackChangeMutation = useMutation({
    mutationFn: (id: string) => schemaChangesApi.acknowledge(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schema-changes', tableId] })
      qc.invalidateQueries({ queryKey: ['schema-changes'] })
    },
  })

  const ackAllChangesMutation = useMutation({
    mutationFn: () => schemaChangesApi.acknowledgeAll(tableId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schema-changes', tableId] })
      qc.invalidateQueries({ queryKey: ['schema-changes'] })
    },
  })

  const patchColMutation = useMutation({
    mutationFn: (vars: { id: string; description: string }) =>
      tablesApi.patchColumns(tableId!, [{ id: vars.id, description: vars.description }]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['table', tableId] }),
  })

  const startColEdit = (id: string, current: string | null) => {
    setEditingColId(id)
    setColDescDraft(current ?? '')
  }

  const commitColEdit = () => {
    if (editingColId) {
      patchColMutation.mutate({ id: editingColId, description: colDescDraft })
    }
    setEditingColId(null)
  }

  const cancelColEdit = () => setEditingColId(null)

  const validateMutation = useMutation({
    mutationFn: (payload: { validated_by: string; validated_columns: string[] }) =>
      tablesApi.validate(tableId!, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['table', tableId] }),
  })

  const runPreviewMutation = useMutation({
    mutationFn: () => tablesApi.previewRun(tableId!),
  })

  const saveQueriesMutation = useMutation({
    mutationFn: (qs: ExampleQuery[]) => tablesApi.patchQueries(tableId!, qs),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['table', tableId] }),
  })

  const piiMutation = useMutation({
    mutationFn: ({ colId, isPii }: { colId: string; isPii: boolean }) =>
      tablesApi.togglePii(tableId!, colId, isPii),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['table', tableId] }),
  })

  const pullStatsMutation = useMutation({
    mutationFn: () => tablesApi.pullStats(tableId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['table', tableId] }),
  })

  const lineageMutation = useMutation({
    mutationFn: (refs: { upstream: string[]; downstream: string[] }) =>
      tablesApi.updateLineage(tableId!, refs.upstream, refs.downstream),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['table', tableId] })
      setEditingLineage(false)
    },
  })

  const { data: table, isLoading } = useQuery({
    queryKey: ['table', tableId],
    queryFn: () => tablesApi.get(tableId!),
    enabled: !!tableId,
  })

  useEffect(() => {
    if (table && queries === null) {
      setQueries(table.example_queries ?? [])
      setLineageDraft({
        upstream: table.upstream_refs?.length ? table.upstream_refs : [''],
        downstream: table.downstream_refs?.length ? table.downstream_refs : [''],
      })
    }
  }, [table]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: estimate, isLoading: estimateLoading, error: estimateError } = useQuery({
    queryKey: ['table', tableId, 'preview-estimate'],
    queryFn: () => tablesApi.previewEstimate(tableId!),
    enabled: previewOpen,
    retry: false,
  })

  const { data: dataset } = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => datasetsApi.get(datasetId!),
    enabled: !!datasetId,
  })

  const currentQueries = () => queries ?? []

  const startAdd = () => {
    setEditDraft({ title: '', sql: '' })
    setEditingIndex(-1)
  }

  const startEdit = (i: number) => {
    setEditDraft({ ...currentQueries()[i] })
    setEditingIndex(i)
  }

  const cancelEdit = () => setEditingIndex(null)

  const commitEdit = () => {
    const qs = currentQueries()
    const updated = editingIndex === -1
      ? [...qs, editDraft]
      : qs.map((q, i) => i === editingIndex ? editDraft : q)
    setQueries(updated)
    saveQueriesMutation.mutate(updated)
    setEditingIndex(null)
  }

  const deleteQuery = (i: number) => {
    const updated = currentQueries().filter((_, idx) => idx !== i)
    setQueries(updated)
    saveQueriesMutation.mutate(updated)
  }

  const saveFromPreview = (sql: string) => {
    const updated = [...currentQueries(), { title: 'Sample query', sql }]
    setQueries(updated)
    saveQueriesMutation.mutate(updated)
  }

  if (isLoading) {
    return (
      <Box>
        <Skeleton width={400} height={32} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={400} />
      </Box>
    )
  }

  if (!table) return <Alert severity="error">Table not found.</Alert>

  const displayQueries = queries ?? table.example_queries ?? []

  return (
    <Box>
      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => navigate('/browse')}>
          Catalog
        </Link>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => navigate(`/datasets/${datasetId}`)}>
          {dataset?.display_name || dataset?.dataset_id || 'Dataset'}
        </Link>
        <Typography color="text.primary">{table.display_name || table.table_id}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            {table.display_name || table.table_id}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {table.dataset_project_id}.{table.dataset_bq_dataset_id || table.dataset_display_name}.{table.table_id}
          </Typography>
        </Box>
        <SensitivityChip label={table.sensitivity_label as SensitivityLabel} size="medium" />
      </Box>

      {/* Stats chips */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <Tooltip title={table.is_validated ? 'Click to revoke trusted status' : 'Run validation wizard to mark as trusted'}>
          <Button
            variant={table.is_validated ? 'contained' : 'outlined'}
            size="small"
            startIcon={validateMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <VerifiedIcon />}
            onClick={() => table.is_validated ? validateMutation.mutate({ validated_by: '', validated_columns: [] }) : setWizardOpen(true)}
            disabled={validateMutation.isPending}
            color={table.is_validated ? 'success' : 'inherit'}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {table.is_validated ? 'Trusted source' : 'Mark as trusted source'}
          </Button>
        </Tooltip>
        {table.row_count != null && (
          <Chip label={`${table.row_count.toLocaleString()} rows`} size="small" variant="outlined" />
        )}
        {table.size_bytes != null && (
          <Chip label={bytes(table.size_bytes)} size="small" variant="outlined" />
        )}
        <Chip label={`${table.columns.length} columns`} size="small" variant="outlined" />
        {table.quality_score != null && (
          <Tooltip title="Data quality score (0–100). Based on description, column docs, validation, tags, and example queries.">
            <Chip
              label={`Quality: ${table.quality_score}%`}
              size="small"
              variant="outlined"
              sx={{
                bgcolor: table.quality_score >= 80 ? '#e6f4ea' : table.quality_score >= 50 ? '#fff8e1' : '#fce8e6',
                color: table.quality_score >= 80 ? '#137333' : table.quality_score >= 50 ? '#e37400' : '#c62828',
                borderColor: 'transparent',
                fontWeight: 600,
              }}
            />
          </Tooltip>
        )}
        {table.tags.map((t) => <TagChip key={t} tag={t} />)}
      </Box>

      {/* Schema change alerts */}
      {tableChanges.length > 0 && (
        <Box
          sx={{
            mb: 2, border: '1px solid #f9a825',
            borderRadius: 2, overflow: 'hidden',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, bgcolor: '#fffde7', borderBottom: '1px solid #f9a825' }}>
            <Typography variant="caption" fontWeight={700} sx={{ color: '#e65100', flex: 1 }}>
              {tableChanges.length} schema change{tableChanges.length !== 1 ? 's' : ''} detected since last sync
            </Typography>
            <Button
              size="small"
              startIcon={<DoneAllIcon sx={{ fontSize: '13px !important' }} />}
              onClick={() => ackAllChangesMutation.mutate()}
              disabled={ackAllChangesMutation.isPending}
              sx={{ fontSize: '0.68rem', textTransform: 'none', color: '#e65100' }}
            >
              Acknowledge all
            </Button>
          </Box>
          {tableChanges.map((c) => (
            <Box
              key={c.id}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                px: 2, py: 0.75,
                borderBottom: '1px solid', borderColor: 'divider',
                '&:last-child': { borderBottom: 'none' },
              }}
            >
              {c.change_type === 'column_added'
                ? <AddCircleOutlineIcon sx={{ fontSize: 15, color: '#2e7d32' }} />
                : <RemoveCircleOutlineIcon sx={{ fontSize: 15, color: '#c62828' }} />
              }
              <Typography variant="body2" sx={{ flex: 1 }}>
                Column <strong style={{ fontFamily: 'monospace' }}>{c.column_name}</strong>
                {' '}
                <span style={{ color: c.change_type === 'column_added' ? '#2e7d32' : '#c62828' }}>
                  {c.change_type === 'column_added' ? 'was added' : 'was removed'}
                </span>
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  · {new Date(c.detected_at).toLocaleString()}
                </Typography>
              </Typography>
              <IconButton
                size="small"
                onClick={() => ackChangeMutation.mutate(c.id)}
                disabled={ackChangeMutation.isPending}
                sx={{ color: 'text.disabled', '&:hover': { color: 'success.main' } }}
              >
                <CheckIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="h6" fontWeight={600}>
          Schema ({table.columns.length} columns)
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="outlined"
          startIcon={pullStatsMutation.isPending ? <CircularProgress size={12} /> : <BarChartIcon />}
          onClick={() => pullStatsMutation.mutate()}
          disabled={pullStatsMutation.isPending}
          sx={{ fontSize: '0.72rem', textTransform: 'none' }}
        >
          {pullStatsMutation.isPending ? 'Pulling…' : 'Pull stats'}
        </Button>
      </Box>

      {/* Schema table + Metadata side by side — same height */}
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'stretch', mb: 2 }}>
        <TableContainer component={Paper} variant="outlined" sx={{ flex: 1, minWidth: 0, alignSelf: 'stretch' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Column</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Nullable</TableCell>
                <TableCell>PII</TableCell>
                <TableCell>Stats</TableCell>
                <TableCell>Description</TableCell>
                {table.is_validated && <TableCell align="center" sx={{ width: 80 }}>Validated</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {table.columns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={table.is_validated ? 8 : 7} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      No columns registered
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                table.columns.map((col) => (
                  <TableRow key={col.id} hover>
                    <TableCell sx={{ color: 'text.secondary', width: 40 }}>{col.position + 1}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {col.is_primary_key && (
                          <KeyIcon sx={{ fontSize: 14, color: '#e37400' }} />
                        )}
                        <Typography variant="body2" fontWeight={col.is_primary_key ? 600 : 400} sx={{ fontFamily: 'monospace' }}>
                          {col.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={col.data_type || '—'}
                        size="small"
                        sx={{ fontSize: '0.65rem', height: 20, fontFamily: 'monospace', backgroundColor: '#f1f3f4' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color={col.is_nullable ? 'text.secondary' : 'error.main'}>
                        {col.is_nullable ? 'YES' : 'NO'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={col.is_pii ? 'PII — click to unflag' : 'Not PII — click to flag'}>
                        <IconButton size="small" onClick={() => piiMutation.mutate({ colId: col.id, isPii: !col.is_pii })}>
                          <SecurityIcon sx={{ fontSize: 15, color: col.is_pii ? '#c62828' : 'text.disabled' }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.72rem', color: 'text.secondary' }}>
                      {col.last_stats_at ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                          {col.approx_count_distinct != null && (
                            <Typography variant="caption">~{col.approx_count_distinct.toLocaleString()} distinct</Typography>
                          )}
                          {col.null_pct != null && (
                            <Typography variant="caption" color={col.null_pct > 20 ? 'warning.main' : 'text.secondary'}>
                              {col.null_pct}% null
                            </Typography>
                          )}
                          {(col.min_val != null || col.max_val != null) && (
                            <Typography variant="caption">
                              {col.min_val ?? '?'} – {col.max_val ?? '?'}
                            </Typography>
                          )}
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                    <TableCell
                      onClick={() => editingColId !== col.id && startColEdit(col.id, col.description)}
                      sx={{ cursor: 'text', minWidth: 220 }}
                    >
                      {editingColId === col.id ? (
                        <TextField
                          autoFocus
                          fullWidth
                          size="small"
                          variant="standard"
                          value={colDescDraft}
                          onChange={(e) => setColDescDraft(e.target.value)}
                          onBlur={commitColEdit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); commitColEdit() }
                            if (e.key === 'Escape') cancelColEdit()
                          }}
                          placeholder="Add description…"
                          InputProps={{ sx: { fontSize: '0.82rem' } }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <Box
                          sx={{
                            display: 'flex', alignItems: 'center', gap: 0.5,
                            '&:hover .edit-hint': { opacity: 1 },
                          }}
                        >
                          <Typography
                            variant="body2"
                            color={col.description ? 'text.secondary' : 'text.disabled'}
                            sx={{ fontStyle: col.description ? 'normal' : 'italic', flex: 1 }}
                          >
                            {col.description || 'Add description…'}
                          </Typography>
                          <EditNoteIcon
                            className="edit-hint"
                            sx={{ fontSize: 14, color: 'text.disabled', opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}
                          />
                        </Box>
                      )}
                    </TableCell>
                    {table.is_validated && (
                      <TableCell align="center">
                        {table.validated_columns.includes(col.name)
                          ? <VerifiedIcon sx={{ fontSize: 16, color: '#2e7d32' }} />
                          : <Typography variant="caption" color="text.disabled">—</Typography>
                        }
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Metadata */}
        <Card sx={{ minWidth: 260, flex: '0 0 260px', alignSelf: 'stretch' }}>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>Metadata</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {table.description || 'No description provided.'}
            </Typography>
            <Divider sx={{ mb: 1.5 }} />
            {table.owner && (
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" color="text.secondary">Owner</Typography>
                <Typography variant="body2">{table.owner}</Typography>
              </Box>
            )}
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">Registered</Typography>
              <Typography variant="body2">{new Date(table.created_at).toLocaleDateString()}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Last updated</Typography>
              <Typography variant="body2">{new Date(table.updated_at).toLocaleDateString()}</Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Preview button + section */}
      <Box>
        <Box sx={{ mt: 1.5 }}>
            <Button
              size="small"
              variant={previewOpen ? 'contained' : 'outlined'}
              startIcon={estimateLoading ? <CircularProgress size={14} /> : <PreviewIcon />}
              onClick={() => { setPreviewOpen((o) => { if (o) runPreviewMutation.reset(); return !o }) }}
              color={previewOpen ? 'primary' : 'inherit'}
            >
              {previewOpen ? 'Hide Preview' : 'Preview Data'}
            </Button>
          </Box>

          {/* Data Preview */}
          {previewOpen && (
            <Box sx={{ mt: 2 }}>
              {estimateLoading && <Skeleton variant="rounded" height={120} />}
              {estimateError && (
                <Alert severity="error">
                  {(estimateError as any)?.response?.data?.detail ?? 'Failed to load estimate.'}
                </Alert>
              )}
              {estimate && !runPreviewMutation.data && (
                <Card variant="outlined" sx={{ mb: 2 }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>Query to run</Typography>
                    <Box
                      component="pre"
                      sx={{
                        m: 0, p: 1.5, bgcolor: '#f8f9fa', borderRadius: 1,
                        fontFamily: 'monospace', fontSize: '0.8rem',
                        border: '1px solid', borderColor: 'divider',
                        overflowX: 'auto', whiteSpace: 'pre-wrap',
                      }}
                    >
                      {estimate.query}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<SaveIcon />}
                        onClick={() => saveFromPreview(estimate.query)}
                      >
                        Save query
                      </Button>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                          Estimated: <strong>{estimate.estimated_mb} MB</strong>
                          {estimate.estimated_cost_usd > 0
                            ? ` (~$${estimate.estimated_cost_usd.toFixed(4)})`
                            : ' (< $0.0001)'}
                        </Typography>
                      </Box>
                      <Box sx={{ flex: 1 }} />
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={runPreviewMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
                        onClick={() => runPreviewMutation.mutate()}
                        disabled={runPreviewMutation.isPending}
                      >
                        {runPreviewMutation.isPending ? 'Running…' : 'Run Query'}
                      </Button>
                    </Box>
                    {runPreviewMutation.isError && (
                      <Alert severity="error" sx={{ mt: 1 }}>
                        {(runPreviewMutation.error as any)?.response?.data?.detail ?? 'Query failed.'}
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              )}

              {runPreviewMutation.data && (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      Results — {runPreviewMutation.data.rows.length} rows
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <IconButton size="small" onClick={() => { if (previewScrollRef.current) previewScrollRef.current.scrollLeft -= 300 }}>
                      <ChevronLeftIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => { if (previewScrollRef.current) previewScrollRef.current.scrollLeft += 300 }}>
                      <ChevronRightIcon fontSize="small" />
                    </IconButton>
                    <Button size="small" variant="text" onClick={() => runPreviewMutation.reset()}>
                      Re-run
                    </Button>
                  </Box>
                  <Paper variant="outlined" sx={{ borderRadius: 1 }}>
                    <Box
                      ref={previewScrollRef}
                      sx={{ maxHeight: 400, overflowX: 'auto', overflowY: 'auto' }}
                    >
                      <Table size="small" sx={{ minWidth: 'max-content', tableLayout: 'auto' }}>
                        <TableHead>
                          <TableRow>
                            {runPreviewMutation.data.columns.map((col) => (
                              <TableCell key={col} sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.75rem', bgcolor: '#f8f9fa', whiteSpace: 'nowrap' }}>
                                {col}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {runPreviewMutation.data.rows.map((row, i) => (
                            <TableRow key={i} hover>
                              {runPreviewMutation.data!.columns.map((col) => (
                                <TableCell key={col} sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap', minWidth: 120 }}>
                                  {row[col] ?? <em style={{ color: '#aaa' }}>null</em>}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Box>
                  </Paper>
                </Box>
              )}
            </Box>
          )}
      </Box>

      {/* Example Queries */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <CodeIcon sx={{ color: 'text.secondary' }} />
          <Typography variant="h6" fontWeight={600}>Example Queries</Typography>
          <Chip label={displayQueries.length} size="small" sx={{ height: 18, fontSize: '0.7rem' }} />
          <Box sx={{ flex: 1 }} />
          {editingIndex === null && (
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={startAdd}>
              Add Query
            </Button>
          )}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* Saved queries list */}
          {displayQueries.map((q, i) => (
            editingIndex === i ? (
              /* Edit form */
              <Card key={`edit-${i}`} variant="outlined" sx={{ borderColor: 'primary.main', borderWidth: 2 }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <TextField
                    fullWidth size="small" label="Title"
                    value={editDraft.title}
                    onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder="e.g. Get last 7 days"
                    sx={{ mb: 1.5 }}
                    autoFocus
                  />
                  <TextField
                    fullWidth multiline minRows={3} maxRows={10}
                    label="SQL"
                    value={editDraft.sql}
                    onChange={(e) => setEditDraft((d) => ({ ...d, sql: e.target.value }))}
                    placeholder="SELECT * FROM ..."
                    InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.82rem' } }}
                    sx={{ mb: 1.5 }}
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                    <Button size="small" onClick={cancelEdit}>Cancel</Button>
                    <Button
                      size="small" variant="contained"
                      startIcon={saveQueriesMutation.isPending ? <CircularProgress size={13} color="inherit" /> : <SaveIcon />}
                      onClick={commitEdit}
                      disabled={!editDraft.title.trim() || !editDraft.sql.trim() || saveQueriesMutation.isPending}
                    >
                      Save
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            ) : (
              /* Read-only card — title only, expand to see SQL */
              <Card key={`query-${i}`} variant="outlined" sx={{ '&:hover': { borderColor: 'primary.light' } }}>
                <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CodeIcon sx={{ fontSize: 16, color: 'text.secondary', flexShrink: 0 }} />
                    <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
                      {q.title || <em style={{ color: '#aaa' }}>Untitled</em>}
                    </Typography>
                    <Button
                      size="small" variant="text"
                      endIcon={<ExpandMoreIcon sx={{ transform: expandedQueries.has(i) ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}
                      onClick={() => toggleExpand(i)}
                      sx={{ fontSize: '0.72rem', color: 'text.secondary', textTransform: 'none', minWidth: 0 }}
                    >
                      {expandedQueries.has(i) ? 'Hide' : 'Preview'}
                    </Button>
                    <IconButton size="small" onClick={() => startEdit(i)} disabled={editingIndex !== null}>
                      <EditNoteIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => deleteQuery(i)} disabled={editingIndex !== null}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  {expandedQueries.has(i) && (
                    <Box sx={{ mt: 1, position: 'relative' }}>
                      <Tooltip title={copiedIndex === i ? 'Copied!' : 'Copy SQL'}>
                        <IconButton
                          size="small"
                          onClick={() => copySQL(i, q.sql)}
                          sx={{ position: 'absolute', top: 6, right: 6, zIndex: 1, bgcolor: 'white', '&:hover': { bgcolor: '#f0f0f0' } }}
                        >
                          {copiedIndex === i
                            ? <CheckIcon sx={{ fontSize: 15, color: 'success.main' }} />
                            : <ContentCopyIcon sx={{ fontSize: 15 }} />}
                        </IconButton>
                      </Tooltip>
                      <Box
                        component="pre"
                        sx={{
                          m: 0, p: 1.5, pr: 5, bgcolor: '#f8f9fa', borderRadius: 1,
                          fontFamily: 'monospace', fontSize: '0.8rem',
                          border: '1px solid', borderColor: 'divider',
                          overflowX: 'auto', whiteSpace: 'pre-wrap', color: 'text.primary',
                        }}
                      >
                        {q.sql}
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>
            )
          ))}

          {/* New query form */}
          {editingIndex === -1 && (
            <Card key="new-query" variant="outlined" sx={{ borderColor: 'primary.main', borderWidth: 2 }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <TextField
                  fullWidth size="small" label="Title"
                  value={editDraft.title}
                  onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="e.g. Get last 7 days"
                  sx={{ mb: 1.5 }}
                  autoFocus
                />
                <TextField
                  fullWidth multiline minRows={3} maxRows={10}
                  label="SQL"
                  value={editDraft.sql}
                  onChange={(e) => setEditDraft((d) => ({ ...d, sql: e.target.value }))}
                  placeholder="SELECT * FROM ..."
                  InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.82rem' } }}
                  sx={{ mb: 1.5 }}
                />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                  <Button size="small" onClick={cancelEdit}>Cancel</Button>
                  <Button
                    size="small" variant="contained"
                    startIcon={saveQueriesMutation.isPending ? <CircularProgress size={13} color="inherit" /> : <SaveIcon />}
                    onClick={commitEdit}
                    disabled={!editDraft.title.trim() || !editDraft.sql.trim() || saveQueriesMutation.isPending}
                  >
                    Save
                  </Button>
                </Box>
              </CardContent>
            </Card>
          )}

          {displayQueries.length === 0 && editingIndex === null && (
            <Alert severity="info" icon={<CodeIcon />}>
              No example queries yet. Click <strong>Add Query</strong> to add a useful SQL snippet.
            </Alert>
          )}
        </Box>
      </Box>

      {/* Data Lineage */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <AccountTreeIcon sx={{ color: 'text.secondary' }} />
          <Typography variant="h6" fontWeight={600}>Data Lineage</Typography>
          <Box sx={{ flex: 1 }} />
          {!editingLineage && (
            <Button size="small" variant="outlined" startIcon={<EditNoteIcon />} onClick={() => setEditingLineage(true)}>
              Edit
            </Button>
          )}
        </Box>

        {editingLineage ? (
          <Box>
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Upstream datasets (one per line)"
              placeholder="project.dataset.table"
              value={lineageDraft.upstream.join('\n')}
              onChange={(e) => setLineageDraft(d => ({ ...d, upstream: e.target.value.split('\n') }))}
              sx={{ mb: 2 }}
              size="small"
            />
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Downstream datasets (one per line)"
              placeholder="project.dataset.table"
              value={lineageDraft.downstream.join('\n')}
              onChange={(e) => setLineageDraft(d => ({ ...d, downstream: e.target.value.split('\n') }))}
              sx={{ mb: 2 }}
              size="small"
            />
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button size="small" onClick={() => setEditingLineage(false)}>Cancel</Button>
              <Button
                size="small" variant="contained"
                onClick={() => {
                  lineageMutation.mutate({
                    upstream: lineageDraft.upstream.filter(s => s.trim()),
                    downstream: lineageDraft.downstream.filter(s => s.trim()),
                  })
                }}
                disabled={lineageMutation.isPending}
              >
                Save
              </Button>
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 1 }}>
                UPSTREAM (inputs)
              </Typography>
              {(table.upstream_refs ?? []).length === 0 ? (
                <Typography variant="body2" color="text.disabled">None defined</Typography>
              ) : (
                (table.upstream_refs ?? []).map((ref) => (
                  <Chip key={ref} label={ref} size="small" sx={{ fontFamily: 'monospace', mr: 0.5, mb: 0.5, fontSize: '0.72rem' }} />
                ))
              )}
            </Box>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 1 }}>
                DOWNSTREAM (consumers)
              </Typography>
              {(table.downstream_refs ?? []).length === 0 ? (
                <Typography variant="body2" color="text.disabled">None defined</Typography>
              ) : (
                (table.downstream_refs ?? []).map((ref) => (
                  <Chip key={ref} label={ref} size="small" sx={{ fontFamily: 'monospace', mr: 0.5, mb: 0.5, fontSize: '0.72rem' }} />
                ))
              )}
            </Box>
          </Box>
        )}
      </Box>

      <ValidationWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        table={table}
        onValidate={(validatedBy, validatedColumns) => validateMutation.mutate({ validated_by: validatedBy, validated_columns: validatedColumns })}
        isValidating={validateMutation.isPending}
      />
    </Box>
  )
}
