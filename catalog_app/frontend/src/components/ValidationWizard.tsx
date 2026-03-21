import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Alert from '@mui/material/Alert'
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
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import KeyIcon from '@mui/icons-material/Key'
import VerifiedIcon from '@mui/icons-material/Verified'
import SensitivityChip from './SensitivityChip'
import type { Table as TableType, SensitivityLabel } from '../api/types'

function bytes(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`
  return `${n} B`
}

const STEPS = ['Review Stats', 'Select Columns', 'Validator Info', 'Confirm']

interface Props {
  open: boolean
  onClose: () => void
  table: TableType
  onValidate: (validatedBy: string, validatedColumns: string[]) => void
  isValidating: boolean
}

export default function ValidationWizard({ open, onClose, table, onValidate, isValidating }: Props) {
  const [activeStep, setActiveStep] = useState(0)
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set())
  const [validatedBy, setValidatedBy] = useState('')

  const allSelected = selectedColumns.size === table.columns.length
  const noneSelected = selectedColumns.size === 0

  const toggleColumn = (name: string) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) {
      setSelectedColumns(new Set())
    } else {
      setSelectedColumns(new Set(table.columns.map((c) => c.name)))
    }
  }

  const handleClose = () => {
    setActiveStep(0)
    setSelectedColumns(new Set())
    setValidatedBy('')
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1, fontWeight: 700 }}>Mark as Trusted Source</DialogTitle>

      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {STEPS.map((label) => (
            <Step key={label}><StepLabel>{label}</StepLabel></Step>
          ))}
        </Stepper>

        {/* Step 0 — Review Stats */}
        {activeStep === 0 && (
          <Box>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              {table.display_name || table.table_id}
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary', mb: 2 }}>
              {table.dataset_project_id}.{table.dataset_id}.{table.table_id}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <SensitivityChip label={table.sensitivity_label as SensitivityLabel} />
              {table.row_count != null && (
                <Chip label={`${table.row_count.toLocaleString()} rows`} size="small" variant="outlined" />
              )}
              {table.size_bytes != null && (
                <Chip label={bytes(table.size_bytes)} size="small" variant="outlined" />
              )}
              <Chip label={`${table.columns.length} columns`} size="small" variant="outlined" />
              {table.tags.map((t) => <Chip key={t} label={t} size="small" />)}
            </Box>
            {table.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {table.description}
              </Typography>
            )}
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              {table.owner && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Owner</Typography>
                  <Typography variant="body2">{table.owner}</Typography>
                </Box>
              )}
              <Box>
                <Typography variant="caption" color="text.secondary">Last updated</Typography>
                <Typography variant="body2">{new Date(table.updated_at).toLocaleDateString()}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Registered</Typography>
                <Typography variant="body2">{new Date(table.created_at).toLocaleDateString()}</Typography>
              </Box>
            </Box>
          </Box>
        )}

        {/* Step 1 — Select Columns */}
        {activeStep === 1 && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography variant="body2" color="text.secondary">
                Select the columns you have reviewed and are validating.
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={allSelected}
                    indeterminate={!noneSelected && !allSelected}
                    onChange={toggleAll}
                    size="small"
                  />
                }
                label={<Typography variant="body2">{allSelected ? 'Deselect all' : 'Select all'}</Typography>}
                sx={{ mr: 0 }}
              />
            </Box>

            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 380 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>#</TableCell>
                    <TableCell>Column</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Description</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {table.columns.map((col) => (
                    <TableRow
                      key={col.id}
                      hover
                      selected={selectedColumns.has(col.name)}
                      onClick={() => toggleColumn(col.name)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedColumns.has(col.name)}
                          size="small"
                          onChange={() => toggleColumn(col.name)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', width: 40 }}>{col.position + 1}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {col.is_primary_key && <KeyIcon sx={{ fontSize: 13, color: '#e37400' }} />}
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: col.is_primary_key ? 600 : 400 }}>
                            {col.name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={col.data_type || '—'} size="small"
                          sx={{ fontSize: '0.65rem', height: 18, fontFamily: 'monospace', bgcolor: '#f1f3f4' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {col.description || '—'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {selectedColumns.size > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {selectedColumns.size} of {table.columns.length} columns selected
              </Typography>
            )}
          </Box>
        )}

        {/* Step 2 — Validator Info */}
        {activeStep === 2 && (
          <Box sx={{ py: 2 }}>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Enter your name to record who validated this table as a trusted source.
            </Typography>
            <TextField
              fullWidth
              label="Validated by"
              value={validatedBy}
              onChange={(e) => setValidatedBy(e.target.value)}
              placeholder="e.g. Jane Smith"
              helperText="This will be permanently recorded alongside the validation timestamp."
              autoFocus
            />
          </Box>
        )}

        {/* Step 3 — Confirm */}
        {activeStep === 3 && (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              You are about to mark <strong>{table.display_name || table.table_id}</strong> as a trusted source.
            </Alert>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Validated by</Typography>
                    <Typography variant="body2" fontWeight={600}>{validatedBy || 'anonymous'}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Columns validated</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {selectedColumns.size === 0 ? 'None selected' : `${selectedColumns.size} / ${table.columns.length}`}
                    </Typography>
                  </Box>
                  {selectedColumns.size > 0 && (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {[...selectedColumns].map((name) => (
                        <Chip key={name} label={name} size="small" sx={{ fontFamily: 'monospace', fontSize: '0.7rem', height: 20 }} />
                      ))}
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} color="inherit">Cancel</Button>
        <Box sx={{ flex: 1 }} />
        {activeStep > 0 && (
          <Button onClick={() => setActiveStep((s) => s - 1)}>Back</Button>
        )}
        {activeStep < STEPS.length - 1 ? (
          <Button variant="contained" onClick={() => setActiveStep((s) => s + 1)}>
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            color="success"
            startIcon={isValidating ? <CircularProgress size={16} color="inherit" /> : <VerifiedIcon />}
            onClick={() => { onValidate(validatedBy || 'anonymous', [...selectedColumns]); handleClose() }}
            disabled={isValidating}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Mark as Trusted Source
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
