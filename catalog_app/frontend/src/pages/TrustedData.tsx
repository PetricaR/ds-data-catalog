import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActionArea from '@mui/material/CardActionArea'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import TableChartIcon from '@mui/icons-material/TableChart'
import VerifiedIcon from '@mui/icons-material/Verified'
import GppBadIcon from '@mui/icons-material/GppBad'
import PersonIcon from '@mui/icons-material/Person'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import { tablesApi } from '../api/tables'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import type { SensitivityLabel, Table } from '../api/types'

export default function TrustedData() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [confirmTable, setConfirmTable] = useState<Table | null>(null)

  const revokeMutation = useMutation({
    mutationFn: (id: string) => tablesApi.validate(id),
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <VerifiedIcon sx={{ color: '#1e8e3e', fontSize: 32 }} />
        <Box>
          <Typography variant="h4" fontWeight={700}>Trusted Data</Typography>
          <Typography variant="body2" color="text.secondary">
            Tables validated and approved as reliable sources by a data steward.
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Chip
          icon={<TableChartIcon sx={{ fontSize: '16px !important' }} />}
          label={`${tables?.length ?? 0} validated tables`}
          sx={{ bgcolor: '#e6f4ea', color: '#137333', fontWeight: 500 }}
        />
      </Box>

      {/* Table list */}
      {isLoading
        ? [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={90} sx={{ mb: 1.5 }} />)
        : tables?.length === 0
        ? (
          <Alert severity="info" icon={<VerifiedIcon />}>
            No validated tables yet. Open a table and click <strong>Validate</strong> to mark it as a trusted source.
          </Alert>
        )
        : tables?.map((t) => (
          <Card key={t.id} sx={{ mb: 1.5 }}>
            <CardActionArea onClick={() => navigate(`/datasets/${t.dataset_id}/tables/${t.id}`)}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <TableChartIcon sx={{ color: '#137333', mt: 0.3, flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>

                    {/* Title row */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {t.display_name || t.table_id}
                      </Typography>
                      <VerifiedIcon sx={{ fontSize: 16, color: '#1e8e3e' }} />
                      <SensitivityChip label={t.sensitivity_label as SensitivityLabel} />
                      {t.columns.length > 0 && (
                        <Chip label={`${t.columns.length} cols`} size="small" sx={{ fontSize: '0.65rem', height: 20 }} />
                      )}
                      {t.row_count != null && (
                        <Chip label={`${t.row_count.toLocaleString()} rows`} size="small" sx={{ fontSize: '0.65rem', height: 20 }} />
                      )}
                      <Box sx={{ flex: 1 }} />
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<GppBadIcon sx={{ fontSize: '14px !important' }} />}
                        onClick={(e) => { e.stopPropagation(); setConfirmTable(t) }}
                        sx={{ fontSize: '0.72rem', py: 0.4, flexShrink: 0 }}
                      >
                        Remove validation
                      </Button>
                    </Box>

                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                      {t.dataset_project_id}.{t.dataset_display_name}.{t.table_id}
                    </Typography>

                    {t.description && (
                      <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.5 }}>
                        {t.description}
                      </Typography>
                    )}

                    <Box sx={{ display: 'flex', gap: 2, mt: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                      {t.validated_by && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <PersonIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                          <Typography variant="caption" color="text.secondary">{t.validated_by}</Typography>
                        </Box>
                      )}
                      {t.validated_at && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <AccessTimeIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                          <Typography variant="caption" color="text.secondary">
                            {new Date(t.validated_at).toLocaleDateString()}
                          </Typography>
                        </Box>
                      )}
                      {t.tags.slice(0, 3).map((tag) => <TagChip key={tag} tag={tag} />)}
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        ))
      }

      {/* Confirmation dialog */}
      <Dialog open={!!confirmTable} onClose={() => setConfirmTable(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <GppBadIcon color="error" />
          Remove validation?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to remove the trusted status from{' '}
            <strong>{confirmTable?.display_name || confirmTable?.table_id}</strong>?
            <br /><br />
            The table will remain in the catalog but will no longer appear in Trusted Data.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmTable(null)} variant="outlined">
            Cancel
          </Button>
          <Button
            onClick={() => revokeMutation.mutate(confirmTable!.id)}
            variant="contained"
            color="error"
            disabled={revokeMutation.isPending}
          >
            {revokeMutation.isPending ? 'Removing…' : 'Yes, remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
