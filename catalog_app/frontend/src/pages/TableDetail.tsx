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
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import CloudSyncIcon from '@mui/icons-material/CloudSync'
import FolderSpecialIcon from '@mui/icons-material/FolderSpecial'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined'
import QuestionMarkIcon from '@mui/icons-material/QuestionMark'
import GridOnIcon from '@mui/icons-material/GridOn'
import NumbersIcon from '@mui/icons-material/Numbers'
import SdStorageIcon from '@mui/icons-material/SdStorage'
import ViewWeekIcon from '@mui/icons-material/ViewWeek'
import LanguageIcon from '@mui/icons-material/Language'
import UpdateIcon from '@mui/icons-material/Update'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import ValidationWizard from '../components/ValidationWizard'
import { tablesApi } from '../api/tables'
import { datasetsApi } from '../api/datasets'
import { schemaChangesApi } from '../api/schemaChanges'
import type { ExampleQuery, ProjectUsage, SensitivityLabel, TableInsights, UsageStats, PiiScanResult, DataplexQualityResult, SchemaHistoryResult } from '../api/types'

// Icon aliases for new sections
import BarChartIcon from '@mui/icons-material/BarChart'
import PolicyIcon from '@mui/icons-material/Policy'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import HistoryIcon from '@mui/icons-material/History'

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
  const emptyProject = (): ProjectUsage => ({ project_name: '', jira_id: '', repo_url: '' })
  const [editingProjects, setEditingProjects] = useState(false)
  const [projectsDraft, setProjectsDraft] = useState<ProjectUsage[]>([emptyProject()])
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [schemaOpen, setSchemaOpen] = useState(true)
  const [queriesOpen, setQueriesOpen] = useState(true)
  const [lineageOpen, setLineageOpen] = useState(true)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [insightsOpen, setInsightsOpen] = useState(true)

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

  const lineageMutation = useMutation({
    mutationFn: (refs: { upstream: string[]; downstream: string[] }) =>
      tablesApi.updateLineage(tableId!, refs.upstream, refs.downstream),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['table', tableId] })
      setEditingLineage(false)
    },
  })

  const discoverLineageMutation = useMutation({
    mutationFn: () => tablesApi.discoverLineage(tableId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['table', tableId] }),
  })

  const projectsMutation = useMutation({
    mutationFn: (projects: ProjectUsage[]) => tablesApi.updateProjects(tableId!, projects),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['table', tableId] })
      setEditingProjects(false)
    },
  })

  const descMutation = useMutation({
    mutationFn: (description: string) => tablesApi.update(tableId!, { description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['table', tableId] })
      setEditingDesc(false)
    },
  })

  const insightsMutation = useMutation({
    mutationFn: () => tablesApi.generateInsights(tableId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['table', tableId] }),
  })

  // ── New Google API sections ─────────────────────────────────────────────────
  const [usageOpen, setUsageOpen] = useState(false)
  const [piiOpen, setPiiOpen] = useState(false)
  const [dataplexOpen, setDataplexOpen] = useState(false)
  const [schemaHistoryOpen, setSchemaHistoryOpen] = useState(false)

  const [usageData, setUsageData] = useState<UsageStats | null>(null)
  const [piiData, setPiiData] = useState<PiiScanResult | null>(null)
  const [dataplexData, setDataplexData] = useState<DataplexQualityResult | null>(null)
  const [schemaHistoryData, setSchemaHistoryData] = useState<SchemaHistoryResult | null>(null)

  const usageMutation = useMutation({
    mutationFn: () => tablesApi.getUsage(tableId!),
    onSuccess: (data) => setUsageData(data),
  })
  const piiMutationScan = useMutation({
    mutationFn: () => tablesApi.scanPii(tableId!),
    onSuccess: (data) => {
      setPiiData(data)
      qc.invalidateQueries({ queryKey: ['table', tableId] })
    },
  })
  const dataplexMutation = useMutation({
    mutationFn: () => tablesApi.dataplexQuality(tableId!),
    onSuccess: (data) => setDataplexData(data),
  })
  const schemaHistoryMutation = useMutation({
    mutationFn: () => tablesApi.getSchemaHistory(tableId!),
    onSuccess: (data) => setSchemaHistoryData(data),
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
      setProjectsDraft(
        table.used_in_projects?.length ? table.used_in_projects : [emptyProject()]
      )
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
      <Breadcrumbs sx={{ mb: 2, '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap' } }}>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer', fontSize: '0.8rem' }} onClick={() => navigate('/browse')}>
          Catalog
        </Link>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer', fontSize: '0.8rem' }} onClick={() => navigate(`/datasets/${datasetId}`)}>
          {dataset?.display_name || dataset?.dataset_id || 'Dataset'}
        </Link>
        <Typography sx={{ fontSize: '0.8rem', color: 'text.primary', fontWeight: 500 }}>
          {table.display_name || table.table_id}
        </Typography>
      </Breadcrumbs>

      {/* Header card */}
      <Box sx={{ mb: 3, p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', bgcolor: '#fff' }}>

        {/* Top row: icon + name + button */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2.5 }}>
          <Box sx={{ p: 1.25, borderRadius: 2.5, bgcolor: '#e8f0fe', flexShrink: 0, mt: 0.25 }}>
            <GridOnIcon sx={{ color: '#1a73e8', fontSize: 28 }} />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" fontWeight={700} sx={{ fontSize: '1.35rem', lineHeight: 1.3, mb: 0.4 }}>
              {table.display_name || table.table_id}
            </Typography>
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'text.disabled', lineHeight: 1.4 }}>
              {table.dataset_project_id}.{table.dataset_bq_dataset_id || table.dataset_display_name}.{table.table_id}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
              {table.is_validated && (
                <Chip
                  icon={<VerifiedIcon sx={{ fontSize: '13px !important' }} />}
                  label="Trusted source"
                  size="small"
                  sx={{ height: 22, fontSize: '0.72rem', fontWeight: 600, bgcolor: '#e6f4ea', color: '#137333', border: 'none' }}
                />
              )}
              <SensitivityChip label={table.sensitivity_label as SensitivityLabel} size="small" />
              {table.tags.map((t) => <TagChip key={t} tag={t} />)}
            </Box>
          </Box>

          <Tooltip title={table.is_validated ? 'Click to revoke trusted status' : 'Run validation wizard to mark as trusted'}>
            <Button
              variant={table.is_validated ? 'contained' : 'outlined'}
              size="small"
              startIcon={validateMutation.isPending ? <CircularProgress size={13} color="inherit" /> : <VerifiedIcon />}
              onClick={() => table.is_validated ? validateMutation.mutate({ validated_by: '', validated_columns: [] }) : setWizardOpen(true)}
              disabled={validateMutation.isPending}
              color={table.is_validated ? 'success' : 'inherit'}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', flexShrink: 0, mt: 0.25 }}
            >
              {table.is_validated ? 'Trusted' : 'Mark as trusted'}
            </Button>
          </Tooltip>
        </Box>

        {/* Divider */}
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mb: 2 }} />

        {/* Stats pills row */}
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            table.row_count != null && { icon: <NumbersIcon />, label: `${table.row_count.toLocaleString()} rows`, bg: '#f1f3f4', color: '#3c4043', iconColor: '#5f6368' },
            table.size_bytes != null && { icon: <SdStorageIcon />, label: bytes(table.size_bytes), bg: '#f1f3f4', color: '#3c4043', iconColor: '#5f6368' },
            { icon: <ViewWeekIcon />, label: `${table.columns.length} cols`, bg: '#f1f3f4', color: '#3c4043', iconColor: '#5f6368' },
            dataset?.bq_location && { icon: <LanguageIcon />, label: dataset.bq_location, bg: '#e8f0fe', color: '#1a73e8', iconColor: '#1a73e8' },
            table.bq_created_at && { icon: <CalendarTodayIcon />, label: `Created ${new Date(table.bq_created_at).toLocaleDateString()}`, bg: '#fce8e6', color: '#c5221f', iconColor: '#c5221f' },
            table.bq_last_modified && { icon: <UpdateIcon />, label: `Modified ${new Date(table.bq_last_modified).toLocaleDateString()}`, bg: '#e6f4ea', color: '#137333', iconColor: '#137333' },
            table.quality_score != null && {
              icon: null,
              label: `Quality ${table.quality_score}%`,
              bg: table.quality_score >= 80 ? '#e6f4ea' : table.quality_score >= 50 ? '#fff8e1' : '#fce8e6',
              color: table.quality_score >= 80 ? '#137333' : table.quality_score >= 50 ? '#e37400' : '#c62828',
              iconColor: '',
            },
          ].filter(Boolean).map((item: any, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.1, py: 0.45, borderRadius: '8px', bgcolor: item.bg }}>
              {item.icon && <Box sx={{ display: 'flex', color: item.iconColor, '& svg': { fontSize: '12px !important' } }}>{item.icon}</Box>}
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: item.color, lineHeight: 1 }}>
                {item.label}
              </Typography>
            </Box>
          ))}
        </Box>
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

      {/* Table description */}
      {editingDesc ? (
        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            size="small"
            autoFocus
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            placeholder="Add a description for this table…"
            onKeyDown={(e) => { if (e.key === 'Escape') setEditingDesc(false) }}
          />
          <Box sx={{ display: 'flex', gap: 1, mt: 0.75 }}>
            <Button size="small" variant="contained" disabled={descMutation.isPending}
              onClick={() => descMutation.mutate(descDraft)}>
              {descMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button size="small" onClick={() => setEditingDesc(false)}>Cancel</Button>
          </Box>
        </Box>
      ) : (
        <Box
          onClick={() => { setDescDraft(table.description || ''); setEditingDesc(true) }}
          sx={{
            mb: 2.5, px: 2, py: 1.5, cursor: 'text',
            borderRadius: 2,
            border: '1px solid',
            borderColor: table.description ? 'divider' : '#e0e0e0',
            bgcolor: table.description ? '#f8f9fa' : '#fafafa',
            '&:hover': { borderColor: '#1a73e8', bgcolor: '#f0f6ff' },
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          <Typography variant="caption" fontWeight={700} color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', mb: 0.5 }}>
            Table Description
          </Typography>
          <Typography
            variant="body1"
            color={table.description ? 'text.primary' : 'text.disabled'}
            sx={{ lineHeight: 1.75, whiteSpace: 'pre-wrap', fontStyle: table.description ? 'normal' : 'italic' }}
          >
            {table.description || 'Click to add a description…'}
          </Typography>
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="h6" fontWeight={600}>
          Schema ({table.columns.length} columns)
        </Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={() => setSchemaOpen((o) => !o)}>
          <ExpandMoreIcon sx={{ fontSize: 20, transform: schemaOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </IconButton>
      </Box>

      {/* Schema table + Metadata side by side — same height */}
      {schemaOpen && <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'stretch', mb: 2 }}>
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
      </Box>}

      {/* Data Preview */}
      <Box sx={{ mt: 3 }}>
        {/* Section header row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <PreviewIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          <Typography variant="h6" fontWeight={600}>Data Preview</Typography>
          <Box sx={{ flex: 1 }} />
          <IconButton size="small" onClick={() => { setPreviewOpen((o) => { if (o) runPreviewMutation.reset(); return !o }) }}>
            <ExpandMoreIcon sx={{ fontSize: 20, transform: previewOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </IconButton>
        </Box>

        {previewOpen && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {estimateLoading && <Skeleton variant="rounded" height={120} />}
            {estimateError && (
              <Alert severity="error">
                {(estimateError as any)?.response?.data?.detail ?? 'Failed to load estimate.'}
              </Alert>
            )}

            {estimate && !runPreviewMutation.data && (
              <Card variant="outlined">
                <CardContent sx={{ py: 2, px: 2.5, '&:last-child': { pb: 2 } }}>
                  <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.75 }}>Query to run</Typography>
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
                <Paper variant="outlined" sx={{ borderRadius: 2 }}>
                  <Box
                    ref={previewScrollRef}
                    sx={{ maxHeight: 400, overflowX: 'auto', overflowY: 'auto' }}
                  >
                    <Table size="small" sx={{ minWidth: 'max-content', tableLayout: 'auto' }}>
                      <TableHead>
                        <TableRow>
                          {runPreviewMutation.data.columns.map((col) => (
                            <TableCell
                              key={col}
                              sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.75rem', bgcolor: '#f8f9fa', whiteSpace: 'nowrap', py: 1.25 }}
                            >
                              {col}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {runPreviewMutation.data.rows.map((row, i) => (
                          <TableRow key={i} hover>
                            {runPreviewMutation.data!.columns.map((col) => (
                              <TableCell key={col} sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap', minWidth: 120, py: 1 }}>
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
          <IconButton size="small" onClick={() => setQueriesOpen((o) => !o)} sx={{ ml: 0.5 }}>
            <ExpandMoreIcon sx={{ fontSize: 20, transform: queriesOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </IconButton>
        </Box>

        {queriesOpen && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
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
        </Box>}
      </Box>

      {/* Insights */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <AutoAwesomeIcon sx={{ color: '#9334e6' }} />
          <Typography variant="h6" fontWeight={600}>Insights</Typography>
          {table.insights_generated_at && (
            <Typography variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>
              Generated {new Date(table.insights_generated_at).toLocaleDateString()}
            </Typography>
          )}
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            variant={table.insights ? 'outlined' : 'contained'}
            startIcon={insightsMutation.isPending
              ? <CircularProgress size={14} color="inherit" />
              : <AutoAwesomeIcon sx={{ fontSize: '15px !important' }} />}
            onClick={() => insightsMutation.mutate()}
            disabled={insightsMutation.isPending}
            sx={table.insights ? {} : { background: 'linear-gradient(90deg,#9334e6,#1a73e8)', color: '#fff', border: 'none', '&:hover': { opacity: 0.9, border: 'none' } }}
          >
            {insightsMutation.isPending ? 'Generating…' : table.insights ? 'Regenerate' : 'Generate Insights'}
          </Button>
          <IconButton size="small" onClick={() => setInsightsOpen((o) => !o)} sx={{ ml: 0.5 }}>
            <ExpandMoreIcon sx={{ fontSize: 20, transform: insightsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </IconButton>
        </Box>

        {insightsOpen && insightsMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {(insightsMutation.error as any)?.response?.data?.detail ?? 'Failed to generate insights. Check GCP credentials.'}
          </Alert>
        )}

        {insightsOpen && (!table.insights ? (
          <Box
            sx={{
              border: '1px dashed', borderColor: 'divider', borderRadius: 2,
              p: 4, textAlign: 'center',
              background: 'linear-gradient(135deg, #faf5ff 0%, #eff6ff 100%)',
            }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 40, color: '#9334e6', mb: 1.5, opacity: 0.7 }} />
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Insights have not yet been generated
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, maxWidth: 520, mx: 'auto' }}>
              Generate insights to uncover key patterns — e.g. top selling products, revenue trends, or churn risk.
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Based on profile data, table and column descriptions.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Questions */}
            {table.insights.questions.length > 0 && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                  <QuestionMarkIcon sx={{ fontSize: 16, color: '#1a73e8' }} />
                  <Typography variant="subtitle2" fontWeight={600} color="primary">
                    Analysis Questions
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {table.insights.questions.map((q, i) => (
                    <Box
                      key={i}
                      sx={{
                        display: 'flex', alignItems: 'flex-start', gap: 1.5,
                        px: 2, py: 1.25,
                        bgcolor: '#f0f4ff', borderRadius: 1.5,
                        border: '1px solid #c7d7fc',
                      }}
                    >
                      <Typography variant="body2" sx={{ fontStyle: 'italic', color: '#1a3a6b' }}>
                        "{q}"
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Observations */}
            {table.insights.observations.length > 0 && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                  <LightbulbOutlinedIcon sx={{ fontSize: 16, color: '#e37400' }} />
                  <Typography variant="subtitle2" fontWeight={600} sx={{ color: '#e37400' }}>
                    Observations
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {table.insights.observations.map((obs, i) => (
                    <Box
                      key={i}
                      sx={{
                        display: 'flex', alignItems: 'flex-start', gap: 1.5,
                        px: 2, py: 1.25,
                        bgcolor: '#fff8e1', borderRadius: 1.5,
                        border: '1px solid #ffe082',
                      }}
                    >
                      <LightbulbOutlinedIcon sx={{ fontSize: 15, color: '#e37400', mt: 0.2, flexShrink: 0 }} />
                      <Typography variant="body2" color="text.secondary">{obs}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Use cases */}
            {table.insights.use_cases.length > 0 && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                  <AutoAwesomeIcon sx={{ fontSize: 16, color: '#9334e6' }} />
                  <Typography variant="subtitle2" fontWeight={600} sx={{ color: '#9334e6' }}>
                    DS / ML Use Cases
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {table.insights.use_cases.map((uc, i) => (
                    <Chip
                      key={i}
                      label={uc}
                      size="small"
                      sx={{
                        bgcolor: '#f3e8ff', color: '#6b21a8',
                        border: '1px solid #d8b4fe',
                        fontSize: '0.75rem', height: 'auto',
                        '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 },
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      {/* Data Lineage */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <AccountTreeIcon sx={{ color: 'text.secondary' }} />
          <Typography variant="h6" fontWeight={600}>Data Lineage</Typography>
          <Box sx={{ flex: 1 }} />
          {discoverLineageMutation.isError && (
            <Typography variant="caption" color="error.main" sx={{ mr: 1 }}>
              {(discoverLineageMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Discovery failed'}
            </Typography>
          )}
          {!editingLineage && (
            <Tooltip title="Auto-discover lineage from Google Cloud Data Lineage API" arrow>
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={discoverLineageMutation.isPending ? <CircularProgress size={13} /> : <CloudSyncIcon />}
                  onClick={() => discoverLineageMutation.mutate()}
                  disabled={discoverLineageMutation.isPending}
                  sx={{ mr: 0.75 }}
                >
                  {discoverLineageMutation.isPending ? 'Discovering…' : 'Discover from GCP'}
                </Button>
              </span>
            </Tooltip>
          )}
          {!editingLineage && (
            <Button size="small" variant="outlined" startIcon={<EditNoteIcon />} onClick={() => setEditingLineage(true)}>
              Edit
            </Button>
          )}
          <IconButton size="small" onClick={() => setLineageOpen((o) => !o)} sx={{ ml: 0.5 }}>
            <ExpandMoreIcon sx={{ fontSize: 20, transform: lineageOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </IconButton>
        </Box>

        {lineageOpen && (editingLineage ? (
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
        ))}
      </Box>

      {/* Used in DS Projects */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <FolderSpecialIcon sx={{ color: 'text.secondary' }} />
          <Typography variant="h6" fontWeight={600}>Used in DS Projects</Typography>
          <Chip label={(table.used_in_projects ?? []).length} size="small" sx={{ height: 18, fontSize: '0.7rem' }} />
          <Box sx={{ flex: 1 }} />
          {!editingProjects && (
            <Button
              size="small" variant="outlined" startIcon={<EditNoteIcon />}
              onClick={() => {
                setProjectsDraft(
                  table.used_in_projects?.length ? [...table.used_in_projects] : [emptyProject()]
                )
                setEditingProjects(true)
              }}
            >
              Edit
            </Button>
          )}
          <IconButton size="small" onClick={() => setProjectsOpen((o) => !o)} sx={{ ml: 0.5 }}>
            <ExpandMoreIcon sx={{ fontSize: 20, transform: projectsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </IconButton>
        </Box>

        {projectsOpen && (editingProjects ? (
          <Box>
            {projectsDraft.map((p, i) => (
              <Card key={i} variant="outlined" sx={{ mb: 1.5, p: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
                  <IconButton
                    size="small"
                    onClick={() => setProjectsDraft(d => d.filter((_, idx) => idx !== i))}
                    sx={{ color: 'text.disabled' }}
                  >
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <TextField
                    size="small" label="Project name *" fullWidth required
                    value={p.project_name}
                    onChange={(e) => setProjectsDraft(d => d.map((x, idx) => idx === i ? { ...x, project_name: e.target.value } : x))}
                  />
                  <TextField
                    size="small" label="JIRA ID" fullWidth
                    placeholder="IIB-1234"
                    value={p.jira_id ?? ''}
                    onChange={(e) => setProjectsDraft(d => d.map((x, idx) => idx === i ? { ...x, jira_id: e.target.value } : x))}
                  />
                  <TextField
                    size="small" label="Repo URL" fullWidth
                    placeholder="https://github.com/org/repo"
                    value={p.repo_url ?? ''}
                    onChange={(e) => setProjectsDraft(d => d.map((x, idx) => idx === i ? { ...x, repo_url: e.target.value } : x))}
                  />
                </Box>
              </Card>
            ))}
            <Button
              size="small" startIcon={<AddIcon />}
              onClick={() => setProjectsDraft(d => [...d, emptyProject()])}
              sx={{ mb: 2 }}
            >
              Add project
            </Button>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button size="small" onClick={() => setEditingProjects(false)}>Cancel</Button>
              <Button
                size="small" variant="contained"
                disabled={projectsMutation.isPending || projectsDraft.some(p => !p.project_name.trim())}
                onClick={() => projectsMutation.mutate(projectsDraft.filter(p => p.project_name.trim()))}
              >
                Save
              </Button>
            </Box>
          </Box>
        ) : (table.used_in_projects ?? []).length === 0 ? (
          <Alert severity="info" icon={<FolderSpecialIcon />}>
            No DS projects linked yet. Click <strong>Edit</strong> to add projects that use this table.
          </Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {(table.used_in_projects ?? []).map((p, i) => (
              <Card key={i} variant="outlined" sx={{ px: 2, py: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <FolderSpecialIcon sx={{ fontSize: 18, color: 'primary.main', mt: 0.25 }} />
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="subtitle2" fontWeight={600}>{p.project_name}</Typography>
                      {p.jira_id && (
                        <Chip label={p.jira_id} size="small" sx={{ fontSize: '0.65rem', height: 20, bgcolor: '#e8f0fe', color: '#1a73e8', fontFamily: 'monospace' }} />
                      )}
                      {p.repo_url && (
                        <Tooltip title={p.repo_url}>
                          <Chip
                            icon={<OpenInNewIcon sx={{ fontSize: '12px !important' }} />}
                            label="Repo"
                            size="small"
                            clickable
                            component="a"
                            href={p.repo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ fontSize: '0.65rem', height: 20 }}
                          />
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                </Box>
              </Card>
            ))}
          </Box>
        ))}
      </Box>

      {/* ── Usage Stats ── */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: usageOpen ? 2 : 0 }}>
          <BarChartIcon sx={{ color: 'text.secondary' }} />
          <Typography variant="h6" fontWeight={600}>Usage Statistics</Typography>
          {usageData && (
            <Chip label={`${usageData.total_queries} queries / ${usageData.period_days}d`} size="small" sx={{ height: 18, fontSize: '0.7rem' }} />
          )}
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            variant="outlined"
            startIcon={usageMutation.isPending ? <CircularProgress size={13} /> : <BarChartIcon />}
            disabled={usageMutation.isPending}
            onClick={() => { usageMutation.mutate(); setUsageOpen(true) }}
          >
            {usageMutation.isPending ? 'Loading…' : 'Fetch Usage'}
          </Button>
          <IconButton size="small" onClick={() => setUsageOpen((o) => !o)} sx={{ ml: 0.5 }}>
            <ExpandMoreIcon sx={{ fontSize: 20, transform: usageOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </IconButton>
        </Box>

        {usageOpen && (
          <>
            {usageMutation.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {(usageMutation.error as any)?.response?.data?.detail ?? 'Failed to fetch usage stats.'}
              </Alert>
            )}
            {!usageData && !usageMutation.isPending && (
              <Alert severity="info" icon={<BarChartIcon />}>
                Click <strong>Fetch Usage</strong> to query INFORMATION_SCHEMA.JOBS for who is using this table.
              </Alert>
            )}
            {usageData && (
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Card variant="outlined" sx={{ flex: '0 0 200px' }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary">Total queries (last {usageData.period_days}d)</Typography>
                    <Typography variant="h4" fontWeight={700} color="primary">{usageData.total_queries.toLocaleString()}</Typography>
                    {usageData.last_queried_at && (
                      <Typography variant="caption" color="text.secondary">
                        Last: {new Date(usageData.last_queried_at).toLocaleDateString()}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
                <Box sx={{ flex: 1, minWidth: 280 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 1 }}>TOP USERS</Typography>
                  {usageData.top_users.length === 0 ? (
                    <Typography variant="body2" color="text.disabled">No queries found in this period.</Typography>
                  ) : (
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>User</TableCell>
                            <TableCell align="right">Queries</TableCell>
                            <TableCell align="right">Avg bytes</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {usageData.top_users.map((u, i) => (
                            <TableRow key={i} hover>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{u.email}</TableCell>
                              <TableCell align="right">{u.query_count}</TableCell>
                              <TableCell align="right" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                                {u.avg_bytes > 1e9 ? `${(u.avg_bytes / 1e9).toFixed(1)} GB` : u.avg_bytes > 1e6 ? `${(u.avg_bytes / 1e6).toFixed(1)} MB` : `${u.avg_bytes} B`}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* ── DLP PII Scan ── */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: piiOpen ? 2 : 0 }}>
          <PolicyIcon sx={{ color: 'text.secondary' }} />
          <Typography variant="h6" fontWeight={600}>PII Detection</Typography>
          {piiData && (
            <Chip
              label={Object.keys(piiData.findings_by_column).length > 0 ? `${Object.keys(piiData.findings_by_column).length} PII column(s)` : 'No PII found'}
              size="small"
              color={Object.keys(piiData.findings_by_column).length > 0 ? 'error' : 'success'}
              sx={{ height: 18, fontSize: '0.7rem' }}
            />
          )}
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={piiMutationScan.isPending ? <CircularProgress size={13} /> : <PolicyIcon />}
            disabled={piiMutationScan.isPending}
            onClick={() => { piiMutationScan.mutate(); setPiiOpen(true) }}
          >
            {piiMutationScan.isPending ? 'Scanning…' : 'Run DLP Scan'}
          </Button>
          <IconButton size="small" onClick={() => setPiiOpen((o) => !o)} sx={{ ml: 0.5 }}>
            <ExpandMoreIcon sx={{ fontSize: 20, transform: piiOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </IconButton>
        </Box>

        {piiOpen && (
          <>
            {piiMutationScan.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {(piiMutationScan.error as any)?.response?.data?.detail ?? 'DLP scan failed.'}
              </Alert>
            )}
            {!piiData && !piiMutationScan.isPending && (
              <Alert severity="info" icon={<PolicyIcon />}>
                Click <strong>Run DLP Scan</strong> to auto-detect PII in column samples using Cloud DLP. Column flags will be updated automatically.
              </Alert>
            )}
            {piiData && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Scanned {piiData.scanned_rows_limit} rows · {piiData.info_types_checked.length} info types checked · {new Date(piiData.scanned_at).toLocaleString()}
                </Typography>
                {Object.keys(piiData.findings_by_column).length === 0 ? (
                  <Alert severity="success" sx={{ mt: 1 }}>No PII detected in sampled rows.</Alert>
                ) : (
                  <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Column</TableCell>
                          <TableCell>Detected PII types</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {Object.entries(piiData.findings_by_column).map(([col, types]) => (
                          <TableRow key={col} hover>
                            <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{col}</TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                {types.map((t) => (
                                  <Chip key={t} label={t} size="small" color="error" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                                ))}
                              </Box>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            )}
          </>
        )}
      </Box>

      {/* ── Dataplex Quality ── */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: dataplexOpen ? 2 : 0 }}>
          <FactCheckIcon sx={{ color: 'text.secondary' }} />
          <Typography variant="h6" fontWeight={600}>Dataplex Quality</Typography>
          {dataplexData?.data_quality_result && (
            <Chip
              label={`${dataplexData.data_quality_result.score ?? '?'}% · ${dataplexData.data_quality_result.passed ? 'Passed' : 'Failed'}`}
              size="small"
              color={dataplexData.data_quality_result.passed ? 'success' : 'error'}
              sx={{ height: 18, fontSize: '0.7rem' }}
            />
          )}
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            variant="outlined"
            color="success"
            startIcon={dataplexMutation.isPending ? <CircularProgress size={13} /> : <FactCheckIcon />}
            disabled={dataplexMutation.isPending}
            onClick={() => { dataplexMutation.mutate(); setDataplexOpen(true) }}
          >
            {dataplexMutation.isPending ? 'Running…' : 'Run Dataplex Scan'}
          </Button>
          <IconButton size="small" onClick={() => setDataplexOpen((o) => !o)} sx={{ ml: 0.5 }}>
            <ExpandMoreIcon sx={{ fontSize: 20, transform: dataplexOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </IconButton>
        </Box>

        {dataplexOpen && (
          <>
            {dataplexMutation.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {(dataplexMutation.error as any)?.response?.data?.detail ?? 'Dataplex scan failed.'}
              </Alert>
            )}
            {!dataplexData && !dataplexMutation.isPending && (
              <Alert severity="info" icon={<FactCheckIcon />}>
                Click <strong>Run Dataplex Scan</strong> to run a managed quality scan via Google Dataplex DataScans (may take up to 2 min).
              </Alert>
            )}
            {dataplexMutation.isPending && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">Running Dataplex DataScan — polling for results…</Typography>
              </Box>
            )}
            {dataplexData?.data_quality_result && Object.keys(dataplexData.data_quality_result).length > 0 && (
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Card variant="outlined" sx={{ flex: '0 0 200px' }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary">Overall score</Typography>
                    <Typography
                      variant="h4" fontWeight={700}
                      color={dataplexData.data_quality_result.passed ? 'success.main' : 'error.main'}
                    >
                      {dataplexData.data_quality_result.score ?? '?'}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {dataplexData.data_quality_result.row_count?.toLocaleString()} rows checked
                    </Typography>
                  </CardContent>
                </Card>
                {dataplexData.data_quality_result.dimensions.length > 0 && (
                  <Box sx={{ flex: 1, minWidth: 280 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 1 }}>DIMENSIONS</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {dataplexData.data_quality_result.dimensions.map((d) => (
                        <Chip
                          key={d.dimension}
                          label={`${d.dimension}: ${d.score ?? '?'}%`}
                          size="small"
                          color={d.passed ? 'success' : 'error'}
                          variant="outlined"
                          sx={{ fontSize: '0.72rem' }}
                        />
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            )}
          </>
        )}
      </Box>

      {/* ── Schema History (Asset Inventory) ── */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: schemaHistoryOpen ? 2 : 0 }}>
          <HistoryIcon sx={{ color: 'text.secondary' }} />
          <Typography variant="h6" fontWeight={600}>Schema History</Typography>
          {schemaHistoryData && (
            <Chip label={`${schemaHistoryData.changes.length} change(s)`} size="small" sx={{ height: 18, fontSize: '0.7rem' }} />
          )}
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            variant="outlined"
            startIcon={schemaHistoryMutation.isPending ? <CircularProgress size={13} /> : <HistoryIcon />}
            disabled={schemaHistoryMutation.isPending}
            onClick={() => { schemaHistoryMutation.mutate(); setSchemaHistoryOpen(true) }}
          >
            {schemaHistoryMutation.isPending ? 'Loading…' : 'Load History'}
          </Button>
          <IconButton size="small" onClick={() => setSchemaHistoryOpen((o) => !o)} sx={{ ml: 0.5 }}>
            <ExpandMoreIcon sx={{ fontSize: 20, transform: schemaHistoryOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </IconButton>
        </Box>

        {schemaHistoryOpen && (
          <>
            {schemaHistoryMutation.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {(() => { const d = (schemaHistoryMutation.error as any)?.response?.data?.detail; return typeof d === 'string' ? d : 'Failed to load schema history.' })()}
              </Alert>
            )}
            {!schemaHistoryData && !schemaHistoryMutation.isPending && (
              <Alert severity="info" icon={<HistoryIcon />}>
                Click <strong>Load History</strong> to fetch column additions, removals, and type changes via Cloud Asset Inventory (last 35 days).
              </Alert>
            )}
            {schemaHistoryData && schemaHistoryData.changes.length === 0 && (
              <Alert severity="success">No schema changes detected in the last {schemaHistoryData.period_days} days.</Alert>
            )}
            {schemaHistoryData && schemaHistoryData.changes.length > 0 && (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Change</TableCell>
                      <TableCell>Column</TableCell>
                      <TableCell>Details</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {schemaHistoryData.changes.map((c, i) => (
                      <TableRow key={i} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem', color: 'text.secondary' }}>
                          {c.detected_at ? new Date(c.detected_at).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={(c.type ?? '').replace(/_/g, ' ')}
                            size="small"
                            color={c.type === 'COLUMN_ADDED' ? 'success' : c.type === 'COLUMN_REMOVED' ? 'error' : 'warning'}
                            variant="outlined"
                            sx={{ fontSize: '0.65rem', height: 20 }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.column ?? '—'}</TableCell>
                        <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                          {c.old_type && c.new_type ? `${c.old_type} → ${c.new_type}` : c.new_type && !c.old_type ? c.new_type : c.old_mode && c.new_mode ? `${c.old_mode} → ${c.new_mode}` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
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
