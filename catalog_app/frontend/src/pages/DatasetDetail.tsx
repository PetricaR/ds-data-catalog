import { useState, type ReactNode } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Card from '@mui/material/Card'
import InputAdornment from '@mui/material/InputAdornment'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import GridOnIcon from '@mui/icons-material/GridOn'
import NumbersIcon from '@mui/icons-material/Numbers'
import SdStorageOutlinedIcon from '@mui/icons-material/SdStorageOutlined'
import SearchIcon from '@mui/icons-material/Search'
import VerifiedIcon from '@mui/icons-material/Verified'
import ViewWeekOutlinedIcon from '@mui/icons-material/ViewWeekOutlined'
import { datasetsApi } from '../api/datasets'
import type { ProjectUsage, Table } from '../api/types'
import ProjectsEditor from '../components/ProjectsEditor'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import {
  CardLink, EmptyState, LoadError, MONO, MetaPill, PATH_SX, PageHeader, compactNumber, formatBytes, formatDate,
  linkCardSx, plural,
} from '../components/ui'
import { canEdit, useAuth } from '../contexts/AuthContext'
import { tokens } from '../theme'

function qualityTone(score: number) {
  return score >= 80 ? 'success' : score >= 50 ? 'warning' : 'danger'
}

function TableCard({ datasetId, t }: { datasetId: string; t: Table }) {
  return (
    <Card component="article" sx={linkCardSx}>
      <Box sx={{ px: 2.5, py: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle1" component="h3" sx={{ overflowWrap: 'anywhere' }}>
            <CardLink to={`/datasets/${datasetId}/tables/${t.id}`}>{t.display_name || t.table_id}</CardLink>
          </Typography>
          {t.display_name && t.display_name !== t.table_id && (
            <Typography component="span" sx={{ ...MONO, fontSize: '0.75rem', color: tokens.ink3 }}>{t.table_id}</Typography>
          )}
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">Updated {formatDate(t.updated_at)}</Typography>
        </Box>
        <Typography
          variant="body2"
          color={t.description ? 'text.secondary' : tokens.ink3}
          sx={{ mt: 0.5, fontStyle: t.description ? 'normal' : 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {t.description || 'No description yet'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, mt: 1.25, flexWrap: 'wrap', alignItems: 'center' }}>
          {t.is_validated && (
            <MetaPill tone="success" icon={<VerifiedIcon />} title={t.validated_by ? `Validated by ${t.validated_by}` : undefined}>
              {t.validated_columns.length > 0 ? `Trusted · ${t.validated_columns.length} cols` : 'Trusted'}
            </MetaPill>
          )}
          <SensitivityChip label={t.sensitivity_label} />
          {t.columns.length > 0 && <MetaPill icon={<ViewWeekOutlinedIcon />}>{t.columns.length} cols</MetaPill>}
          {t.row_count != null && <MetaPill icon={<NumbersIcon />}>{compactNumber(t.row_count)} rows</MetaPill>}
          {t.size_bytes != null && <MetaPill icon={<SdStorageOutlinedIcon />}>{formatBytes(t.size_bytes)}</MetaPill>}
          {t.quality_score != null && (
            <MetaPill tone={qualityTone(t.quality_score)} title="Documentation score: description, column docs, validation, tags, example queries">
              Docs {Math.round(t.quality_score)}%
            </MetaPill>
          )}
          {t.tags.slice(0, 3).map((tag) => <TagChip key={tag} tag={tag} />)}
        </Box>
      </Box>
    </Card>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.875, borderBottom: `1px solid ${tokens.rule}`, '&:last-of-type': { borderBottom: 'none' } }}>
      <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, textAlign: 'right', overflowWrap: 'anywhere' }}>{children}</Typography>
    </Box>
  )
}

export default function DatasetDetail() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const { user } = useAuth()
  const editor = canEdit(user)
  const [filter, setFilter] = useState('')

  const { data: dataset, isLoading, error } = useQuery({
    queryKey: ['dataset', id],
    queryFn: () => datasetsApi.get(id!),
    enabled: !!id,
    retry: false,
  })

  const { data: tables, isLoading: tablesLoading } = useQuery({
    queryKey: ['dataset', id, 'tables'],
    queryFn: () => datasetsApi.listTables(id!),
    enabled: !!dataset,
  })

  const projectsMutation = useMutation({
    mutationFn: (projects: ProjectUsage[]) => datasetsApi.updateProjects(id!, projects),
    onSuccess: (updated) => qc.setQueryData(['dataset', id], updated),
  })

  if (isLoading) {
    return (
      <Box>
        <Skeleton width={260} height={20} sx={{ mb: 2 }} />
        <Skeleton width={360} height={44} sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={320} />
      </Box>
    )
  }
  if (!dataset) return <LoadError error={error} what="dataset" />

  const name = dataset.display_name || dataset.dataset_id
  const needle = filter.trim().toLowerCase()
  const shown = (tables ?? []).filter((t) =>
    !needle
    || t.table_id.toLowerCase().includes(needle)
    || (t.display_name ?? '').toLowerCase().includes(needle)
    || (t.description ?? '').toLowerCase().includes(needle)
    || t.columns.some((c) => c.name.toLowerCase().includes(needle)),
  )

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/browse" color="inherit">Browse</Link>
        <Typography component="span" sx={{ ...MONO, fontSize: 'inherit', color: tokens.ink3 }}>{dataset.project_id}</Typography>
        <Typography component="span" color="text.primary" fontSize="inherit" aria-current="page">{name}</Typography>
      </Breadcrumbs>

      <PageHeader
        eyebrow="Dataset"
        title={name}
        subtitle={
          <>
            <Box component="span" sx={{ ...PATH_SX, display: 'block' }}>{dataset.project_id}.{dataset.dataset_id}</Box>
            {dataset.description && <Box component="span" sx={{ display: 'block', mt: 1, color: tokens.ink2, whiteSpace: 'pre-wrap' }}>{dataset.description}</Box>}
          </>
        }
      >
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1.5 }}>
          {dataset.is_validated && <MetaPill tone="success" icon={<VerifiedIcon />}>Validated</MetaPill>}
          <SensitivityChip label={dataset.sensitivity_label} showInternal />
          {dataset.tags.map((t) => <TagChip key={t} tag={t} />)}
        </Box>
      </PageHeader>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 320px' }, gap: 3, alignItems: 'start' }}>
        <Box component="section" aria-labelledby="tables-heading" sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
            <Typography id="tables-heading" variant="h6" component="h2" sx={{ flex: 1 }}>
              Tables <Box component="span" sx={{ ...MONO, color: tokens.ink3, fontWeight: 400 }}>{tables?.length ?? ''}</Box>
            </Typography>
            <TextField
              size="small"
              type="search"
              placeholder="Filter by name, description or column"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              inputProps={{ 'aria-label': `Filter tables in ${name}` }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment> }}
              sx={{ width: { xs: '100%', sm: 320 }, '& input': { fontSize: '0.875rem' } }}
            />
          </Box>

          {tablesLoading ? (
            [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={96} sx={{ mb: 1.5 }} />)
          ) : !tables?.length ? (
            <EmptyState icon={<GridOnIcon />} title="No tables in this dataset">
              Tables appear here after the next BigQuery sync of {dataset.project_id}.
            </EmptyState>
          ) : shown.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No table matches “{filter.trim()}”.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {shown.map((t) => <TableCard key={t.id} datasetId={dataset.id} t={t} />)}
            </Box>
          )}
        </Box>

        <Box component="aside" aria-label="Dataset details" sx={{ minWidth: 0 }}>
          <Box component="section" sx={{ border: `1px solid ${tokens.rule}`, borderRadius: `${tokens.radiusLg}px`, bgcolor: tokens.surface, px: 2, py: 1.5, mb: 2 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>About</Typography>
            <Box component="dl" sx={{ m: 0 }}>
              <Fact label="Owner">{dataset.owner || '—'}</Fact>
              <Fact label="Data steward">{dataset.data_steward || '—'}</Fact>
              <Fact label="Location">{dataset.bq_location || '—'}</Fact>
              <Fact label="Created in BigQuery">{formatDate(dataset.bq_created_at)}</Fact>
              <Fact label="Modified in BigQuery">{formatDate(dataset.bq_last_modified)}</Fact>
              <Fact label="Tables">{plural(dataset.table_count, 'table')}</Fact>
              {dataset.is_validated && (
                <Fact label="Validated">
                  {dataset.validated_by ?? '—'}
                  {dataset.validated_at && <Box component="span" sx={{ display: 'block', color: tokens.ink3 }}>{formatDate(dataset.validated_at)}</Box>}
                </Fact>
              )}
            </Box>
          </Box>
          <ProjectsEditor
            projects={dataset.used_in_projects ?? []}
            what="dataset"
            canEdit={editor}
            saving={projectsMutation.isPending}
            onSave={projectsMutation.mutateAsync}
          />
        </Box>
      </Box>
    </Box>
  )
}
