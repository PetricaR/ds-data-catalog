import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import TableChartIcon from '@mui/icons-material/TableChart'
import EditNoteIcon from '@mui/icons-material/EditNote'
import PlaceIcon from '@mui/icons-material/Place'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import PersonIcon from '@mui/icons-material/Person'
import VerifiedIcon from '@mui/icons-material/Verified'
import UpdateIcon from '@mui/icons-material/Update'
import SearchIcon from '@mui/icons-material/Search'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import { datasetsApi } from '../api/datasets'
import type { SensitivityLabel } from '../api/types'

export default function DatasetDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
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
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight={700}>
              {dataset.display_name || dataset.dataset_id}
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.disabled', mt: 0.25 }}>
              {dataset.project_id}.{dataset.dataset_id}
            </Typography>
          </Box>
          <SensitivityChip label={dataset.sensitivity_label as SensitivityLabel} size="medium" />
        </Box>

        {dataset.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {dataset.description}
          </Typography>
        )}

        {/* Inline metadata row */}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          {dataset.bq_location && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PlaceIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
              <Typography variant="caption" color="text.secondary">{dataset.bq_location}</Typography>
            </Box>
          )}
          {dataset.owner && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PersonIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
              <Typography variant="caption" color="text.secondary">Owner: {dataset.owner}</Typography>
            </Box>
          )}
          {dataset.data_steward && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PersonIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
              <Typography variant="caption" color="text.secondary">Steward: {dataset.data_steward}</Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CalendarTodayIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
            <Typography variant="caption" color="text.secondary">
              Registered {new Date(dataset.created_at).toLocaleDateString()}
            </Typography>
          </Box>
          {dataset.bq_created_at && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CalendarTodayIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
              <Typography variant="caption" color="text.secondary">
                Created {new Date(dataset.bq_created_at).toLocaleDateString()}
              </Typography>
            </Box>
          )}
          {dataset.tags.map((t) => <TagChip key={t} tag={t} />)}
        </Box>
      </Box>

      {/* Tables header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h6" fontWeight={600}>
          Tables ({tables?.length ?? 0})
        </Typography>
        <TextField
          size="small"
          placeholder={`Search in ${dataset.dataset_id}…`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && searchQuery.trim()) {
              navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}&dataset_id=${encodeURIComponent(dataset.dataset_id)}`)
            }
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 240, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.85rem' } }}
        />
      </Box>

      {tablesLoading ? (
        [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={80} sx={{ mb: 1 }} />)
      ) : tables?.length === 0 ? (
        <Alert severity="info">No tables registered yet.</Alert>
      ) : (
        tables?.map((t) => (
          <Card
            key={t.id}
            sx={{ mb: 1.5, cursor: 'pointer', '&:hover': { boxShadow: 2 } }}
            onClick={() => navigate(`/datasets/${id}/tables/${t.id}`)}
          >
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              {/* Row 1: icon + name + validated + sensitivity + doc button */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <TableChartIcon sx={{ fontSize: 18, color: t.is_validated ? '#2e7d32' : '#137333', flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {t.display_name || t.table_id}
                    </Typography>
                    {t.display_name && (
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.disabled' }}>
                        {t.table_id}
                      </Typography>
                    )}
                    {t.is_validated && (
                      <Tooltip title={`Validated${t.validated_by ? ` by ${t.validated_by}` : ''}${t.validated_at ? ` · ${new Date(t.validated_at).toLocaleDateString()}` : ''}`}>
                        <Chip
                          icon={<VerifiedIcon sx={{ fontSize: '11px !important' }} />}
                          label={t.validated_columns.length > 0 ? `${t.validated_columns.length} cols validated` : 'Validated'}
                          size="small"
                          color="success"
                          variant="outlined"
                          sx={{ fontSize: '0.6rem', height: 18 }}
                        />
                      </Tooltip>
                    )}
                  </Box>
                </Box>
                <SensitivityChip label={t.sensitivity_label as SensitivityLabel} />
                <Tooltip title={t.description ? 'View & edit table' : 'Open table to add docs'}>
                  <Button
                    size="small"
                    variant={t.description ? 'text' : 'outlined'}
                    startIcon={<EditNoteIcon sx={{ fontSize: '14px !important' }} />}
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/datasets/${id}/tables/${t.id}`)
                    }}
                    sx={{ fontSize: '0.7rem', py: 0.3, minWidth: 0, flexShrink: 0, color: t.description ? 'text.secondary' : 'primary.main' }}
                  >
                    {t.description ? 'Edit docs' : 'Document'}
                  </Button>
                </Tooltip>
              </Box>

              {/* Row 2: description */}
              <Typography variant="body2" color="text.secondary" sx={{ ml: 3.5, mb: 1 }} noWrap>
                {t.description || <em style={{ color: '#aaa' }}>No description — open table to add</em>}
              </Typography>

              {/* Row 3: stats chips + owner + updated */}
              <Box sx={{ display: 'flex', gap: 1, ml: 3.5, alignItems: 'center', flexWrap: 'wrap' }}>
                {t.columns.length > 0 && (
                  <Chip label={`${t.columns.length} cols`} size="small" sx={{ fontSize: '0.62rem', height: 20 }} />
                )}
                {t.row_count != null && (
                  <Chip label={`${t.row_count.toLocaleString()} rows`} size="small" sx={{ fontSize: '0.62rem', height: 20 }} />
                )}
                {t.size_bytes != null && (
                  <Chip
                    label={t.size_bytes >= 1e9 ? `${(t.size_bytes / 1e9).toFixed(1)} GB`
                      : t.size_bytes >= 1e6 ? `${(t.size_bytes / 1e6).toFixed(1)} MB`
                      : t.size_bytes >= 1e3 ? `${(t.size_bytes / 1e3).toFixed(1)} KB`
                      : `${t.size_bytes} B`}
                    size="small"
                    sx={{ fontSize: '0.62rem', height: 20 }}
                  />
                )}
                {t.tags.slice(0, 3).map((tag) => <TagChip key={tag} tag={tag} />)}
                {t.quality_score != null && (
                  <Tooltip title="Data quality score (0–100): description, column docs, validation, tags, example queries">
                    <Chip
                      label={`Q: ${t.quality_score}%`}
                      size="small"
                      sx={{
                        fontSize: '0.62rem', height: 20,
                        bgcolor: t.quality_score >= 80 ? '#e6f4ea' : t.quality_score >= 50 ? '#fff8e1' : '#fce8e6',
                        color: t.quality_score >= 80 ? '#137333' : t.quality_score >= 50 ? '#e37400' : '#c62828',
                        fontWeight: 600,
                      }}
                    />
                  </Tooltip>
                )}
                <Box sx={{ flex: 1 }} />
                {t.owner && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                    <PersonIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
                    <Typography variant="caption" color="text.disabled">{t.owner}</Typography>
                  </Box>
                )}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                  <UpdateIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
                  <Typography variant="caption" color="text.disabled">
                    {new Date(t.updated_at).toLocaleDateString()}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))
      )}
    </Box>
  )
}
