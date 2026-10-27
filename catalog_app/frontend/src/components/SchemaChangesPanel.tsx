import { Link as RouterLink } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CheckIcon from '@mui/icons-material/Check'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { schemaChangesApi, type SchemaChange } from '../api/schemaChanges'
import { tokens } from '../theme'
import { MONO, MetaPill, formatDateTime } from './ui'

/** Columns added or removed since the last sync, for editors to acknowledge. */
export default function SchemaChangesPanel({ changes, canAck, tableId, limit = 8 }: {
  changes: SchemaChange[]
  canAck: boolean
  tableId?: string // scope "Acknowledge all" to one table and hide the table path
  limit?: number
}) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['schema-changes'] })
  const ack = useMutation({ mutationFn: schemaChangesApi.acknowledge, onSuccess: invalidate })
  const ackAll = useMutation({ mutationFn: () => schemaChangesApi.acknowledgeAll(tableId), onSuccess: invalidate })

  if (changes.length === 0) return null
  const shown = changes.slice(0, limit)

  return (
    <Box component="section" aria-label="Schema changes" sx={{ mb: 3, border: `1px solid ${tokens.warningRule}`, borderRadius: `${tokens.radiusLg}px`, bgcolor: tokens.surface, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.25, bgcolor: tokens.warningWash, borderBottom: `1px solid ${tokens.warningRule}`, flexWrap: 'wrap' }}>
        <WarningAmberIcon aria-hidden sx={{ color: tokens.warning, fontSize: 20 }} />
        <Typography variant="subtitle2" component="h2" sx={{ flex: 1, minWidth: 180 }}>
          {changes.length} schema change{changes.length === 1 ? '' : 's'} since the last sync
        </Typography>
        {canAck && (
          <Button size="small" startIcon={<DoneAllIcon />} onClick={() => ackAll.mutate()} disabled={ackAll.isPending} sx={{ color: tokens.ink, ml: 'auto' }}>
            Acknowledge all
          </Button>
        )}
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {shown.map((c) => {
          const added = c.change_type === 'column_added'
          return (
            <Box
              component="li"
              key={c.id}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, borderBottom: `1px solid ${tokens.rule}`, '&:last-child': { borderBottom: 'none' } }}
            >
              <Box sx={{ width: 72, flexShrink: 0 }}><MetaPill tone={added ? 'success' : 'danger'}>{added ? 'Added' : 'Removed'}</MetaPill></Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  Column <Box component="code" sx={{ ...MONO, fontWeight: 500 }}>{c.column_name}</Box>
                  {!tableId && (
                    <>
                      {' in '}
                      <Link component={RouterLink} to={`/datasets/${c.dataset_uuid}/tables/${c.table_id}`} sx={{ ...MONO }}>
                        {c.project_id}.{c.dataset_id_str}.{c.table_table_id}
                      </Link>
                    </>
                  )}
                </Typography>
                <Typography variant="caption" color="text.secondary">{formatDateTime(c.detected_at)}</Typography>
              </Box>
              {canAck && (
                <Tooltip title="Acknowledge">
                  <span>
                    <IconButton size="small" aria-label={`Acknowledge ${c.column_name}`} onClick={() => ack.mutate(c.id)} disabled={ack.isPending}>
                      <CheckIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
            </Box>
          )
        })}
      </Box>
      {changes.length > shown.length && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ px: 2, py: 1, borderTop: `1px solid ${tokens.rule}`, bgcolor: tokens.paper }}>
          and {changes.length - shown.length} more{canAck ? ' — acknowledge all to clear them' : ''}
        </Typography>
      )}
    </Box>
  )
}
