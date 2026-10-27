import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Stepper from '@mui/material/Stepper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import KeyIcon from '@mui/icons-material/Key'
import VerifiedIcon from '@mui/icons-material/Verified'
import { useAuth } from '../contexts/AuthContext'
import type { Table as TableType } from '../api/types'
import { tokens } from '../theme'
import SensitivityChip from './SensitivityChip'
import TagChip from './TagChip'
import { MONO, MetaPill, PATH_SX, compactNumber, formatBytes, formatDate } from './ui'

const STEPS = ['Review', 'Select columns', 'Confirm']

interface Props {
  open: boolean
  onClose: () => void
  table: TableType
  onValidate: (validatedColumns: string[]) => void
  isValidating: boolean
}

export default function ValidationWizard({ open, onClose, table, onValidate, isValidating }: Props) {
  const [activeStep, setActiveStep] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const { user } = useAuth()
  const columns = [...table.columns].sort((a, b) => a.position - b.position)

  // Start over each time the wizard opens
  useEffect(() => {
    if (open) {
      setActiveStep(0)
      setSelected(new Set())
    }
  }, [open])

  const allSelected = columns.length > 0 && selected.size === columns.length
  const toggle = (name: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    return next
  })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(columns.map((c) => c.name)))

  return (
    <Dialog open={open} onClose={isValidating ? undefined : onClose} maxWidth="md" fullWidth aria-labelledby="validation-title">
      <DialogTitle id="validation-title">Mark as a trusted source</DialogTitle>

      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {STEPS.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>

        {activeStep === 0 && (
          <Box>
            <Typography variant="h6" component="h3">{table.display_name || table.table_id}</Typography>
            <Typography sx={{ ...PATH_SX, mb: 2 }}>
              {table.dataset_project_id}.{table.dataset_bq_dataset_id}.{table.table_id}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
              <SensitivityChip label={table.sensitivity_label} showInternal />
              {table.row_count != null && <MetaPill>{compactNumber(table.row_count)} rows</MetaPill>}
              {table.size_bytes != null && <MetaPill>{formatBytes(table.size_bytes)}</MetaPill>}
              <MetaPill>{table.columns.length} columns</MetaPill>
              {table.tags.map((t) => <TagChip key={t} tag={t} />)}
            </Box>
            <Typography variant="body2" sx={{ color: table.description ? tokens.ink2 : tokens.ink3, fontStyle: table.description ? 'normal' : 'italic', mb: 2, whiteSpace: 'pre-wrap' }}>
              {table.description || 'This table has no description yet. Consider adding one before certifying it.'}
            </Typography>
            <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 2, m: 0, pt: 2, borderTop: `1px solid ${tokens.rule}` }}>
              {[['Owner', table.owner || '—'], ['Modified in BigQuery', formatDate(table.bq_last_modified)], ['Catalog entry updated', formatDate(table.updated_at)]].map(([label, value]) => (
                <Box key={label}>
                  <Typography component="dt" variant="caption" sx={{ color: tokens.ink3 }}>{label}</Typography>
                  <Typography component="dd" variant="body2" sx={{ m: 0 }}>{value}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {activeStep === 1 && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
              <Typography variant="body2" color="text.secondary">Select the columns you reviewed and vouch for. You can also certify the table without picking columns.</Typography>
              {columns.length > 0 && (
                <FormControlLabel
                  control={<Checkbox checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onChange={toggleAll} size="small" />}
                  label={<Typography variant="body2">Select all</Typography>}
                  sx={{ mr: 0 }}
                />
              )}
            </Box>
            <TableContainer sx={{ maxHeight: 380, border: `1px solid ${tokens.rule}`, borderRadius: `${tokens.radius}px` }}>
              <Table size="small" stickyHeader aria-label="Columns to validate">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>Column</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Description</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {columns.map((col) => (
                    <TableRow key={col.id} hover selected={selected.has(col.name)} onClick={() => toggle(col.name)} sx={{ cursor: 'pointer' }}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selected.has(col.name)}
                          size="small"
                          onChange={() => toggle(col.name)}
                          onClick={(e) => e.stopPropagation()}
                          inputProps={{ 'aria-label': `Validate ${col.name}` }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {col.is_primary_key && <KeyIcon titleAccess="Primary key" sx={{ fontSize: 14, color: tokens.warning }} />}
                          <Typography component="span" sx={{ ...MONO, fontWeight: 500 }}>{col.name}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ ...MONO, fontSize: '0.75rem', color: tokens.ink2 }}>{col.data_type || '—'}</TableCell>
                      <TableCell sx={{ color: tokens.ink3 }}>{col.description || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
              {selected.size} of {columns.length} columns selected
            </Typography>
          </Box>
        )}

        {activeStep === 2 && (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              <strong>{table.display_name || table.table_id}</strong> will appear under Trusted data, validated by <strong>{user?.email}</strong> with today's date.
            </Alert>
            <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
              Columns validated: {selected.size === 0 ? 'none selected' : `${selected.size} of ${columns.length}`}
            </Typography>
            {selected.size > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {columns.filter((c) => selected.has(c.name)).map((c) => <MetaPill key={c.name} mono>{c.name}</MetaPill>)}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={isValidating}>Cancel</Button>
        <Box sx={{ flex: 1 }} />
        {activeStep > 0 && <Button onClick={() => setActiveStep((s) => s - 1)} disabled={isValidating}>Back</Button>}
        {activeStep < STEPS.length - 1 ? (
          <Button variant="contained" onClick={() => setActiveStep((s) => s + 1)}>Next</Button>
        ) : (
          <Button
            variant="contained"
            color="success"
            startIcon={isValidating ? <CircularProgress size={16} color="inherit" /> : <VerifiedIcon />}
            onClick={() => onValidate([...selected])}
            disabled={isValidating}
          >
            Mark as trusted
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
