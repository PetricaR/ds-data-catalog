import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Collapse from '@mui/material/Collapse'
import StorageIcon from '@mui/icons-material/Storage'
import TableChartIcon from '@mui/icons-material/TableChart'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import VerifiedIcon from '@mui/icons-material/Verified'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import SearchBar from '../components/SearchBar'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import { searchApi } from '../api/search'
import { datasetsApi } from '../api/datasets'
import { schemaChangesApi } from '../api/schemaChanges'
import type { SensitivityLabel } from '../api/types'

function StatCard({ icon, value, label, color }: { icon: React.ReactNode; value: number | string; label: string; color: string }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2.5 }}>
        <Box sx={{ p: 1.5, borderRadius: 2, backgroundColor: `${color}18`, color }}>{icon}</Box>
        <Box>
          <Typography variant="h4" fontWeight={700}>{value}</Typography>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
        </Box>
      </CardContent>
    </Card>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: searchApi.stats,
  })
  const { data: recentDatasets, isLoading: datasetsLoading } = useQuery({
    queryKey: ['datasets', 'recent'],
    queryFn: () => datasetsApi.list({ limit: 6 }),
  })
  const { data: schemaChanges = [] } = useQuery({
    queryKey: ['schema-changes'],
    queryFn: () => schemaChangesApi.list({ acknowledged: false }),
    refetchInterval: 60_000,
  })

  const ackMutation = useMutation({
    mutationFn: (id: string) => schemaChangesApi.acknowledge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schema-changes'] }),
  })
  const ackAllMutation = useMutation({
    mutationFn: () => schemaChangesApi.acknowledgeAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schema-changes'] }),
  })

  return (
    <Box>
      {/* Hero */}
      <Box
        sx={{
          textAlign: 'center',
          py: { xs: 4, sm: 6 },
          px: 2,
          background: 'linear-gradient(135deg, #e8f0fe 0%, #f8f9fa 100%)',
          borderRadius: 3,
          mb: 4,
        }}
      >
        <Typography variant="h3" fontWeight={700} gutterBottom sx={{ color: '#202124' }}>
          DS Data Catalog
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 4, fontWeight: 400 }}>
          Discover, understand, and trust your BigQuery data assets
        </Typography>
        <Box sx={{ maxWidth: 640, mx: 'auto' }}>
          <SearchBar size="large" />
        </Box>
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
          {['analytics', 'events', 'users', 'revenue'].map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              variant="outlined"
              onClick={() => navigate(`/search?q=${tag}`)}
              sx={{ cursor: 'pointer', borderColor: '#1a73e8', color: '#1a73e8' }}
            />
          ))}
        </Box>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {statsLoading ? (
          [0, 1, 2, 3].map((i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Skeleton variant="rounded" height={96} />
            </Grid>
          ))
        ) : stats ? (
          <>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard icon={<StorageIcon />} value={stats.total_datasets} label="Datasets" color="#1a73e8" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard icon={<TableChartIcon />} value={stats.total_tables} label="Tables" color="#137333" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard icon={<ViewColumnIcon />} value={stats.total_columns} label="Columns" color="#e37400" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                icon={<VerifiedIcon />}
                value={`${stats.documentation_coverage}%`}
                label="Documented"
                color="#9334e6"
              />
            </Grid>
          </>
        ) : null}
      </Grid>

      {/* Schema change alerts */}
      <Collapse in={schemaChanges.length > 0}>
        <Box
          sx={{
            mb: 4, border: '1px solid', borderColor: '#f9a825',
            borderRadius: 2, overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: 1.5,
              px: 2.5, py: 1.5, bgcolor: '#fffde7',
              borderBottom: '1px solid #f9a825',
            }}
          >
            <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1, color: '#e65100' }}>
              Schema Changes Detected
              <Chip
                label={schemaChanges.length}
                size="small"
                sx={{ ml: 1, height: 18, fontSize: '0.65rem', bgcolor: '#e65100', color: 'white' }}
              />
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Detected on last sync — review and acknowledge
            </Typography>
            <Button
              size="small"
              startIcon={<DoneAllIcon sx={{ fontSize: '14px !important' }} />}
              onClick={() => ackAllMutation.mutate()}
              disabled={ackAllMutation.isPending}
              sx={{ fontSize: '0.72rem', textTransform: 'none', color: '#e65100' }}
            >
              Acknowledge all
            </Button>
          </Box>

          {/* Change rows */}
          {schemaChanges.slice(0, 10).map((c) => (
            <Box
              key={c.id}
              sx={{
                display: 'flex', alignItems: 'center', gap: 2,
                px: 2.5, py: 1,
                borderBottom: '1px solid', borderColor: 'divider',
                '&:last-child': { borderBottom: 'none' },
                '&:hover': { bgcolor: '#fafafa' },
              }}
            >
              {c.change_type === 'column_added'
                ? <AddCircleOutlineIcon sx={{ fontSize: 16, color: '#2e7d32', flexShrink: 0 }} />
                : <RemoveCircleOutlineIcon sx={{ fontSize: 16, color: '#c62828', flexShrink: 0 }} />
              }
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography
                    variant="body2"
                    fontWeight={500}
                    sx={{ fontFamily: 'monospace', cursor: 'pointer', '&:hover': { color: '#1a73e8' } }}
                    onClick={() => navigate(`/datasets/${c.dataset_uuid}/tables/${c.table_id}`)}
                  >
                    {c.project_id}.{c.dataset_id_str}.{c.table_table_id}
                  </Typography>
                  <Chip
                    label={c.change_type === 'column_added' ? 'added' : 'removed'}
                    size="small"
                    sx={{
                      height: 16, fontSize: '0.6rem',
                      bgcolor: c.change_type === 'column_added' ? '#e8f5e9' : '#ffebee',
                      color: c.change_type === 'column_added' ? '#2e7d32' : '#c62828',
                    }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Column <strong style={{ fontFamily: 'monospace' }}>{c.column_name}</strong>
                  {' · '}
                  {new Date(c.detected_at).toLocaleString()}
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={() => ackMutation.mutate(c.id)}
                disabled={ackMutation.isPending}
                sx={{ color: 'text.disabled', '&:hover': { color: 'success.main' } }}
              >
                <CheckCircleOutlineIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
          ))}

          {schemaChanges.length > 10 && (
            <Box sx={{ px: 2.5, py: 1, bgcolor: '#fffde7' }}>
              <Typography variant="caption" color="text.secondary">
                + {schemaChanges.length - 10} more changes — acknowledge all to clear
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>

      {/* Recently added datasets */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" fontWeight={600}>Recently Added</Typography>
        <Chip
          label="View all"
          icon={<ArrowForwardIcon />}
          onClick={() => navigate('/browse')}
          size="small"
          sx={{ cursor: 'pointer', color: '#1a73e8', borderColor: '#1a73e8' }}
          variant="outlined"
        />
      </Box>

      <Grid container spacing={2}>
        {datasetsLoading
          ? [0, 1, 2, 3, 4, 5].map((i) => (
              <Grid item xs={12} sm={6} lg={4} key={i}>
                <Skeleton variant="rounded" height={140} />
              </Grid>
            ))
          : recentDatasets?.map((ds) => (
              <Grid item xs={12} sm={6} lg={4} key={ds.id}>
                <Card
                  sx={{ cursor: 'pointer', height: '100%' }}
                  onClick={() => navigate(`/datasets/${ds.id}`)}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                      <Typography variant="subtitle1" fontWeight={600} noWrap sx={{ flex: 1, mr: 1 }}>
                        {ds.display_name || ds.dataset_id}
                      </Typography>
                      <SensitivityChip label={ds.sensitivity_label as SensitivityLabel} />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      {ds.project_id}.{ds.dataset_id}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                    >
                      {ds.description || 'No description'}
                    </Typography>
                    <Divider sx={{ mb: 1 }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {ds.tags.slice(0, 2).map((t) => <TagChip key={t} tag={t} />)}
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {ds.table_count} table{ds.table_count !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
      </Grid>
    </Box>
  )
}
