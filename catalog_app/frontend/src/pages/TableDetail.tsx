import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
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
import KeyIcon from '@mui/icons-material/Key'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import { tablesApi } from '../api/tables'
import { datasetsApi } from '../api/datasets'
import type { SensitivityLabel } from '../api/types'

function bytes(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`
  return `${n} B`
}

export default function TableDetail() {
  const { datasetId, tableId } = useParams<{ datasetId: string; tableId: string }>()
  const navigate = useNavigate()

  const { data: table, isLoading } = useQuery({
    queryKey: ['table', tableId],
    queryFn: () => tablesApi.get(tableId!),
    enabled: !!tableId,
  })

  const { data: dataset } = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => datasetsApi.get(datasetId!),
    enabled: !!datasetId,
  })

  if (isLoading) {
    return (
      <Box>
        <Skeleton width={400} height={32} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={400} />
      </Box>
    )
  }

  if (!table) return <Alert severity="error">Table not found.</Alert>

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
        {/* Metadata */}
        <Card sx={{ minWidth: 260, flex: '0 0 260px' }}>
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

        {/* Schema */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
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
        </Box>
      </Box>
    </Box>
  )
}
