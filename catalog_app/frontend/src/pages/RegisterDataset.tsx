import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import InputAdornment from '@mui/material/InputAdornment'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Link from '@mui/material/Link'
import AddIcon from '@mui/icons-material/Add'
import { datasetsApi } from '../api/datasets'
import type { DatasetCreate, SensitivityLabel } from '../api/types'

const SENSITIVITY_OPTIONS: SensitivityLabel[] = ['public', 'internal', 'confidential', 'restricted']

export default function RegisterDataset() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState<DatasetCreate>({
    project_id: '',
    dataset_id: '',
    display_name: '',
    description: '',
    owner: '',
    data_steward: '',
    tags: [],
    sensitivity_label: 'internal',
    bq_location: '',
  })
  const [tagInput, setTagInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: datasetsApi.create,
    onSuccess: (ds) => {
      qc.invalidateQueries({ queryKey: ['datasets'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      navigate(`/datasets/${ds.id}`)
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail ?? 'Failed to register dataset.')
    },
  })

  const set = (field: keyof DatasetCreate) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const addTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (t && !form.tags?.includes(t)) {
      setForm((f) => ({ ...f, tags: [...(f.tags ?? []), t] }))
    }
    setTagInput('')
  }

  const removeTag = (tag: string) =>
    setForm((f) => ({ ...f, tags: (f.tags ?? []).filter((t) => t !== tag) }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const payload: DatasetCreate = {
      ...form,
      display_name: form.display_name || undefined,
      description: form.description || undefined,
      owner: form.owner || undefined,
      data_steward: form.data_steward || undefined,
      bq_location: form.bq_location || undefined,
    }
    mutation.mutate(payload)
  }

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => navigate('/browse')}>
          Catalog
        </Link>
        <Typography color="text.primary">Register Dataset</Typography>
      </Breadcrumbs>

      <Typography variant="h5" fontWeight={700} gutterBottom>Register a BigQuery Dataset</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Add a BigQuery dataset to the catalog so your team can discover and understand it.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Card>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Required */}
            <Typography variant="subtitle2" fontWeight={600} color="text.secondary">BigQuery Reference *</Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="GCP Project ID"
                required
                fullWidth
                value={form.project_id}
                onChange={set('project_id')}
                placeholder="my-gcp-project"
              />
              <TextField
                label="Dataset ID"
                required
                fullWidth
                value={form.dataset_id}
                onChange={set('dataset_id')}
                placeholder="analytics_raw"
              />
            </Box>

            {/* Descriptive */}
            <Typography variant="subtitle2" fontWeight={600} color="text.secondary" sx={{ mt: 1 }}>Details</Typography>
            <TextField
              label="Display Name"
              fullWidth
              value={form.display_name}
              onChange={set('display_name')}
              placeholder="Analytics Raw Data"
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={3}
              value={form.description}
              onChange={set('description')}
              placeholder="What is this dataset for? What data does it contain?"
            />

            {/* Ownership */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Owner"
                fullWidth
                value={form.owner}
                onChange={set('owner')}
                placeholder="team@company.com"
                InputProps={{ startAdornment: <InputAdornment position="start">@</InputAdornment> }}
              />
              <TextField
                label="Data Steward"
                fullWidth
                value={form.data_steward}
                onChange={set('data_steward')}
                placeholder="steward@company.com"
              />
            </Box>

            {/* Classification */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                select
                label="Sensitivity Label"
                value={form.sensitivity_label}
                onChange={set('sensitivity_label')}
                sx={{ minWidth: 200 }}
              >
                {SENSITIVITY_OPTIONS.map((opt) => (
                  <MenuItem key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="BQ Location"
                value={form.bq_location}
                onChange={set('bq_location')}
                placeholder="EU, US, europe-west1…"
              />
            </Box>

            {/* Tags */}
            <Box>
              <TextField
                label="Add Tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder="Type tag and press Enter"
                size="small"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Button size="small" onClick={addTag} startIcon={<AddIcon />}>Add</Button>
                    </InputAdornment>
                  ),
                }}
              />
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                {form.tags?.map((t) => (
                  <Chip key={t} label={t} size="small" onDelete={() => removeTag(t)} />
                ))}
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, pt: 1 }}>
              <Button
                type="submit"
                variant="contained"
                disabled={mutation.isPending || !form.project_id || !form.dataset_id}
              >
                {mutation.isPending ? 'Registering…' : 'Register Dataset'}
              </Button>
              <Button variant="outlined" onClick={() => navigate(-1)}>Cancel</Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
