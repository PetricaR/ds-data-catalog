import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined'
import GridOnIcon from '@mui/icons-material/GridOn'
import SearchIcon from '@mui/icons-material/Search'
import ViewWeekOutlinedIcon from '@mui/icons-material/ViewWeekOutlined'
import { searchApi } from '../api/search'
import type { ColumnSearchResult, SearchResult, SensitivityLabel } from '../api/types'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import { CardLink, EmptyState, MONO, MetaPill, PATH_SX, PageHeader, formatDate, linkCardSx, plural } from '../components/ui'
import { tokens } from '../theme'

const PAGE = 20
type Mode = 'entities' | 'columns'

const SENSITIVITY_LABELS: Record<SensitivityLabel, string> = {
  public: 'Public', internal: 'Internal', confidential: 'Confidential', restricted: 'Restricted',
}

/** Applied on Enter or when the field loses focus, not on every keystroke. */
function ColumnFilter({ value, onApply }: { value: string; onApply: (value: string | null) => void }) {
  const [draft, setDraft] = useState(value)
  const apply = () => { if (draft.trim() !== value) onApply(draft.trim() || null) }
  return (
    <TextField
      size="small"
      label="Has a column named"
      placeholder="customer_id"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={apply}
      onKeyDown={(e) => { if (e.key === 'Enter') apply() }}
      inputProps={{ style: { fontFamily: tokens.fontMono } }}
      InputProps={{
        startAdornment: <InputAdornment position="start"><ViewWeekOutlinedIcon sx={{ fontSize: 16 }} /></InputAdornment>,
      }}
      sx={{ width: { xs: '100%', sm: 220 } }}
    />
  )
}

function ResultIcon({ dataset }: { dataset: boolean }) {
  return (
    <Box aria-hidden sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: `${tokens.radius}px`, display: 'grid', placeItems: 'center', bgcolor: tokens.accentWash, color: tokens.accent, '& svg': { fontSize: 20 } }}>
      {dataset ? <FolderOutlinedIcon /> : <GridOnIcon />}
    </Box>
  )
}

function EntityCard({ r }: { r: SearchResult }) {
  const dataset = r.entity_type === 'dataset'
  const to = dataset ? `/datasets/${r.id}` : `/datasets/${r.dataset_uuid}/tables/${r.id}`
  return (
    <Card component="article" sx={linkCardSx}>
      <Box sx={{ display: 'flex', gap: 2, px: 2.5, py: 2, alignItems: 'flex-start' }}>
        <ResultIcon dataset={dataset} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="subtitle1" component="h2" sx={{ overflowWrap: 'anywhere' }}>
              <CardLink to={to}>{r.name}</CardLink>
            </Typography>
            <MetaPill tone="accent">{dataset ? 'Dataset' : 'Table'}</MetaPill>
            <SensitivityChip label={r.sensitivity_label} />
            <Box sx={{ flex: 1 }} />
            <Typography variant="caption" color="text.secondary">Updated {formatDate(r.updated_at)}</Typography>
          </Box>
          <Typography sx={{ ...PATH_SX, fontSize: '0.75rem', mt: 0.25 }}>
            {r.project_id}.{r.dataset_id}{r.table_id ? `.${r.table_id}` : ''}
          </Typography>
          <Typography
            variant="body2"
            sx={{ mt: 0.75, color: r.description ? tokens.ink2 : tokens.ink3, fontStyle: r.description ? 'normal' : 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {r.description || 'No description'}
          </Typography>
          {r.tags.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
              {r.tags.map((t) => <TagChip key={t} tag={t} />)}
            </Box>
          )}
        </Box>
      </Box>
    </Card>
  )
}

function ColumnCard({ col }: { col: ColumnSearchResult }) {
  return (
    <Card component="article" sx={linkCardSx}>
      <Box sx={{ display: 'flex', gap: 2, px: 2.5, py: 1.75, alignItems: 'center' }}>
        <Box aria-hidden sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: `${tokens.radius}px`, display: 'grid', placeItems: 'center', bgcolor: tokens.paper2, color: tokens.ink2 }}>
          <ViewWeekOutlinedIcon sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography component="h2" sx={{ ...MONO, fontSize: '0.9375rem', fontWeight: 600 }}>
              <CardLink to={`/datasets/${col.dataset_id}/tables/${col.table_id}`}>{col.column_name}</CardLink>
            </Typography>
            {col.data_type && <MetaPill mono>{col.data_type}</MetaPill>}
            {col.is_pii && <MetaPill tone="danger">PII</MetaPill>}
          </Box>
          <Typography sx={{ ...PATH_SX, fontSize: '0.75rem', mt: 0.25 }}>
            {col.project_id}.{col.dataset_bq_id}.{col.table_bq_id}
          </Typography>
        </Box>
      </Box>
    </Card>
  )
}

export default function SearchResults() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q')?.trim() ?? ''
  const mode: Mode = params.get('mode') === 'columns' ? 'columns' : 'entities'
  const entityType = (params.get('type') as 'dataset' | 'table' | null) ?? undefined
  const datasetId = params.get('dataset_id') ?? undefined
  const projectId = params.get('project_id') ?? undefined
  const sensitivity = params.get('sensitivity') ?? undefined
  const tags = params.getAll('tag')
  const columnName = params.get('column') ?? undefined
  const filtered = !!(sensitivity || tags.length || columnName)
  const { data: knownTags = [] } = useQuery({ queryKey: ['tags'], queryFn: searchApi.tags, staleTime: 60_000 })

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const setTags = (next: string[]) => {
    const p = new URLSearchParams(params)
    p.delete('tag')
    next.forEach((t) => p.append('tag', t))
    setParams(p, { replace: true })
  }
  const clearFilters = () => {
    const p = new URLSearchParams(params)
    ;['sensitivity', 'tag', 'column'].forEach((key) => p.delete(key))
    setParams(p, { replace: true })
  }

  const entities = useInfiniteQuery({
    queryKey: ['search', q, entityType, datasetId, projectId, sensitivity, tags, columnName],
    queryFn: ({ pageParam }) =>
      searchApi.search({
        q, entity_type: entityType, dataset_id: datasetId, project_id: projectId,
        sensitivity_label: sensitivity, tags: tags.length ? tags : undefined, column_name: columnName,
        skip: pageParam, limit: PAGE,
      }),
    getNextPageParam: (last, pages) => (last.results.length === PAGE ? pages.length * PAGE : undefined),
    initialPageParam: 0,
    enabled: !!q && mode === 'entities',
  })
  const results = entities.data?.pages.flatMap((p) => p.results) ?? []
  const total = entities.data?.pages[0]?.total ?? 0

  const columns = useQuery({
    queryKey: ['search-columns', q],
    queryFn: () => searchApi.searchColumns(q),
    enabled: !!q && mode === 'columns',
  })

  const loading = mode === 'entities' ? entities.isLoading : columns.isLoading
  const count = mode === 'entities' ? total : columns.data?.length ?? 0
  const noun = mode === 'entities' ? 'result' : 'column'

  if (!q) {
    return (
      <Box>
        <PageHeader eyebrow="Search" title="Search the catalog" />
        <EmptyState icon={<SearchIcon />} title="Type a search above">
          Find datasets, tables and columns by name, description or tag.
        </EmptyState>
      </Box>
    )
  }

  return (
    <Box>
      <PageHeader
        eyebrow="Search"
        title={<>Results for “{q}”</>}
        subtitle={loading ? 'Searching…' : `${plural(count, noun)}${mode === 'columns' && count === 50 ? ' (first 50)' : ''}`}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
        <ToggleButtonGroup value={mode} exclusive size="small" aria-label="What to search" onChange={(_, v: Mode | null) => v && setParam('mode', v === 'columns' ? 'columns' : null)}>
          <ToggleButton value="entities">Datasets &amp; tables</ToggleButton>
          <ToggleButton value="columns">Columns</ToggleButton>
        </ToggleButtonGroup>

        {mode === 'entities' && (
          <ToggleButtonGroup value={entityType ?? ''} exclusive size="small" aria-label="Result type" onChange={(_, v: string | null) => v !== null && setParam('type', v || null)}>
            <ToggleButton value="">All</ToggleButton>
            <ToggleButton value="dataset">Datasets</ToggleButton>
            <ToggleButton value="table">Tables</ToggleButton>
          </ToggleButtonGroup>
        )}

        {mode === 'entities' && datasetId && (
          <Chip
            label={`In ${projectId ? `${projectId}.` : ''}${datasetId}`}
            onDelete={() => {
              const next = new URLSearchParams(params)
              next.delete('dataset_id')
              next.delete('project_id')
              setParams(next, { replace: true })
            }}
            sx={{ ...MONO, bgcolor: tokens.accentWash, color: tokens.ink }}
          />
        )}
      </Box>

      {mode === 'entities' && (
        <Box component="section" aria-label="Filters" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, mt: -1.5, flexWrap: 'wrap' }}>
          <TextField
            select size="small" label="Sensitivity"
            value={sensitivity ?? ''}
            onChange={(e) => setParam('sensitivity', e.target.value || null)}
            SelectProps={{ displayEmpty: true }}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Any</MenuItem>
            {Object.entries(SENSITIVITY_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
          <Autocomplete
            multiple size="small"
            options={knownTags}
            value={tags}
            onChange={(_, next) => setTags(next)}
            renderInput={(p) => <TextField {...p} label="Any of these tags" placeholder={tags.length ? '' : 'Pick tags'} />}
            ChipProps={{ size: 'small', sx: MONO }}
            sx={{ minWidth: 220, flex: { xs: '1 1 100%', sm: '0 1 320px' } }}
          />
          <ColumnFilter key={columnName ?? ''} value={columnName ?? ''} onApply={(v) => setParam('column', v)} />
          {filtered && <Button size="small" onClick={clearFilters}>Clear filters</Button>}
        </Box>
      )}

      {(mode === 'entities' ? entities.isError : columns.isError) && (
        <Alert severity="error" sx={{ mb: 2 }}>Search failed. Please try again.</Alert>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {loading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={96} />)
        ) : count === 0 ? (
          <EmptyState icon={mode === 'entities' ? <GridOnIcon /> : <ViewWeekOutlinedIcon />} title={`No ${noun}s found`}>
            {mode === 'entities'
              ? 'Try other words, remove a filter, or search column names instead.'
              : 'No column name contains that text.'}
          </EmptyState>
        ) : mode === 'entities' ? (
          results.map((r) => <EntityCard key={`${r.entity_type}-${r.id}`} r={r} />)
        ) : (
          columns.data?.map((c) => <ColumnCard key={c.column_id} col={c} />)
        )}

        {mode === 'entities' && entities.hasNextPage && (
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
            <Button
              variant="outlined"
              onClick={() => entities.fetchNextPage()}
              disabled={entities.isFetchingNextPage}
              startIcon={entities.isFetchingNextPage ? <CircularProgress size={14} /> : undefined}
            >
              {entities.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  )
}
