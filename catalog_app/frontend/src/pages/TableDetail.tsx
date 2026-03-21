import { useState, useEffect } from 'react'
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
import KeyIcon from '@mui/icons-material/Key'
import VerifiedIcon from '@mui/icons-material/Verified'
import PreviewIcon from '@mui/icons-material/Preview'
import CodeIcon from '@mui/icons-material/Code'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import SaveIcon from '@mui/icons-material/Save'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import { tablesApi } from '../api/tables'
import { datasetsApi } from '../api/datasets'
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

  const [previewOpen, setPreviewOpen] = useState(false)
  const [queries, setQueries] = useState<ExampleQuery[] | null>(null)
  const [queriesDirty, setQueriesDirty] = useState(false)

  const validateMutation = useMutation({
    mutationFn: () => tablesApi.validate(tableId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['table', tableId] }),
  })

  const saveQueriesMutation = useMutation({
    mutationFn: (qs: ExampleQuery[]) => tablesApi.patchQueries(tableId!, qs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['table', tableId] })
      setQueriesDirty(false)
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
    }
  }, [table])

  const { data: preview, isLoading: previewLoading, error: previewError } = useQuery({
    queryKey: ['table', tableId, 'preview'],
    queryFn: () => tablesApi.preview(tableId!),
    enabled: previewOpen,
    retry: false,
  })

  const { data: dataset } = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => datasetsApi.get(datasetId!),
    enabled: !!datasetId,
  })

  const updateQuery = (i: number, field: keyof ExampleQuery, value: string) => {
    setQueries((prev) => prev!.map((q, idx) => idx === i ? { ...q, [field]: value } : q))
    setQueriesDirty(true)
  }

  const addQuery = () => {
    setQueries((prev) => [...(prev ?? []), { title: '', sql: '' }])
    setQueriesDirty(true)
  }

  const removeQuery = (i: number) => {
    setQueries((prev) => prev!.filter((_, idx) => idx !== i))
    setQueriesDirty(true)
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
            {table.dataset_project_id}.{table.dataset_id.toString()}.{table.table_id}
          </Typography>
        </Box>
        <SensitivityChip label={table.sensitivity_label as SensitivityLabel} size="medium" />
        <Tooltip title={table.is_validated ? 'Revoke validation' : 'Mark as trusted / validated source'}>
          <Button
            variant={table.is_validated ? 'contained' : 'outlined'}
            size="small"
            startIcon={<VerifiedIcon />}
            onClick={() => validateMutation.mutate()}
            disabled={validateMutation.isPending}
            color={table.is_validated ? 'success' : 'inherit'}
          >
            {table.is_validated ? 'Validated' : 'Validate'}
          </Button>
        </Tooltip>
      </Box>

      {/* Stats chips */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        {table.row_count != null && (
          <Chip label={`${table.row_count.toLocaleString()} rows`} size="small" variant="outlined" />
        )}
        {table.size_bytes != null && (
          <Chip label={bytes(table.size_bytes)} size="small" variant="outlined" />
        )}
        <Chip label={`${table.columns.length} columns`} size="small" variant="outlined" />
        {table.tags.map((t) => <TagChip key={t} tag={t} />)}
      </Box>

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {/* Schema */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
            Schema ({table.columns.length} columns)
          </Typography>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Column</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Nullable</TableCell>
                  <TableCell>Description</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {table.columns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
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
                        <Typography variant="body2" color="text.secondary">
                          {col.description || '—'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ mt: 1.5 }}>
            <Button
              size="small"
              variant={previewOpen ? 'contained' : 'outlined'}
              startIcon={previewLoading ? <CircularProgress size={14} /> : <PreviewIcon />}
              onClick={() => setPreviewOpen((o) => !o)}
              color={previewOpen ? 'primary' : 'inherit'}
            >
              {previewOpen ? 'Hide Preview' : 'Preview Data'}
            </Button>
          </Box>

          {/* Data Preview */}
          {previewOpen && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                Data Preview (first 20 rows)
              </Typography>
              {previewLoading && <Skeleton variant="rounded" height={200} />}
              {previewError && (
                <Alert severity="error">
                  {(previewError as any)?.response?.data?.detail ?? 'Failed to load preview.'}
                </Alert>
              )}
              {preview && (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360, overflow: 'auto' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        {preview.columns.map((col) => (
                          <TableCell key={col} sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.75rem', bgcolor: '#f8f9fa' }}>
                            {col}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.rows.map((row, i) => (
                        <TableRow key={i} hover>
                          {preview.columns.map((col) => (
                            <TableCell key={col} sx={{ fontSize: '0.75rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {row[col] ?? <em style={{ color: '#aaa' }}>null</em>}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}
        </Box>

        {/* Metadata */}
        <Card sx={{ minWidth: 260, flex: '0 0 260px', mt: '40px' }}>
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

      {/* Example Queries */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <CodeIcon sx={{ color: 'text.secondary' }} />
          <Typography variant="h6" fontWeight={600}>Example Queries</Typography>
          <Box sx={{ flex: 1 }} />
          {queriesDirty && (
            <Button
              size="small"
              variant="contained"
              startIcon={saveQueriesMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
              onClick={() => saveQueriesMutation.mutate(displayQueries)}
              disabled={saveQueriesMutation.isPending}
            >
              Save
            </Button>
          )}
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addQuery}>
            Add Query
          </Button>
        </Box>

        {displayQueries.length === 0 ? (
          <Alert severity="info" icon={<CodeIcon />}>
            No example queries yet. Click <strong>Add Query</strong> to add a useful SQL snippet for this table.
          </Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {displayQueries.map((q, i) => (
              <Card key={i} variant="outlined">
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <TextField
                      size="small"
                      label="Title"
                      value={q.title}
                      onChange={(e) => updateQuery(i, 'title', e.target.value)}
                      sx={{ flex: '0 0 260px' }}
                      placeholder="e.g. Get last 7 days"
                    />
                    <Box sx={{ flex: 1 }} />
                    <IconButton size="small" color="error" onClick={() => removeQuery(i)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    maxRows={8}
                    value={q.sql}
                    onChange={(e) => updateQuery(i, 'sql', e.target.value)}
                    placeholder="SELECT * FROM ..."
                    InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.8rem' } }}
                  />
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}
