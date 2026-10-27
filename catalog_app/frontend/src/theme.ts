import { alpha, createTheme, type Shadows } from '@mui/material/styles'

/**
 * Design tokens from the Formare AI brand (formare.dev), converted from its OKLCH palette.
 * Pages use these (or the theme palette built from them) instead of literal colors.
 */
export const tokens = {
  paper: '#f8fafd',      // page background
  paper2: '#eff3f8',     // subtle fills: table heads, code, hover
  surface: '#ffffff',    // cards, inputs, menus
  ink: '#0f1828',        // headings and body text
  ink2: '#3a4353',       // secondary text
  ink3: '#5a6475',       // muted text, labels (5.9:1 on white)
  rule: '#d9dfe6',       // hairlines between content
  ruleStrong: '#86909f', // form-control borders (3.2:1 on white)
  accent: '#1957d2',
  accentHover: '#0643b5',
  accentWash: '#e5f1ff',
  accentRule: '#accdf8',
  success: '#106c3e',
  successWash: '#e0f9e8',
  successRule: '#9bd4ae',
  warning: '#945500',
  warningWash: '#fff2d2',
  warningRule: '#e3b667',
  danger: '#b32322',
  dangerWash: '#ffedea',
  dangerRule: '#efbcb6',
  // The navy "inverse" palette of formare.dev's header
  inverse: {
    paper: '#070f1f',
    surface: '#141e31',
    ink: '#f3f5f8',
    ink2: '#c4cbd4',
    ink3: '#9da5b1',
    rule: '#293345',
    ruleStrong: '#5c6981',
    accent: '#71bfff',
    gridLine: 'rgba(255,255,255,0.055)',
  },
  fontSans: '"IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  fontMono: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  radius: 4,
  radiusLg: 8,
} as const

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

export const TONES: Record<Tone, { fg: string; bg: string; border: string }> = {
  neutral: { fg: tokens.ink2, bg: tokens.paper, border: tokens.rule },
  accent: { fg: tokens.accent, bg: tokens.accentWash, border: tokens.accentRule },
  success: { fg: tokens.success, bg: tokens.successWash, border: tokens.successRule },
  warning: { fg: tokens.warning, bg: tokens.warningWash, border: tokens.warningRule },
  danger: { fg: tokens.danger, bg: tokens.dangerWash, border: tokens.dangerRule },
}

const popoverShadow = `0 12px 32px -8px ${alpha(tokens.ink, 0.22)}, 0 2px 6px -2px ${alpha(tokens.ink, 0.12)}`
const shadows = Array(25).fill(popoverShadow) as Shadows
shadows[0] = 'none'
shadows[1] = `0 1px 2px ${alpha(tokens.ink, 0.06)}`

const focusRing = { outline: `2px solid ${tokens.accent}`, outlineOffset: 2 }

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: tokens.accent, dark: tokens.accentHover, light: tokens.accentWash, contrastText: '#ffffff' },
    secondary: { main: tokens.ink, contrastText: '#ffffff' },
    error: { main: tokens.danger },
    warning: { main: tokens.warning },
    info: { main: tokens.accent },
    success: { main: tokens.success },
    background: { default: tokens.paper, paper: tokens.surface },
    text: { primary: tokens.ink, secondary: tokens.ink3, disabled: tokens.ruleStrong },
    divider: tokens.rule,
    action: {
      hover: alpha(tokens.ink, 0.04),
      selected: tokens.accentWash,
      focus: alpha(tokens.accent, 0.12),
    },
  },
  shape: { borderRadius: tokens.radius },
  shadows,
  typography: {
    fontFamily: tokens.fontSans,
    h1: { fontWeight: 600, letterSpacing: '-0.025em' },
    h2: { fontWeight: 600, letterSpacing: '-0.025em' },
    h3: { fontWeight: 600, letterSpacing: '-0.025em' },
    h4: { fontSize: '1.75rem', fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.15 },
    h5: { fontSize: '1.375rem', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.25 },
    h6: { fontSize: '1.0625rem', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.35 },
    subtitle1: { fontWeight: 600, lineHeight: 1.4 },
    subtitle2: { fontWeight: 600, lineHeight: 1.4 },
    body1: { lineHeight: 1.6 },
    body2: { lineHeight: 1.55 },
    caption: { fontSize: '0.8125rem', lineHeight: 1.5 },
    overline: { fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.09em', lineHeight: 1.4 },
    button: { textTransform: 'none', fontWeight: 500, letterSpacing: 0 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': { colorScheme: 'light' },
        html: { scrollbarColor: `${tokens.ruleStrong} ${tokens.paper}` },
        // Keeps text the same size while IBM Plex loads over the fallback font
        body: { fontSizeAdjust: 'from-font' },
        '::selection': { background: tokens.accent, color: '#ffffff' },
        ':where(a, summary, [tabindex]):focus-visible': focusRing,
        'code, kbd, pre, samp': { fontFamily: tokens.fontMono },
        code: { fontSize: '0.92em' },
      },
    },
    MuiButtonBase: {
      // Flat, ripple-free controls; the focus ring below replaces the ripple as the focus cue
      defaultProps: { disableRipple: true },
      styleOverrides: { root: { '&.Mui-focusVisible': focusRing } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: tokens.radius,
          padding: '7px 16px',
          fontSize: '0.875rem',
          lineHeight: 1.45,
          whiteSpace: 'nowrap',
          transition: 'background-color .15s, color .15s, border-color .15s',
        },
        sizeSmall: { padding: '4px 12px', fontSize: '0.8125rem' },
        sizeLarge: { padding: '11px 22px', fontSize: '1rem' },
        containedPrimary: { '&:hover': { backgroundColor: tokens.accentHover } },
        // Formare's outline button: ink text on a strong rule, darkening on hover
        outlinedPrimary: {
          color: tokens.ink,
          borderColor: tokens.ruleStrong,
          '&:hover': { borderColor: tokens.ink, backgroundColor: alpha(tokens.ink, 0.06) },
        },
        textPrimary: { '&:hover': { backgroundColor: tokens.accentWash } },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: tokens.radius, '&:hover': { backgroundColor: alpha(tokens.ink, 0.06) } },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: `1px solid ${tokens.rule}`,
          borderRadius: tokens.radiusLg,
          backgroundColor: tokens.surface,
          transition: 'border-color .15s',
        },
      },
    },
    MuiCardContent: {
      styleOverrides: { root: { padding: '16px 20px', '&:last-child': { paddingBottom: 16 } } },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        rounded: { borderRadius: tokens.radiusLg },
        outlined: { borderColor: tokens.rule },
      },
    },
    MuiMenu: {
      styleOverrides: { paper: { border: `1px solid ${tokens.rule}` } },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 3, fontWeight: 500, fontSize: '0.75rem' },
        sizeSmall: { height: 22 },
        outlined: { borderColor: tokens.rule },
        filled: { '&.MuiChip-colorDefault': { backgroundColor: tokens.paper2, color: tokens.ink2 } },
      },
    },
    MuiTextField: { defaultProps: { variant: 'outlined' } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius,
          backgroundColor: tokens.surface,
          '&:hover:not(.Mui-disabled, .Mui-error) .MuiOutlinedInput-notchedOutline': { borderColor: tokens.ink },
        },
        notchedOutline: { borderColor: tokens.ruleStrong },
      },
    },
    MuiDrawer: {
      styleOverrides: { paper: { border: 'none', backgroundColor: tokens.surface } },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          backgroundColor: tokens.paper2,
          color: tokens.ink3,
          fontSize: '0.75rem',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          borderBottom: `1px solid ${tokens.rule}`,
          whiteSpace: 'nowrap',
        },
        body: { fontSize: '0.875rem', borderBottom: `1px solid ${tokens.rule}` },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.MuiTableRow-hover:hover': { backgroundColor: tokens.paper },
          '&:last-child td': { borderBottom: 0 },
        },
      },
    },
    MuiDivider: { styleOverrides: { root: { borderColor: tokens.rule } } },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius,
          '&.Mui-selected': { backgroundColor: tokens.accentWash, '&:hover': { backgroundColor: tokens.accentWash } },
        },
      },
    },
    MuiAccordion: {
      defaultProps: { disableGutters: true, elevation: 0 },
      styleOverrides: {
        root: {
          border: `1px solid ${tokens.rule}`,
          borderRadius: `${tokens.radiusLg}px !important`,
          overflow: 'hidden',
          '&:before': { display: 'none' },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: tokens.ink, fontSize: '0.75rem', fontWeight: 500, borderRadius: tokens.radius, padding: '6px 10px' },
        arrow: { color: tokens.ink },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: tokens.radiusLg, border: '1px solid', alignItems: 'flex-start' },
        standardInfo: { backgroundColor: tokens.accentWash, borderColor: tokens.accentRule, color: tokens.ink, '& .MuiAlert-icon': { color: tokens.accent } },
        standardWarning: { backgroundColor: tokens.warningWash, borderColor: tokens.warningRule, color: tokens.ink, '& .MuiAlert-icon': { color: tokens.warning } },
        standardSuccess: { backgroundColor: tokens.successWash, borderColor: tokens.successRule, color: tokens.ink, '& .MuiAlert-icon': { color: tokens.success } },
        standardError: { backgroundColor: tokens.dangerWash, borderColor: tokens.dangerRule, color: tokens.ink, '& .MuiAlert-icon': { color: tokens.danger } },
        filled: { borderColor: 'transparent' },
      },
    },
    MuiSkeleton: {
      styleOverrides: { root: { backgroundColor: alpha(tokens.ink, 0.06) }, rounded: { borderRadius: tokens.radiusLg } },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          borderColor: tokens.ruleStrong,
          color: tokens.ink2,
          padding: '5px 12px',
          '&.Mui-selected': {
            backgroundColor: tokens.ink,
            color: '#ffffff',
            '&:hover': { backgroundColor: tokens.ink2 },
          },
        },
      },
    },
    MuiBreadcrumbs: {
      styleOverrides: {
        root: { fontSize: '0.8125rem' },
        separator: { color: tokens.ruleStrong },
        ol: { flexWrap: 'wrap' },
      },
    },
    MuiLink: { defaultProps: { underline: 'hover' } },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: tokens.radiusLg, border: `1px solid ${tokens.rule}` } },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontSize: '1.125rem', fontWeight: 600, letterSpacing: '-0.01em' } },
    },
    MuiBadge: {
      styleOverrides: { badge: { fontSize: '0.6875rem', fontWeight: 600, minWidth: 18, height: 18 } },
    },
    MuiAvatar: {
      styleOverrides: { colorDefault: { backgroundColor: tokens.accent, color: '#ffffff', fontWeight: 600 } },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 6, borderRadius: 3, backgroundColor: tokens.accentWash },
        bar: { borderRadius: 3 },
      },
    },
    MuiStepIcon: {
      styleOverrides: { root: { color: tokens.ruleStrong } },
    },
    MuiSnackbarContent: { styleOverrides: { root: { borderRadius: tokens.radiusLg } } },
  },
})

export default theme
