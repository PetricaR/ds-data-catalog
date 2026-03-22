import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import TableChartIcon from '@mui/icons-material/TableChart'
import VerifiedIcon from '@mui/icons-material/Verified'
import GppBadIcon from '@mui/icons-material/GppBad'
import PersonIcon from '@mui/icons-material/Person'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight'
import { tablesApi } from '../api/tables'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import type { SensitivityLabel, Table } from '../api/types'

export default function TrustedData() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [confirmTable, setConfirmTable] = useState<Table | null>(null)

  const revokeMutation = useMutation({
    mutationFn: (id: string) => tablesApi.validate(id, { validated_by: '', validated_columns: [] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tables', { validated: true }] })
      setConfirmTable(null)
    },
  })

  const { data: tables, isLoading } = useQuery({
    queryKey: ['tables', { validated: true }],
    queryFn: () => tablesApi.list({ limit: 200 }),
    select: (data) => data.filter((t) => t.is_validated),
  })

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ p: 1.25, borderRadius: 2.5, bgcolor: '#e6f4ea' }}>
            <VerifiedIcon sx={{ color: '#137333', fontSize: 28 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700}>Trusted Data</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              Validated and certified sources approved by your data stewards
            </Typography>
          </Box>
        </Box>
        {(tables?.length ?? 0) > 0 && (
          <Chip
            icon={<TableChartIcon sx={{ fontSize: '15px !important' }} />}
            label={`${tables?.length} validated`}
            sx={{ bgcolor: '#e6f4ea', color: '#0d5225', fontWeight: 600, fontSize: '0.8rem' }}
          />
        )}
      </Box>

      {/* Content */}
      {isLoading ? (
        <Stack spacing={1.5}>
          {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={96} />)}
        </Stack>
      ) : tables?.length === 0 ? (
        <Box sx={{
          textAlign: 'center', py: 8, px: 4,
          border: '2px dashed #e8eaed', borderRadius: 3,
        }}>
          <VerifiedIcon sx={{ fontSize: 52, color: '#dadce0', mb: 2 }} />
          <Typography variant="h6" gutterBottom color="text.secondary">No trusted tables yet</Typography>
          <Typography variant="body2" color="text.disabled">
            Open any table in the catalog and click <strong>Validate</strong> to mark it as a trusted source.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {tables?.map((t) => (
            <Card
              key={t.id}
              sx={{ cursor: 'pointer' }}
              onClick={() => navigate(`/datasets/${t.dataset_id}/tables/${t.id}`)}
            >
              <CardContent sx={{ py: 2, px: 2.5, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  {/* Icon */}
                  <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: '#e6f4ea', flexShrink: 0 }}>
                    <TableChartIcon sx={{ color: '#137333', fontSize: 20 }} />
                  </Box>

                  {/* Content */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* Title row */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {t.display_name || t.table_id}
                      </Typography>
                      <VerifiedIcon sx={{ fontSize: 16, color: '#137333' }} />
                      <SensitivityChip label={t.sensitivity_label as SensitivityLabel} />
                      {t.columns.length > 0 && (
                        <Chip label={`${t.columns.length} cols`} size="small" variant="outlined" />
                      )}
                      {t.row_count != null && (
                        <Chip label={`${t.row_count.toLocaleString()} rows`} size="small" variant="outlined" />
                      )}
                    </Box>

                    {/* Breadcrumb */}
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#9aa0a6' }}>
                      {t.dataset_project_id}.{t.dataset_display_name}.{t.table_id}
                    </Typography>

                    {/* Description */}
                    {t.description && (
                      <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.5 }}>
                        {t.description}
                      </Typography>
                    )}

                    {/* Meta row */}
                    <Box sx={{ display: 'flex', gap: 2.5, mt: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      {t.validated_by && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <PersonIcon sx={{ fontSize: 13, color: '#9aa0a6' }} />
                          <Typography variant="caption" color="text.secondary">{t.validated_by}</Typography>
                        </Box>
                      )}
                      {t.validated_at && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <AccessTimeIcon sx={{ fontSize: 13, color: '#9aa0a6' }} />
                          <Typography variant="caption" color="text.secondary">
                            {new Date(t.validated_at).toLocaleDateString()}
                          </Typography>
                        </Box>
                      )}
                      {t.tags.slice(0, 3).map((tag) => <TagChip key={tag} tag={tag} />)}
                    </Box>
                  </Box>

                  {/* Actions */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<GppBadIcon sx={{ fontSize: '14px !important' }} />}
                      onClick={(e) => { e.stopPropagation(); setConfirmTable(t) }}
                      sx={{ fontSize: '0.75rem', py: 0.5, whiteSpace: 'nowrap' }}
                    >
                      Revoke
                    </Button>
                    <KeyboardArrowRightIcon sx={{ color: '#dadce0', ml: 0.5 }} />
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {/* Confirmation dialog */}
      <Dialog open={!!confirmTable} onClose={() => setConfirmTable(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <GppBadIcon color="error" />
          Remove validation?
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <DialogContentText>
            Remove trusted status from{' '}
            <strong>{confirmTable?.display_name || confirmTable?.table_id}</strong>?
            <br /><br />
            The table stays in the catalog but won't appear here.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setConfirmTable(null)} variant="outlined">Cancel</Button>
          <Button
            onClick={() => revokeMutation.mutate(confirmTable!.id)}
            variant="contained"
            color="error"
            disabled={revokeMutation.isPending}
          >
            {revokeMutation.isPending ? 'Removing…' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
