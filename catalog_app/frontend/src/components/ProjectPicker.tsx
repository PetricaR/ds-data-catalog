import { Alert, Box, Checkbox, CircularProgress, FormControlLabel, Stack, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { useQuery } from '@tanstack/react-query'
import { bqApi, type ProjectInfo } from '../api/bq'
import { errorDetail } from '../api/client'
import { tokens } from '../theme'
import { MONO, MetaPill } from './ui'

// Lists the GCP projects the signed-in admin can see; projects already added as sources are shown but not selectable.
export default function ProjectPicker({ enabled = true, selected, onChange }: {
  enabled?: boolean
  selected: ProjectInfo[]
  onChange: (selected: ProjectInfo[]) => void
}) {
  const { data: projects = [], isLoading, error } = useQuery({
    queryKey: ['gcp-projects'],
    queryFn: bqApi.listAccessibleProjects,
    enabled,
    staleTime: 60_000,
  })

  const isSelected = (pid: string) => selected.some((p) => p.project_id === pid)
  const toggle = (project: ProjectInfo) =>
    onChange(isSelected(project.project_id)
      ? selected.filter((p) => p.project_id !== project.project_id)
      : [...selected, project])

  const available = projects.filter((p) => !p.already_added)

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress aria-label="Loading projects" />
      </Box>
    )
  }
  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 1 }}>
        {errorDetail(error, 'Could not load your GCP projects.')}
      </Alert>
    )
  }

  return (
    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
      {projects.filter((p) => p.already_added).map((p) => (
        <Box key={p.project_id} sx={{
          display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1,
          borderRadius: `${tokens.radius}px`, bgcolor: tokens.paper2,
        }}>
          <CheckCircleIcon fontSize="small" sx={{ color: tokens.success }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600}>{p.display_name}</Typography>
            <Typography variant="caption" color="text.secondary" sx={MONO}>{p.project_id}</Typography>
          </Box>
          <MetaPill tone="success">Added</MetaPill>
        </Box>
      ))}
      {projects.length === 0 && (
        <Box sx={{ py: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">Your Google account can't see any GCP projects.</Typography>
        </Box>
      )}
      {available.length === 0 && projects.length > 0 && (
        <Box sx={{ py: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">All accessible projects are already added.</Typography>
        </Box>
      )}
      {available.map((p) => (
        <FormControlLabel
          key={p.project_id}
          control={<Checkbox size="small" checked={isSelected(p.project_id)} onChange={() => toggle(p)} />}
          label={
            <Box>
              <Typography variant="body2" fontWeight={500}>{p.display_name}</Typography>
              <Typography variant="caption" color="text.secondary" sx={MONO}>{p.project_id}</Typography>
            </Box>
          }
          sx={{ mx: 0, px: 1, py: 0.5, borderRadius: `${tokens.radius}px`, '&:hover': { bgcolor: 'action.hover' }, width: '100%' }}
        />
      ))}
    </Stack>
  )
}
