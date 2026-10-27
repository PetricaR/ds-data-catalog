import { useMutation } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined'
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined'
import type { ReactElement } from 'react'
import { errorDetail } from '../../api/client'
import { tablesApi } from '../../api/tables'
import type { Table } from '../../api/types'
import { Section, formatDate } from '../../components/ui'
import { tokens } from '../../theme'
import { useTableRefresh } from './shared'

function InsightList({ icon, title, items }: { icon: ReactElement; title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <Box>
      <Typography variant="subtitle2" component="h3" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1, '& svg': { fontSize: 18, color: tokens.accent } }}>
        {icon}{title}
      </Typography>
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {items.map((item, i) => (
          <Box component="li" key={i} sx={{ px: 1.5, py: 1, bgcolor: tokens.paper, border: `1px solid ${tokens.rule}`, borderRadius: `${tokens.radius}px` }}>
            <Typography variant="body2" sx={{ color: tokens.ink2 }}>{item}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export default function InsightsSection({ table, editor }: { table: Table; editor: boolean }) {
  const { refetch } = useTableRefresh(table)
  const generate = useMutation({ mutationFn: () => tablesApi.generateInsights(table.id), onSuccess: refetch, onError: () => {} })
  const insights = table.insights

  return (
    <Section
      title="AI insights"
      icon={<AutoAwesomeOutlinedIcon fontSize="small" />}
      count={table.insights_generated_at ? `generated ${formatDate(table.insights_generated_at)}` : undefined}
      actions={editor && (
        <Button
          size="small"
          variant={insights ? 'outlined' : 'contained'}
          startIcon={generate.isPending ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeOutlinedIcon />}
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
        >
          {generate.isPending ? 'Generating…' : insights ? 'Regenerate' : 'Generate insights'}
        </Button>
      )}
    >
      {generate.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>{errorDetail(generate.error, 'Could not generate insights. Check the Gemini or Vertex AI configuration.')}</Alert>
      )}
      {!insights ? (
        <Typography variant="body2" color="text.secondary">
          No insights yet. {editor
            ? 'Generate them to get analysis questions, observations and data-science use cases from the table and column descriptions and profile.'
            : 'An editor can generate them from the table and column descriptions and profile.'}
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2.5 }}>
          <InsightList icon={<HelpOutlineIcon />} title="Questions to ask" items={insights.questions ?? []} />
          <InsightList icon={<LightbulbOutlinedIcon />} title="Observations" items={insights.observations ?? []} />
          <InsightList icon={<ScienceOutlinedIcon />} title="DS / ML use cases" items={insights.use_cases ?? []} />
        </Box>
      )}
    </Section>
  )
}
