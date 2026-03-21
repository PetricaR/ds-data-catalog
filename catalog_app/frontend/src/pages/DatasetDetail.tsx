import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import TableChartIcon from '@mui/icons-material/TableChart'
import AddIcon from '@mui/icons-material/Add'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import { datasetsApi } from '../api/datasets'
import type { SensitivityLabel } from '../api/types'

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>{label}</Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  )
}

export default function DatasetDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: dataset, isLoading: dsLoading } = useQuery({
    queryKey: ['dataset', id],
    queryFn: () => datasetsApi.get(id!),
    enabled: !!id,
  })

  const { data: tables, isLoading: tablesLoading } = useQuery({
    queryKey: ['dataset', id, 'tables'],
    queryFn: () => datasetsApi.listTables(id!),
    enabled: !!id,
  })

  if (dsLoading) {
    return (
      <Box>
        <Skeleton width={300} height={32} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={200} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={300} />
      </Box>
    )
  }

  if (!dataset) return <Alert severity="error">Dataset not found.</Alert>

  return (
    <Box>
      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => navigate('/browse')}>
          Catalog
        </Link>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => navigate('/browse')}>
          {dataset.project_id}
        </Link>
        <Typography color="text.primary">{dataset.display_name || dataset.dataset_id}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            {dataset.display_name || dataset.dataset_id}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {dataset.project_id}.{dataset.dataset_id}
          </Typography>
        </Box>
        <SensitivityChip label={dataset.sensitivity_label as SensitivityLabel} size="medium" />
      </Box>

      <Grid container spacing={3}>
        {/* Left — metadata */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>About</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {dataset.description || 'No description provided.'}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <InfoRow label="Owner" value={dataset.owner} />
              <InfoRow label="Data Steward" value={dataset.data_steward} />
              <InfoRow label="Location" value={dataset.bq_location} />
              <InfoRow
                label="Created"
                value={dataset.bq_created_at ? new Date(dataset.bq_created_at).toLocaleDateString() : undefined}
              />
              <InfoRow
                label="Registered"
                value={new Date(dataset.created_at).toLocaleDateString()}
              />
              {dataset.tags.length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Tags</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {dataset.tags.map((t) => <TagChip key={t} tag={t} />)}
                  </Box>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Right — tables */}
        <Grid item xs={12} md={8}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" fontWeight={600}>
              Tables ({tables?.length ?? 0})
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => navigate(`/register/table?datasetId=${id}`)}
            >
              Register Table
            </Button>
          </Box>

          {tablesLoading ? (
            [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={80} sx={{ mb: 1 }} />)
          ) : tables?.length === 0 ? (
            <Alert severity="info">No tables registered yet.</Alert>
          ) : (
            tables?.map((t) => (
              <Card
                key={t.id}
                sx={{ mb: 1.5, cursor: 'pointer' }}
                onClick={() => navigate(`/datasets/${id}/tables/${t.id}`)}
              >
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <TableChartIcon sx={{ fontSize: 18, color: '#137333' }} />
                    <Typography variant="subtitle2" fontWeight={600}>
                      {t.display_name || t.table_id}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <SensitivityChip label={t.sensitivity_label as SensitivityLabel} />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ ml: 3.5 }} noWrap>
                    {t.description || 'No description'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mt: 1, ml: 3.5, alignItems: 'center' }}>
                    {t.columns.length > 0 && (
                      <Chip label={`${t.columns.length} cols`} size="small" sx={{ fontSize: '0.65rem', height: 20 }} />
                    )}
                    {t.row_count != null && (
                      <Chip label={`${t.row_count.toLocaleString()} rows`} size="small" sx={{ fontSize: '0.65rem', height: 20 }} />
                    )}
                    {t.tags.slice(0, 2).map((tag) => <TagChip key={tag} tag={tag} />)}
                  </Box>
                </CardContent>
              </Card>
            ))
          )}
        </Grid>
      </Grid>
    </Box>
  )
}
