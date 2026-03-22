import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import GridOnIcon from '@mui/icons-material/GridOn'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import { searchApi } from '../api/search'
import type { SensitivityLabel } from '../api/types'
import { MONO_PATH } from '../design'

export default function SearchResults() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q') ?? ''
  const entityType = (params.get('type') as 'dataset' | 'table' | null) ?? undefined
  const datasetId = params.get('dataset_id') ?? undefined
  const [searchMode, setSearchMode] = useState<'entities' | 'columns'>('entities')

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['search', q, entityType, datasetId],
    queryFn: ({ pageParam = 0 }) =>
      searchApi.search({ q, entity_type: entityType, dataset_id: datasetId, skip: pageParam as number, limit: 20 }),
    getNextPageParam: (lastPage, pages) =>
      lastPage.results.length === 20 ? pages.length * 20 : undefined,
    initialPageParam: 0,
    enabled: !!q,
  })

  const allResults = data?.pages.flatMap((p) => p.results) ?? []
  const total = data?.pages[0]?.total ?? 0

  const { data: columnResults, isLoading: colLoading } = useQuery({
    queryKey: ['search-columns', q],
    queryFn: () => searchApi.searchColumns(q),
    enabled: !!q && searchMode === 'columns',
  })

  const setType = (_: React.MouseEvent, val: string | null) => {
    const next = new URLSearchParams(params)
    if (val) next.set('type', val)
    else next.delete('type')
    setParams(next)
  }

  const handleResultClick = (r: { entity_type: string; id: string; dataset_uuid: string | null; dataset_id: string }) => {
    if (r.entity_type === 'dataset') navigate(`/datasets/${r.id}`)
    else navigate(`/datasets/${r.dataset_uuid ?? r.dataset_id}/tables/${r.id}`)
  }

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        {q && (
          <Typography variant="h5" fontWeight={700} gutterBottom>
            {isLoading ? 'Searching…' : `${total.toLocaleString()} result${total !== 1 ? 's' : ''}`}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          {q ? <>for <strong>"{q}"</strong></> : 'Enter a search term above to find datasets and tables.'}
        </Typography>
      </Box>

      {/* Filters row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          value={searchMode} exclusive
          onChange={(_, v) => v && setSearchMode(v)}
          size="small"
        >
          <ToggleButton value="entities">Datasets &amp; Tables</ToggleButton>
          <ToggleButton value="columns">Columns</ToggleButton>
        </ToggleButtonGroup>

        {searchMode === 'entities' && (
          <ToggleButtonGroup value={entityType ?? ''} exclusive onChange={setType} size="small">
            <ToggleButton value="">All types</ToggleButton>
            <ToggleButton value="dataset">Datasets</ToggleButton>
            <ToggleButton value="table">Tables</ToggleButton>
          </ToggleButtonGroup>
        )}

        {datasetId && (
          <Chip
            label={`Dataset: ${datasetId}`}
            size="small"
            onDelete={() => {
              const next = new URLSearchParams(params)
              next.delete('dataset_id')
              setParams(next)
            }}
            sx={{ bgcolor: '#e8f0fe', color: '#1557b0', fontWeight: 500 }}
          />
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>Search failed. Please try again.</Alert>}

      {!q && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <FolderOpenIcon sx={{ fontSize: 48, color: '#dadce0', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>Start searching</Typography>
          <Typography variant="body2" color="text.disabled">
            Type in the search bar above to find datasets, tables, and columns.
          </Typography>
        </Box>
      )}

      {/* Column search results */}
      {searchMode === 'columns' && q && (
        <Stack spacing={1.5}>
          {colLoading
            ? [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={76} />)
            : columnResults?.length === 0
            ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <ViewColumnIcon sx={{ fontSize: 40, color: '#dadce0', mb: 1.5 }} />
                <Typography variant="h6" color="text.secondary">No columns found</Typography>
              </Box>
            )
            : columnResults?.map((col) => (
              <Card
                key={col.column_id}
                sx={{ cursor: 'pointer' }}
                onClick={() => navigate(`/datasets/${col.dataset_id}/tables/${col.table_id}`)}
              >
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2, px: 2.5, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ p: 1, borderRadius: 2, bgcolor: '#f3e8ff' }}>
                    <ViewColumnIcon sx={{ color: '#9334e6', fontSize: 20 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                      <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {col.column_name}
                      </Typography>
                      {col.data_type && (
                        <Chip label={col.data_type} size="small" sx={{ bgcolor: '#f1f3f4', fontFamily: 'monospace', fontSize: '0.7rem' }} />
                      )}
                      {col.is_pii && (
                        <Chip label="PII" size="small" sx={{ bgcolor: '#fce8e6', color: '#c62828', fontWeight: 600 }} />
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      {col.project_id}.{col.dataset_bq_id}.{col.table_bq_id}
                    </Typography>
                  </Box>
                  <KeyboardArrowRightIcon sx={{ color: '#dadce0' }} />
                </CardContent>
              </Card>
            ))
          }
        </Stack>
      )}

      {/* Entity search results */}
      {searchMode === 'entities' && q && (
        <Stack spacing={1.5}>
          {isLoading
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={100} />)
            : allResults.length === 0 && !isLoading
            ? (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <GridOnIcon sx={{ fontSize: 48, color: '#dadce0', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>No results found</Typography>
                <Typography variant="body2" color="text.disabled">
                  Try different keywords or remove filters.
                </Typography>
              </Box>
            )
            : allResults.map((result) => {
              const isDataset = result.entity_type === 'dataset'
              return (
                <Card
                  key={result.id}
                  sx={{ cursor: 'pointer' }}
                  onClick={() => handleResultClick(result)}
                >
                  <CardContent sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, py: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{
                      p: 1.25, borderRadius: 2, flexShrink: 0,
                      bgcolor: isDataset ? '#e8f0fe' : '#e6f4ea',
                    }}>
                      {isDataset
                        ? <FolderOpenIcon sx={{ color: '#1a73e8', fontSize: 20 }} />
                        : <GridOnIcon sx={{ color: '#137333', fontSize: 20 }} />
                      }
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                        <Typography variant="subtitle1" fontWeight={600}>{result.name}</Typography>
                        <Chip
                          label={result.entity_type}
                          size="small"
                          sx={{
                            bgcolor: isDataset ? '#e8f0fe' : '#e6f4ea',
                            color: isDataset ? '#1557b0' : '#0d5225',
                            fontWeight: 500,
                          }}
                        />
                        <SensitivityChip label={result.sensitivity_label as SensitivityLabel} />
                      </Box>
                      <Typography variant="caption" sx={{ ...MONO_PATH, display: 'block', mb: 0.5 }}>
                        {result.project_id}.{result.dataset_id}{result.table_id ? `.${result.table_id}` : ''}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {result.description || 'No description available'}
                      </Typography>
                      {result.tags.length > 0 && (
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, flexWrap: 'wrap' }}>
                          {result.tags.map((t) => <TagChip key={t} tag={t} />)}
                        </Box>
                      )}
                    </Box>
                    <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                      <Typography variant="caption" color="text.disabled">
                        {new Date(result.updated_at).toLocaleDateString()}
                      </Typography>
                      <KeyboardArrowRightIcon sx={{ color: '#dadce0' }} />
                    </Box>
                  </CardContent>
                </Card>
              )
            })
          }

          {hasNextPage && (
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
              <Button
                variant="outlined"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                startIcon={isFetchingNextPage ? <CircularProgress size={14} /> : undefined}
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </Box>
          )}
        </Stack>
      )}
    </Box>
  )
}
