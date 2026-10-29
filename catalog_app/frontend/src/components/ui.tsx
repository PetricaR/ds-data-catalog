import { useId, useState, type ReactElement, type ReactNode } from 'react'
import { Link as RouterLink, type LinkProps } from 'react-router-dom'
import axios from 'axios'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CheckIcon from '@mui/icons-material/Check'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import SearchOffIcon from '@mui/icons-material/SearchOff'
import { TONES, tokens, type Tone } from '../theme'

// ── Formatting ────────────────────────────────────────────────────────────────

// Binary units, as the BigQuery console shows table sizes
export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes == null) return null
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return unit === 0 ? `${bytes} B` : `${value.toFixed(value < 10 ? 2 : 1)} ${units[unit]}`
}

export const formatNumber = (n: number) => n.toLocaleString()

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
export const compactNumber = (n: number) => (n < 10_000 ? n.toLocaleString() : compact.format(n))

export const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'

export const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

// ── Shared styles ─────────────────────────────────────────────────────────────

export const MONO = { fontFamily: tokens.fontMono, fontSize: '0.8125rem' } as const

// The full `project.dataset.table` path shown under names
export const PATH_SX = { ...MONO, color: tokens.ink3, wordBreak: 'break-all' } as const

/**
 * A card that links to one destination but may hold its own buttons (formare.dev's card pattern):
 * the heading's <CardLink> stretches its hit area over the card, other controls stay on top, and
 * an accent bar marks the hovered card.
 */
export const linkCardSx = {
  position: 'relative',
  '&::before': {
    content: '""',
    position: 'absolute',
    insetInline: 0,
    top: 0,
    height: 2,
    bgcolor: tokens.accent,
    opacity: 0,
    transition: 'opacity .15s',
  },
  '&:hover': { borderColor: tokens.ruleStrong },
  '&:hover::before, &:focus-within::before': { opacity: 1 },
  '& a.card-link': { color: 'inherit', textDecoration: 'none' },
  '& a.card-link::after': { content: '""', position: 'absolute', inset: 0, zIndex: 0 },
  '& a.card-link:focus-visible': { outline: 'none' },
  '& a.card-link:focus-visible::after': {
    outline: `2px solid ${tokens.accent}`,
    outlineOffset: -2,
    borderRadius: `${tokens.radiusLg}px`,
  },
  '& a:not(.card-link), & button': { position: 'relative', zIndex: 1 },
} as const

export function CardLink(props: LinkProps) {
  return <RouterLink {...props} className="card-link" />
}

// ── Small building blocks ─────────────────────────────────────────────────────

export function Eyebrow({ children, color = tokens.accent }: { children: ReactNode; color?: string }) {
  return (
    <Typography variant="overline" component="p" sx={{ color, display: 'block', textTransform: 'uppercase' }}>
      {children}
    </Typography>
  )
}

export function MetaPill({ icon, tone = 'neutral', mono = false, wrap = false, title, children }: {
  icon?: ReactElement
  tone?: Tone
  mono?: boolean
  /** Wrap long text inside the pill instead of overflowing a narrow container */
  wrap?: boolean
  title?: string
  children: ReactNode
}) {
  const { fg, bg, border } = TONES[tone]
  return (
    <Box
      component="span"
      title={title}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0,
        px: 0.875, py: 0.25, borderRadius: '3px', border: `1px solid ${border}`, bgcolor: bg, color: fg,
        fontSize: '0.75rem', fontWeight: 500, lineHeight: 1.4, whiteSpace: 'nowrap',
        ...(mono && { fontFamily: tokens.fontMono, fontWeight: 400 }),
        ...(wrap && { whiteSpace: 'normal', overflowWrap: 'anywhere', flexShrink: 1, minWidth: 0, maxWidth: '100%' }),
        '& svg': { fontSize: 13 },
      }}
    >
      {icon}
      {children}
    </Box>
  )
}

export function PageHeader({ eyebrow, title, subtitle, actions, children }: {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <Box component="header" sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 320px', minWidth: 0 }}>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <Typography variant="h4" component="h1" sx={{ mt: eyebrow ? 0.5 : 0, overflowWrap: 'anywhere' }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" component="div" color="text.secondary" sx={{ mt: 0.75, maxWidth: 720 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</Box>}
      </Box>
      {children}
    </Box>
  )
}

/** A bordered, collapsible page section. The heading wraps the toggle button, as a disclosure should. */
export function Section({ title, icon, count, actions, defaultOpen = true, open: openProp, onOpenChange, children }: {
  title: string
  icon?: ReactElement
  count?: ReactNode
  actions?: ReactNode
  defaultOpen?: boolean
  open?: boolean // controlled, e.g. so a "Run" action can open the section it fills
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}) {
  const [openState, setOpenState] = useState(defaultOpen)
  const open = openProp ?? openState
  const setOpen = (next: (o: boolean) => boolean) => {
    setOpenState(next)
    onOpenChange?.(next(open))
  }
  const contentId = useId()
  return (
    <Box component="section" sx={{ border: `1px solid ${tokens.rule}`, borderRadius: `${tokens.radiusLg}px`, bgcolor: tokens.surface, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 1.5, sm: 2 }, py: 1, flexWrap: 'wrap' }}>
        <Typography variant="h6" component="h2" sx={{ flex: '1 1 auto', minWidth: 0, m: 0 }}>
          <ButtonBase
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={contentId}
            sx={{
              gap: 1, py: 0.75, pr: 1, borderRadius: `${tokens.radius}px`,
              font: 'inherit', color: 'inherit', textAlign: 'left',
              '& .section-icon': { color: tokens.ink3, display: 'flex' },
            }}
          >
            {icon && <Box component="span" className="section-icon" aria-hidden>{icon}</Box>}
            <span>{title}</span>
            {count != null && (
              <Box component="span" sx={{ ...MONO, color: tokens.ink3, fontWeight: 400 }}>{count}</Box>
            )}
            <ExpandMoreIcon
              aria-hidden
              sx={{ fontSize: 20, color: tokens.ink3, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}
            />
          </ButtonBase>
        </Typography>
        {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', ml: 'auto' }}>{actions}</Box>}
      </Box>
      <Box id={contentId} hidden={!open} sx={{ borderTop: `1px solid ${tokens.rule}`, p: { xs: 1.5, sm: 2 } }}>
        {open && children}
      </Box>
    </Box>
  )
}

/** A KPI tile: label, a big proportional-figure value, and an optional meter for a ratio. */
export function StatTile({ label, value, hint, meter }: {
  label: string
  value: ReactNode
  hint?: ReactNode
  meter?: number
}) {
  return (
    <Box sx={{ border: `1px solid ${tokens.rule}`, borderRadius: `${tokens.radiusLg}px`, bgcolor: tokens.surface, px: 2.5, py: 2, height: '100%' }}>
      <Typography variant="body2" component="p" sx={{ color: tokens.ink3, fontWeight: 500 }}>{label}</Typography>
      <Typography component="p" sx={{ fontSize: '1.75rem', fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.2, mt: 0.5 }}>
        {value}
      </Typography>
      {meter != null && (
        <LinearProgress
          variant="determinate"
          value={Math.max(0, Math.min(100, meter))}
          aria-label={label}
          sx={{ mt: 1.25 }}
        />
      )}
      {hint && <Typography variant="caption" component="p" sx={{ color: tokens.ink3, mt: 0.75 }}>{hint}</Typography>}
    </Box>
  )
}

export function EmptyState({ icon, title, children, action }: {
  icon?: ReactElement
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <Box sx={{
      textAlign: 'center', py: { xs: 5, sm: 7 }, px: 3,
      border: `1px dashed ${tokens.ruleStrong}`, borderRadius: `${tokens.radiusLg}px`, bgcolor: tokens.surface,
    }}>
      {icon && <Box aria-hidden sx={{ color: tokens.ruleStrong, mb: 1.5, '& svg': { fontSize: 40 } }}>{icon}</Box>}
      <Typography variant="h6" component="p">{title}</Typography>
      {children && (
        <Typography variant="body2" color="text.secondary" component="div" sx={{ mt: 0.75, maxWidth: 460, mx: 'auto' }}>
          {children}
        </Typography>
      )}
      {action && <Box sx={{ mt: 2.5, display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>{action}</Box>}
    </Box>
  )
}

/** What a detail page shows when it can't load: restricted (403) is not the same as missing. */
export function LoadError({ error, what }: { error: unknown; what: 'dataset' | 'table' }) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  if (status === 403) {
    return (
      <EmptyState icon={<LockOutlinedIcon />} title={`This ${what} is restricted`}>
        Restricted {what}s are open to editors and admins. Ask an admin for the editor role if you need access.
      </EmptyState>
    )
  }
  return (
    <EmptyState icon={<SearchOffIcon />} title={status && status !== 404 ? `Could not load this ${what}` : `${what === 'table' ? 'Table' : 'Dataset'} not found`}>
      {status && status !== 404
        ? 'Something went wrong on the server. Try again in a moment.'
        : `It may have been deleted, or the link is wrong.`}
    </EmptyState>
  )
}

/** Copy text, also on plain-HTTP deployments where `navigator.clipboard` doesn't exist. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // permission denied — fall through to the legacy path
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (await copyText(text)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  return (
    <Tooltip title={copied ? 'Copied' : label}>
      <IconButton size="small" aria-label={label} onClick={copy}>
        {copied ? <CheckIcon sx={{ fontSize: 16, color: tokens.success }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
      </IconButton>
    </Tooltip>
  )
}

// Visually hidden but read by screen readers
export const srOnly = {
  position: 'absolute', width: 1, height: 1, p: 0, m: -1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
} as const
