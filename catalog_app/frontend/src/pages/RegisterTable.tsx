import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Autocomplete from '@mui/material/Autocomplete'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import { tablesApi } from '../api/tables'
import { datasetsApi } from '../api/datasets'
import type { TableCreate, SensitivityLabel } from '../api/types'

const SENSITIVITY_OPTIONS: SensitivityLabel[] = ['public', 'internal', 'confidential', 'restricted']
const BQ_TYPES = ['STRING', 'INTEGER', 'FLOAT', 'BOOLEAN', 'TIMESTAMP', 'DATE', 'DATETIME', 'BYTES', 'NUMERIC', 'RECORD', 'JSON']

interface ColumnDraft {
  name: string
  data_type: string
  description: string
  is_nullable: boolean
  is_primary_key: boolean
  position: number
}

export default function RegisterTable() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [datasetId, setDatasetId] = useState('')
  const [form, setForm] = useState({
    table_id: '',
    display_name: '',
    description: '',
    owner: '',
    sensitivity_label: 'internal' as SensitivityLabel,
    tags: [] as string[],
  })
  const [tagInput, setTagInput] = useState('')
  const [columns, setColumns] = useState<ColumnDraft[]>([])
  const [error, setError] = useState<string | null>(null)

  const { data: datasets } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => datasetsApi.list({ limit: 200 }),
  })

  const mutation = useMutation({
    mutationFn: tablesApi.create,
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['datasets'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      navigate(`/datasets/${t.dataset_id}/tables/${t.id}`)
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail ?? 'Failed to register table.')
    },
  })

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const addTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (t && !form.tags.includes(t)) setForm((f) => ({ ...f, tags: [...f.tags, t] }))
    setTagInput('')
  }

  const addColumn = () => {
    setColumns((cols) => [
      ...cols,
      { name: '', data_type: 'STRING', description: '', is_nullable: true, is_primary_key: false, position: cols.length },
    ])
  }

  const updateColumn = (i: number, field: keyof ColumnDraft, value: string | boolean | number) => {
    setColumns((cols) => cols.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)))
  }

  const removeColumn = (i: number) => {
    setColumns((cols) => cols.filter((_, idx) => idx !== i).map((c, idx) => ({ ...c, position: idx })))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!datasetId) { setError('Please select a dataset.'); return }
    const payload: TableCreate = {
      ...form,
      dataset_id: datasetId,
      display_name: form.display_name || undefined,
      description: form.description || undefined,
      owner: form.owner || undefined,
      columns: columns.filter((c) => c.name.trim()),
    }
    mutation.mutate(payload)
  }

  const selectedDataset = datasets?.find((d) => d.id === datasetId)

  return (
    <Box sx={{ maxWidth: 860, mx: 'auto' }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => navigate('/browse')}>Catalog</Link>
        <Typography color="text.primary">Register Table</Typography>
      </Breadcrumbs>

      <Typography variant="h5" fontWeight={700} gutterBottom>Register a BigQuery Table</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Add a table to the catalog with its schema and metadata.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Card>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Dataset selection */}
            <Typography variant="subtitle2" fontWeight={600} color="text.secondary">Parent Dataset *</Typography>
            <Autocomplete
              options={datasets ?? []}
              getOptionLabel={(d) => `${d.project_id}.${d.dataset_id}${d.display_name ? ` — ${d.display_name}` : ''}`}
              value={selectedDataset ?? null}
              onChange={(_, val) => setDatasetId(val?.id ?? '')}
              renderInput={(params) => <TextField {...params} label="Select Dataset" required />}
            />

            {/* Table identity */}
            <Typography variant="subtitle2" fontWeight={600} color="text.secondary" sx={{ mt: 1 }}>Table Reference *</Typography>
            <TextField
              label="Table ID"
              required
              value={form.table_id}
              onChange={set('table_id')}
              placeholder="user_events"
              helperText={datasetId && form.table_id ? `${selectedDataset?.project_id}.${selectedDataset?.dataset_id}.${form.table_id}` : ''}
            />
            <TextField label="Display Name" value={form.display_name} onChange={set('display_name')} placeholder="User Events" />
            <TextField label="Description" multiline rows={3} value={form.description} onChange={set('description')} placeholder="What data does this table contain?" />

            {/* Ownership & classification */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="Owner" value={form.owner} onChange={set('owner')} fullWidth placeholder="owner@company.com" />
              <TextField select label="Sensitivity" value={form.sensitivity_label} onChange={set('sensitivity_label')} sx={{ minWidth: 180 }}>
                {SENSITIVITY_OPTIONS.map((o) => <MenuItem key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</MenuItem>)}
              </TextField>
            </Box>

            {/* Tags */}
            <Box>
              <TextField
                label="Add Tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder="Type tag and press Enter"
                size="small"
                InputProps={{
                  endAdornment: <InputAdornment position="end"><Button size="small" onClick={addTag} startIcon={<AddIcon />}>Add</Button></InputAdornment>,
                }}
              />
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                {form.tags.map((t) => <Chip key={t} label={t} size="small" onDelete={() => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))} />)}
              </Box>
            </Box>

            {/* Schema */}
            <Divider />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle1" fontWeight={600}>Schema Columns</Typography>
              <Button startIcon={<AddIcon />} size="small" onClick={addColumn} variant="outlined">Add Column</Button>
            </Box>

            {columns.length > 0 && (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Nullable</TableCell>
                    <TableCell>PK</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {columns.map((col, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ minWidth: 140 }}>
                        <TextField
                          size="small"
                          value={col.name}
                          onChange={(e) => updateColumn(i, 'name', e.target.value)}
                          placeholder="column_name"
                          variant="standard"
                        />
                      </TableCell>
                      <TableCell sx={{ minWidth: 120 }}>
                        <TextField
                          select size="small" variant="standard"
                          value={col.data_type}
                          onChange={(e) => updateColumn(i, 'data_type', e.target.value)}
                        >
                          {BQ_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small" variant="standard" fullWidth
                          value={col.description}
                          onChange={(e) => updateColumn(i, 'description', e.target.value)}
                          placeholder="Column description"
                        />
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={col.is_nullable}
                          size="small"
                          onChange={(e) => updateColumn(i, 'is_nullable', e.target.checked)}
                        />
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={col.is_primary_key}
                          size="small"
                          onChange={(e) => updateColumn(i, 'is_primary_key', e.target.checked)}
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => removeColumn(i)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <Box sx={{ display: 'flex', gap: 2, pt: 1 }}>
              <Button type="submit" variant="contained" disabled={mutation.isPending || !form.table_id || !datasetId}>
                {mutation.isPending ? 'Registering…' : 'Register Table'}
              </Button>
              <Button variant="outlined" onClick={() => navigate(-1)}>Cancel</Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
