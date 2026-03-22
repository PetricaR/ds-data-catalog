import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActionArea from '@mui/material/CardActionArea'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Stepper from '@mui/material/Stepper'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Autocomplete from '@mui/material/Autocomplete'
import Divider from '@mui/material/Divider'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Checkbox from '@mui/material/Checkbox'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import InputAdornment from '@mui/material/InputAdornment'
import TableChartIcon from '@mui/icons-material/TableChart'
import AddIcon from '@mui/icons-material/Add'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'

import { datasetsApi } from '../api/datasets'
import { tablesApi } from '../api/tables'
import type { SensitivityLabel, Table as TableType } from '../api/types'

const SENSITIVITY_OPTIONS: SensitivityLabel[] = ['public', 'internal', 'confidential', 'restricted']
const STEPS = ['Select Dataset', 'Select Table', 'Document Schema']

interface ColDraft {
  id: string
  name: string
  data_type: string | null
  description: string
  is_nullable: boolean
  is_primary_key: boolean
  position: number
}

export default function RegisterTable() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()

  const preDatasetId = searchParams.get('datasetId') ?? ''
  const preTableId   = searchParams.get('tableId')   ?? ''

  const [step, setStep] = useState(preDatasetId && preTableId ? 2 : preDatasetId ? 1 : 0)
  const [datasetId, setDatasetId] = useState(preDatasetId)
  const [selectedTable, setSelectedTable] = useState<TableType | null>(null)
  const [cols, setCols] = useState<ColDraft[]>([])
  const [meta, setMeta] = useState({
    display_name: '',
    description: '',
    owner: '',
    sensitivity_label: 'internal' as SensitivityLabel,
    tags: [] as string[],
  })
  const [tagInput, setTagInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  // When both datasetId + tableId are in URL, load table directly and skip to step 2
  const { data: preloadedTable } = useQuery({
    queryKey: ['table', preTableId],
    queryFn: () => tablesApi.get(preTableId),
    enabled: !!preTableId && selectedTable === null,
  })
  useEffect(() => {
    if (preloadedTable && selectedTable === null) pickTable(preloadedTable)
  }, [preloadedTable])

  const { data: datasets } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => datasetsApi.list({ limit: 200 }),
  })

  const { data: tables, isLoading: tablesLoading } = useQuery({
    queryKey: ['dataset', datasetId, 'tables'],
    queryFn: () => datasetsApi.listTables(datasetId),
    enabled: !!datasetId,
  })

  const selectedDataset = datasets?.find((d) => d.id === datasetId)

  // When a table is picked, populate cols from its existing schema
  const pickTable = (t: TableType) => {
    setSelectedTable(t)
    setCols(
      t.columns.map((c) => ({
        id: c.id,
        name: c.name,
        data_type: c.data_type ?? null,
        description: c.description ?? '',
        is_nullable: c.is_nullable,
        is_primary_key: c.is_primary_key,
        position: c.position,
      }))
    )
    setMeta({
      display_name: t.display_name ?? '',
      description: t.description ?? '',
      owner: t.owner ?? '',
      sensitivity_label: (t.sensitivity_label as SensitivityLabel) ?? 'internal',
      tags: t.tags ?? [],
    })
    setStep(2)
  }

  const updateCol = (idx: number, field: keyof ColDraft, value: string | boolean) =>
    setCols((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)))

  const addTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (t && !meta.tags.includes(t)) setMeta((m) => ({ ...m, tags: [...m.tags, t] }))
    setTagInput('')
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTable) throw new Error('No table selected')
      await tablesApi.update(selectedTable.id, {
        display_name: meta.display_name || undefined,
        description: meta.description || undefined,
        owner: meta.owner || undefined,
        sensitivity_label: meta.sensitivity_label,
        tags: meta.tags,
      })
      await tablesApi.patchColumns(
        selectedTable.id,
        cols.map((c) => ({ id: c.id, description: c.description, is_primary_key: c.is_primary_key }))
      )
      return selectedTable
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['dataset', datasetId, 'tables'] })
      qc.invalidateQueries({ queryKey: ['table', t.id] })
      navigate(`/datasets/${datasetId}/tables/${t.id}`)
    },
    onError: (err: any) => setError(err.response?.data?.detail ?? 'Failed to save.'),
  })

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => navigate('/browse')}>Catalog</Link>
        {selectedDataset && (
          <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => navigate(`/datasets/${datasetId}`)}>
            {selectedDataset.display_name || selectedDataset.dataset_id}
          </Link>
        )}
        <Typography color="text.primary">Document Table</Typography>
      </Breadcrumbs>

      <Typography variant="h5" fontWeight={700} gutterBottom>Document a BigQuery Table</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Select a table discovered by BigQuery sync and add descriptions, ownership, and column-level documentation.
        Once documented, a data steward can validate it as a trusted source.
      </Typography>

      <Stepper activeStep={step} sx={{ mb: 4 }}>
        {STEPS.map((label) => (
          <Step key={label}><StepLabel>{label}</StepLabel></Step>
        ))}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* ── Step 0: Pick dataset ─────────────────────────────────────────── */}
      {step === 0 && (
        <Card>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Typography variant="subtitle1" fontWeight={600}>Which dataset contains this table?</Typography>
            <Autocomplete
              options={datasets ?? []}
              getOptionLabel={(d) => `${d.project_id}.${d.dataset_id}${d.display_name ? ` — ${d.display_name}` : ''}`}
              value={selectedDataset ?? null}
              onChange={(_, val) => { if (val) { setDatasetId(val.id); setStep(1) } }}
              renderInput={(params) => <TextField {...params} label="Select Dataset" autoFocus />}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Pick table ───────────────────────────────────────────── */}
      {step === 1 && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Tables in <code style={{ background: '#f1f3f4', padding: '2px 6px', borderRadius: 4 }}>
                {selectedDataset?.dataset_id}
              </code>
            </Typography>
            <Button size="small" onClick={() => { setDatasetId(''); setStep(0) }}>Change Dataset</Button>
          </Box>

          {tablesLoading
            ? [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={72} sx={{ mb: 1.5 }} />)
            : tables?.length === 0
            ? <Alert severity="info">No tables found. Run a BigQuery sync first.</Alert>
            : (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 1.5 }}>
                {tables?.map((t) => (
                  <Card key={t.id} variant="outlined" sx={{ '&:hover': { borderColor: 'primary.main', boxShadow: 2 } }}>
                    <CardActionArea onClick={() => pickTable(t)} sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <TableChartIcon sx={{ color: '#137333', fontSize: 28 }} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" fontWeight={600} noWrap>
                            {t.display_name || t.table_id}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {t.columns.length} columns
                            {t.row_count != null && ` · ${t.row_count.toLocaleString()} rows`}
                          </Typography>
                        </Box>
                        {t.description && <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main', flexShrink: 0 }} />}
                      </Box>
                    </CardActionArea>
                  </Card>
                ))}
              </Box>
            )
          }
        </Box>
      )}

      {/* ── Step 2: Annotate schema ──────────────────────────────────────── */}
      {step === 2 && selectedTable && (
        <Box>
          {/* Column schema */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Schema — {cols.length} columns
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Columns are auto-loaded from BigQuery. Add descriptions and mark primary keys.
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 600, bgcolor: '#f8f9fa' } }}>
                    <TableCell>#</TableCell>
                    <TableCell>Column Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell sx={{ minWidth: 300 }}>Description</TableCell>
                    <TableCell align="center">Nullable</TableCell>
                    <TableCell align="center">PK</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cols.map((col, i) => (
                    <TableRow key={col.id} hover>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">{col.position + 1}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500} sx={{ fontFamily: 'monospace' }}>
                          {col.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={col.data_type ?? '—'} size="small"
                          sx={{ fontSize: '0.65rem', height: 20, fontFamily: 'monospace', bgcolor: '#e8f0fe', color: '#1967d2' }} />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          variant="outlined"
                          fullWidth
                          value={col.description}
                          onChange={(e) => updateCol(i, 'description', e.target.value)}
                          placeholder="What does this column represent?"
                          sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.8rem' } }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Checkbox
                          checked={col.is_nullable}
                          size="small"
                          disabled
                          sx={{ color: col.is_nullable ? 'text.disabled' : 'error.main' }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Checkbox
                          checked={col.is_primary_key}
                          size="small"
                          onChange={(e) => updateCol(i, 'is_primary_key', e.target.checked)}
                          color="primary"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Table-level metadata */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>Table Metadata</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Display Name"
                    value={meta.display_name}
                    onChange={(e) => setMeta((m) => ({ ...m, display_name: e.target.value }))}
                    fullWidth
                  />
                  <TextField
                    select label="Sensitivity"
                    value={meta.sensitivity_label}
                    onChange={(e) => setMeta((m) => ({ ...m, sensitivity_label: e.target.value as SensitivityLabel }))}
                    sx={{ minWidth: 180 }}
                  >
                    {SENSITIVITY_OPTIONS.map((o) => (
                      <MenuItem key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</MenuItem>
                    ))}
                  </TextField>
                </Box>
                <TextField
                  label="Description"
                  multiline rows={2}
                  value={meta.description}
                  onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))}
                  placeholder="What data does this table contain? Who uses it?"
                />
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Owner"
                    value={meta.owner}
                    onChange={(e) => setMeta((m) => ({ ...m, owner: e.target.value }))}
                    fullWidth
                    placeholder="owner@company.com"
                  />
                  <TextField
                    label="Add Tag"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                    placeholder="Press Enter to add"
                    fullWidth
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Button size="small" onClick={addTag} startIcon={<AddIcon />}>Add</Button>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Box>
                {meta.tags.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {meta.tags.map((t) => (
                      <Chip key={t} label={t} size="small"
                        onDelete={() => setMeta((m) => ({ ...m, tags: m.tags.filter((x) => x !== t) }))} />
                    ))}
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>

          <Divider sx={{ my: 3 }} />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              size="large"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save & View Table'}
            </Button>
            <Button variant="outlined" onClick={() => setStep(1)}>Back</Button>
            <Button variant="text" onClick={() => navigate(-1)}>Cancel</Button>
          </Box>
        </Box>
      )}

    </Box>
  )
}
