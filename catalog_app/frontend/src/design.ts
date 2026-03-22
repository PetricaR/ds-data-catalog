/**
 * Shared design tokens — use these across all pages to keep colors, spacing, and
 * typography consistent throughout the app.
 */

// ── Pill badge helper ─────────────────────────────────────────────────────────
// Mini inline badges used next to table/dataset names.
// Usage:
//   <Box sx={pill('gray')}><NumbersIcon sx={pillIcon('gray')} /><Typography sx={pillText}>100</Typography></Box>

type PillVariant = 'gray' | 'blue' | 'green' | 'red' | 'purple' | 'amber'

const PILL_COLORS: Record<PillVariant, { bg: string; fg: string }> = {
  gray:   { bg: '#f1f3f4', fg: '#3c4043' },
  blue:   { bg: '#e8f0fe', fg: '#1a73e8' },
  green:  { bg: '#e6f4ea', fg: '#137333' },
  red:    { bg: '#fce8e6', fg: '#c5221f' },
  purple: { bg: '#f3e8ff', fg: '#9334e6' },
  amber:  { bg: '#fef7e0', fg: '#b06000' },
}

export function pill(variant: PillVariant = 'gray') {
  const { bg, fg } = PILL_COLORS[variant]
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 0.4,
    px: 0.9,
    py: 0.25,
    borderRadius: '6px',
    bgcolor: bg,
    color: fg,
    flexShrink: 0,
  } as const
}

export function pillIcon(variant: PillVariant = 'gray') {
  const { fg } = PILL_COLORS[variant]
  return { fontSize: 11, color: fg } as const
}

export const pillText = {
  fontSize: '0.68rem',
  fontWeight: 500,
  lineHeight: 1,
  // color is inherited from the pill() container
} as const

// ── Card / section container ───────────────────────────────────────────────────
export const CARD_OUTLINED = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 3,
  bgcolor: '#fff',
} as const

// ── Icon box (used in page headers and list items) ───────────────────────────
export const iconBox = (variant: 'blue' | 'green' | 'purple' | 'amber' | 'gray' = 'blue', size: 'sm' | 'md' = 'md') => {
  const bgMap = { blue: '#e8f0fe', green: '#e6f4ea', purple: '#f3e8ff', amber: '#fef7e0', gray: '#f1f3f4' }
  return {
    p: size === 'sm' ? 0.75 : 1.25,
    borderRadius: size === 'sm' ? 1.5 : 2.5,
    bgcolor: bgMap[variant],
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const
}

export const iconColor = {
  blue:   '#1a73e8',
  green:  '#137333',
  purple: '#9334e6',
  amber:  '#b06000',
  gray:   '#5f6368',
} as const

// ── Typography ─────────────────────────────────────────────────────────────────
export const MONO_PATH = {
  fontFamily: 'monospace',
  fontSize: '0.78rem',
  color: 'text.disabled',
} as const

// ── Chip sizes used in table/dataset cards ────────────────────────────────────
export const CHIP_SM = {
  fontSize: '0.62rem',
  height: 20,
} as const

// ── Vertical rhythm ────────────────────────────────────────────────────────────
// Standard spacing values — keep these consistent across all pages:
//   PAGE_HEADER_MB  → margin below page header (icon + title + subtitle block)
//   SECTION_MB      → margin between major page sections
//   CARD_CONTENT_SX → CardContent sx for all list-item cards
//   CARD_ROW_MB     → margin below each row inside a card (title/desc/stats)

export const PAGE_HEADER_MB = 3                                           // mb below h5 header block
export const SECTION_MB     = 4                                           // mb between major sections
export const CARD_CONTENT_SX = {
  py: 2, px: 2.5, '&:last-child': { pb: 2 },
} as const
export const CARD_ROW_MB    = 0.75                                        // mb between rows in a card
