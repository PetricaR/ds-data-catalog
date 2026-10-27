import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import GppBadOutlinedIcon from '@mui/icons-material/GppBadOutlined'
import NumbersIcon from '@mui/icons-material/Numbers'
import VerifiedIcon from '@mui/icons-material/Verified'
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined'
import ViewWeekOutlinedIcon from '@mui/icons-material/ViewWeekOutlined'
import { tablesApi } from '../api/tables'
import type { Table } from '../api/types'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import { CardLink, EmptyState, MetaPill, PATH_SX, PageHeader, compactNumber, formatDate, linkCardSx, plural } from '../components/ui'
import { canEdit, useAuth } from '../contexts/AuthContext'
import { tokens } from '../theme'

const PAGE = 50

export default function TrustedData() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const editor = canEdit(user)
  const [confirmTable, setConfirmTable] = useState<Table | null>(null)

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['tables', { validated: true }],
    queryFn: ({ pageParam }) => tablesApi.list({ validated: true, skip: pageParam, limit: PAGE }),
    getNextPageParam: (last, pages) => (last.length === PAGE ? pages.length * PAGE : undefined),
    initialPageParam: 0,
  })
  const tables = data?.pages.flat() ?? []

  const revoke = useMutation({
    mutationFn: (t: Table) => tablesApi.validate(t.id, { trusted: false }),
    onSuccess: (updated) => {
      qc.setQueryData(['table', updated.id], updated)
      qc.invalidateQueries({ queryKey: ['tables'] })
      qc.invalidateQueries({ queryKey: ['dataset', updated.dataset_id, 'tables'] })
      setConfirmTable(null)
    },
  })

  return (
    <Box>
      <PageHeader
        eyebrow="Catalog"
        title="Trusted data"
        subtitle="Tables an editor has reviewed and certified as a reliable source."
        actions={tables.length > 0 && <MetaPill tone="success" icon={<VerifiedIcon />}>{plural(tables.length, 'trusted table')}{hasNextPage ? '+' : ''}</MetaPill>}
      />

      {isLoading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={104} />)}
        </Box>
      ) : tables.length === 0 ? (
        <EmptyState
          icon={<VerifiedOutlinedIcon />}
          title="No trusted tables yet"
          action={<Button component={RouterLink} to="/browse" variant="outlined">Browse the catalog</Button>}
        >
          {editor
            ? <>Open a table and select <strong>Mark as trusted</strong> to certify it.</>
            : 'Editors certify tables after reviewing them; they will be listed here.'}
        </EmptyState>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {tables.map((t) => (
            <Card key={t.id} component="article" sx={linkCardSx}>
              <Box sx={{ display: 'flex', gap: 2, px: 2.5, py: 2, alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                <Box aria-hidden sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: `${tokens.radius}px`, display: 'grid', placeItems: 'center', bgcolor: tokens.successWash, color: tokens.success }}>
                  <VerifiedIcon sx={{ fontSize: 20 }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" component="h2" sx={{ overflowWrap: 'anywhere' }}>
                    <CardLink to={`/datasets/${t.dataset_id}/tables/${t.id}`}>{t.display_name || t.table_id}</CardLink>
                  </Typography>
                  <Typography sx={{ ...PATH_SX, fontSize: '0.75rem' }}>
                    {t.dataset_project_id}.{t.dataset_bq_dataset_id}.{t.table_id}
                  </Typography>
                  {t.description && (
                    <Typography variant="body2" sx={{ color: tokens.ink2, mt: 0.75, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {t.description}
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 1.25, flexWrap: 'wrap', alignItems: 'center' }}>
                    <SensitivityChip label={t.sensitivity_label} />
                    {t.columns.length > 0 && <MetaPill icon={<ViewWeekOutlinedIcon />}>{t.validated_columns.length ? `${t.validated_columns.length}/${t.columns.length}` : t.columns.length} cols{t.validated_columns.length ? ' validated' : ''}</MetaPill>}
                    {t.row_count != null && <MetaPill icon={<NumbersIcon />}>{compactNumber(t.row_count)} rows</MetaPill>}
                    {t.tags.slice(0, 3).map((tag) => <TagChip key={tag} tag={tag} />)}
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                      Validated{t.validated_by ? ` by ${t.validated_by}` : ''}{t.validated_at ? ` on ${formatDate(t.validated_at)}` : ''}
                    </Typography>
                  </Box>
                </Box>
                {editor && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="inherit"
                    startIcon={<GppBadOutlinedIcon />}
                    onClick={() => setConfirmTable(t)}
                    sx={{ borderColor: tokens.ruleStrong, flexShrink: 0 }}
                    aria-label={`Revoke trust for ${t.display_name || t.table_id}`}
                  >
                    Revoke
                  </Button>
                )}
              </Box>
            </Card>
          ))}
          {hasNextPage && (
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
              <Button variant="outlined" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} startIcon={isFetchingNextPage ? <CircularProgress size={14} /> : undefined}>
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </Box>
          )}
        </Box>
      )}

      <Dialog open={!!confirmTable} onClose={() => setConfirmTable(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Revoke trusted status?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>{confirmTable?.display_name || confirmTable?.table_id}</strong> stays in the catalog but leaves this list, and its validated columns are cleared.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmTable(null)}>Cancel</Button>
          <Button
            onClick={() => confirmTable && revoke.mutate(confirmTable)}
            variant="contained"
            color="error"
            disabled={revoke.isPending}
            startIcon={revoke.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            Revoke
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
