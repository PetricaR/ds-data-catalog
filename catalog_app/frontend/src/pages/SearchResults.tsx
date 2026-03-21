import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Alert from '@mui/material/Alert'
import StorageIcon from '@mui/icons-material/Storage'
import TableChartIcon from '@mui/icons-material/TableChart'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import { searchApi } from '../api/search'
import type { SensitivityLabel } from '../api/types'

export default function SearchResults() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q') ?? ''
  const entityType = (params.get('type') as 'dataset' | 'table' | null) ?? undefined
  const datasetId = params.get('dataset_id') ?? undefined

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', q, entityType, datasetId],
    queryFn: () => searchApi.search({ q, entity_type: entityType, dataset_id: datasetId }),
    enabled: !!q,
  })

  const setType = (_: React.MouseEvent, val: string | null) => {
    const next = new URLSearchParams(params)
    if (val) next.set('type', val)
    else next.delete('type')
    setParams(next)
  }

  const handleResultClick = (r: { entity_type: string; id: string; dataset_id: string }) => {
    if (r.entity_type === 'dataset') {
      navigate(`/datasets/${r.id}`)
    } else {
      navigate(`/datasets/${r.dataset_id}/tables/${r.id}`)
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        {!isLoading && data && (
          <Typography variant="body2" color="text.secondary">
            {data.total} result{data.total !== 1 ? 's' : ''} for <strong>"{q}"</strong>
          </Typography>
        )}
        {datasetId && (
          <Chip
            label={`Scoped to dataset: ${datasetId}`}
            size="small"
            onDelete={() => {
              const next = new URLSearchParams(params)
              next.delete('dataset_id')
              setParams(next)
            }}
            sx={{ bgcolor: '#e8f0fe', color: '#1a73e8', fontWeight: 500 }}
          />
        )}
        <ToggleButtonGroup value={entityType ?? ''} exclusive onChange={setType} size="small">
          <ToggleButton value="">All</ToggleButton>
          <ToggleButton value="dataset">Datasets</ToggleButton>
          <ToggleButton value="table">Tables</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>Search failed. Please try again.</Alert>}

      {!q && (
        <Alert severity="info">Enter a search term to find datasets and tables.</Alert>
      )}

      <Grid container spacing={2}>
        {isLoading
          ? [0, 1, 2, 3].map((i) => (
              <Grid item xs={12} key={i}>
                <Skeleton variant="rounded" height={100} />
              </Grid>
            ))
          : data?.results.map((result) => (
              <Grid item xs={12} key={result.id}>
                <Card sx={{ cursor: 'pointer' }} onClick={() => handleResultClick(result)}>
                  <CardContent sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                    <Box sx={{ mt: 0.5, color: result.entity_type === 'dataset' ? '#1a73e8' : '#137333' }}>
                      {result.entity_type === 'dataset' ? (
                        <StorageIcon />
                      ) : (
                        <TableChartIcon />
                      )}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                        <Typography variant="subtitle1" fontWeight={600}>
                          {result.name}
                        </Typography>
                        <Chip
                          label={result.entity_type}
                          size="small"
                          sx={{
                            fontSize: '0.65rem',
                            height: 20,
                            backgroundColor: result.entity_type === 'dataset' ? '#e8f0fe' : '#e6f4ea',
                            color: result.entity_type === 'dataset' ? '#1a73e8' : '#137333',
                          }}
                        />
                        <SensitivityChip label={result.sensitivity_label as SensitivityLabel} />
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        {result.project_id}.{result.dataset_id}
                        {result.table_id ? `.${result.table_id}` : ''}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {result.description || 'No description'}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {result.tags.map((t) => <TagChip key={t} tag={t} />)}
                      </Box>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, mt: 0.5 }}>
                      {new Date(result.updated_at).toLocaleDateString()}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
      </Grid>

      {!isLoading && data && data.results.length === 0 && q && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>No results found</Typography>
          <Typography variant="body2" color="text.secondary">
            Try different keywords or broaden your search.
          </Typography>
        </Box>
      )}
    </Box>
  )
}
