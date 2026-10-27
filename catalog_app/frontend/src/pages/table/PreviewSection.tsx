import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Skeleton from '@mui/material/Skeleton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PreviewOutlinedIcon from '@mui/icons-material/PreviewOutlined'
import { errorDetail } from '../../api/client'
import { tablesApi } from '../../api/tables'
import type { Table as TableType } from '../../api/types'
import { CopyButton, MONO, Section, formatBytes } from '../../components/ui'
import { tokens } from '../../theme'
import { useSaveQueries } from './shared'

export const CODE_SX = {
  m: 0, p: 1.5, bgcolor: tokens.paper2, border: `1px solid ${tokens.rule}`, borderRadius: `${tokens.radius}px`,
  ...MONO, color: tokens.ink, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
} as const

// Editors only: the preview runs a BigQuery query as the catalog's service account
export default function PreviewSection({ table }: { table: TableType }) {
  const [open, setOpen] = useState(false)
  const run = useMutation({ mutationFn: () => tablesApi.previewRun(table.id) })
  const saveQueries = useSaveQueries(table)

  const { data: estimate, isLoading, error } = useQuery({
    queryKey: ['table', table.id, 'preview-estimate'],
    queryFn: () => tablesApi.previewEstimate(table.id),
    enabled: open,
    retry: false,
  })
  const alreadySaved = !!estimate && table.example_queries.some((q) => q.sql.trim() === estimate.query.trim())

  return (
    <Section title="Data preview" icon={<PreviewOutlinedIcon fontSize="small" />} defaultOpen={false} open={open} onOpenChange={setOpen}>
      {isLoading && <Skeleton variant="rounded" height={120} />}
      {error && <Alert severity="error">{errorDetail(error, 'Could not estimate the preview query.')}</Alert>}

      {estimate && (
        <Box>
          <Box sx={{ position: 'relative' }}>
            <Box component="pre" sx={{ ...CODE_SX, pr: 6 }}>{estimate.query}</Box>
            <Box sx={{ position: 'absolute', top: 4, right: 4 }}><CopyButton text={estimate.query} label="Copy SQL" /></Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="body2" color="text.secondary" sx={{ flex: '1 1 220px' }}>
              Scans about <strong>{formatBytes(estimate.estimated_bytes)}</strong>
              {estimate.estimated_cost_usd > 0 ? ` (~$${estimate.estimated_cost_usd.toFixed(4)})` : ' (under $0.0001)'} — a dry run read no data.
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<BookmarkAddOutlinedIcon />}
              disabled={alreadySaved || saveQueries.isPending}
              onClick={() => saveQueries.mutate([...table.example_queries, { title: 'Sample rows', sql: estimate.query }])}
            >
              {alreadySaved ? 'Saved as example' : 'Save as example query'}
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={run.isPending ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
              onClick={() => run.mutate()}
              disabled={run.isPending}
            >
              {run.isPending ? 'Running…' : run.data ? 'Run again' : 'Run query'}
            </Button>
          </Box>
          {run.isError && <Alert severity="error" sx={{ mt: 1.5 }}>{errorDetail(run.error, 'The query failed.')}</Alert>}
        </Box>
      )}

      {run.data && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
            {run.data.rows.length} sampled row{run.data.rows.length === 1 ? '' : 's'}
          </Typography>
          {/* Focusable so keyboard users can scroll it */}
          <Box
            tabIndex={0}
            role="region"
            aria-label="Preview results"
            sx={{ maxHeight: 420, overflow: 'auto', border: `1px solid ${tokens.rule}`, borderRadius: `${tokens.radius}px` }}
          >
            <Table size="small" stickyHeader sx={{ minWidth: 'max-content' }}>
              <TableHead>
                <TableRow>
                  {run.data.columns.map((col) => (
                    <TableCell key={col} sx={{ ...MONO, fontSize: '0.75rem', textTransform: 'none', letterSpacing: 0 }}>{col}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {run.data.rows.map((row, i) => (
                  <TableRow key={i} hover>
                    {run.data!.columns.map((col) => (
                      <TableCell key={col} sx={{ ...MONO, fontSize: '0.75rem', whiteSpace: 'nowrap', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }} title={row[col] ?? undefined}>
                        {row[col] ?? <Box component="span" sx={{ color: tokens.ruleStrong, fontStyle: 'italic' }}>null</Box>}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Box>
      )}
    </Section>
  )
}
