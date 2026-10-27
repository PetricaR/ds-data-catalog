import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditNoteIcon from '@mui/icons-material/EditNote'
import FolderSpecialOutlinedIcon from '@mui/icons-material/FolderSpecialOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import type { ProjectUsage } from '../api/types'
import { tokens } from '../theme'
import { MetaPill, Section } from './ui'

const emptyProject = (): ProjectUsage => ({ project_name: '', jira_id: '', repo_url: '' })

// Only http(s) links are rendered as links, so a stored `javascript:` URL can't run
const safeUrl = (url: string) => /^https?:\/\//i.test(url.trim())

/** "Used in DS projects": the data-science projects that use a dataset or table, editable by editors. */
export default function ProjectsEditor({ projects, what, canEdit, saving, onSave }: {
  projects: ProjectUsage[]
  what: 'dataset' | 'table'
  canEdit: boolean
  saving: boolean
  onSave: (projects: ProjectUsage[]) => Promise<unknown>
}) {
  const [draft, setDraft] = useState<ProjectUsage[] | null>(null)
  const set = (i: number, patch: Partial<ProjectUsage>) =>
    setDraft((d) => d && d.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))

  const startEdit = () => setDraft(projects.length ? projects.map((p) => ({ ...p })) : [emptyProject()])
  const save = () => {
    if (!draft) return
    onSave(draft.filter((p) => p.project_name.trim())).then(() => setDraft(null)).catch(() => {})
  }

  return (
    <Section
      title="Used in DS projects"
      icon={<FolderSpecialOutlinedIcon fontSize="small" />}
      count={projects.length}
      actions={canEdit && !draft && (
        <Button size="small" variant="outlined" startIcon={<EditNoteIcon />} onClick={startEdit}>Edit</Button>
      )}
    >
      {draft ? (
        <Box>
          {draft.map((p, i) => (
            <Box key={i} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.2fr 0.8fr 1.4fr auto' }, gap: 1, mb: 1.5, alignItems: 'start' }}>
              <TextField size="small" label="Project name" required value={p.project_name} onChange={(e) => set(i, { project_name: e.target.value })} />
              <TextField size="small" label="Jira ID" placeholder="IIB-1234" value={p.jira_id ?? ''} onChange={(e) => set(i, { jira_id: e.target.value })} />
              <TextField size="small" label="Repo URL" type="url" placeholder="https://github.com/org/repo" value={p.repo_url ?? ''} onChange={(e) => set(i, { repo_url: e.target.value })} />
              <IconButton aria-label={`Remove ${p.project_name || 'project'}`} onClick={() => setDraft((d) => d && d.filter((_, idx) => idx !== i))} sx={{ mt: 0.25 }}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setDraft((d) => [...(d ?? []), emptyProject()])}>Add project</Button>
            <Box sx={{ flex: 1 }} />
            <Button size="small" onClick={() => setDraft(null)}>Cancel</Button>
            <Button size="small" variant="contained" disabled={saving || draft.some((p) => !p.project_name.trim())} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </Box>
        </Box>
      ) : projects.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No data-science projects are linked to this {what} yet.{canEdit && ' Select Edit to add the projects that use it.'}
        </Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {projects.map((p, i) => (
            <Box component="li" key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', py: 0.5 }}>
              <FolderSpecialOutlinedIcon aria-hidden sx={{ fontSize: 18, color: tokens.accent }} />
              <Typography variant="body2" fontWeight={600}>{p.project_name}</Typography>
              {p.jira_id && <MetaPill mono tone="accent">{p.jira_id}</MetaPill>}
              {p.repo_url && safeUrl(p.repo_url) && (
                <Link href={p.repo_url} target="_blank" rel="noopener noreferrer" variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  Repository <OpenInNewIcon sx={{ fontSize: 14 }} aria-label="(opens in a new tab)" />
                </Link>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Section>
  )
}
