import { createTheme } from '@mui/material/styles'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1a73e8',
      light: '#4a90e2',
      dark: '#1557b0',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#137333',
      light: '#34a853',
      dark: '#0d5225',
      contrastText: '#ffffff',
    },
    error: { main: '#d93025' },
    warning: { main: '#e37400' },
    info: { main: '#1a73e8' },
    success: { main: '#137333' },
    background: {
      default: '#f0f4f9',
      paper: '#ffffff',
    },
    text: {
      primary: '#1f1f1f',
      secondary: '#5f6368',
    },
    divider: '#e8eaed',
  },
  typography: {
    fontFamily: '"Google Sans", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700, letterSpacing: '-0.5px' },
    h2: { fontWeight: 700, letterSpacing: '-0.25px' },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 500, letterSpacing: '0.01em' },
    caption: { letterSpacing: '0.01em' },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 24, padding: '8px 20px', fontSize: '0.875rem' },
        sizeSmall: { padding: '5px 14px', fontSize: '0.8125rem' },
        sizeLarge: { padding: '11px 28px', fontSize: '0.9375rem' },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: '0 1px 3px rgba(60,64,67,.3), 0 4px 8px rgba(60,64,67,.15)' },
          '&:active': { boxShadow: 'none' },
        },
        outlined: {
          borderColor: '#dadce0',
          '&:hover': { backgroundColor: 'rgba(26,115,232,0.04)', borderColor: '#1a73e8' },
        },
        text: { '&:hover': { backgroundColor: 'rgba(26,115,232,0.06)' } },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 2px 0 rgba(60,64,67,.08), 0 2px 6px 2px rgba(60,64,67,.06)',
          border: '1px solid rgba(0,0,0,0.05)',
          borderRadius: 12,
          '&:hover': { boxShadow: '0 2px 6px 0 rgba(60,64,67,.15), 0 4px 12px 3px rgba(60,64,67,.1)' },
          transition: 'box-shadow 0.15s cubic-bezier(0.2,0,0,1)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        elevation1: { boxShadow: '0 1px 2px 0 rgba(60,64,67,.08), 0 2px 6px 2px rgba(60,64,67,.06)' },
        elevation2: { boxShadow: '0 2px 6px 0 rgba(60,64,67,.15), 0 4px 12px 3px rgba(60,64,67,.1)' },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 500 },
        sizeSmall: { fontSize: '0.75rem', height: 22 },
      },
    },
    MuiTextField: { defaultProps: { variant: 'outlined' } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: '#ffffff',
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#1a73e8' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1a73e8', borderWidth: 2 },
        },
        notchedOutline: { borderColor: '#dadce0' },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
          borderBottom: '1px solid #e8eaed',
          backgroundColor: '#ffffff',
          color: '#202124',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { border: 'none', backgroundColor: '#f8f9fa' },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          backgroundColor: '#f8f9fa',
          color: '#5f6368',
          fontSize: '0.8125rem',
          letterSpacing: '0.02em',
          borderBottom: '2px solid #e8eaed',
        },
        body: { fontSize: '0.875rem', borderBottom: '1px solid #f0f4f9' },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: '#f8faff' },
          '&:last-child td': { borderBottom: 0 },
        },
      },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: '#e8eaed' } },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '&.Mui-selected': {
            backgroundColor: '#e8f0fe',
            '&:hover': { backgroundColor: '#d2e3fc' },
          },
          '&:hover': { backgroundColor: 'rgba(0,0,0,0.04)' },
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          '&:before': { display: 'none' },
          borderRadius: '12px !important',
          boxShadow: '0 1px 2px 0 rgba(60,64,67,.08), 0 2px 6px 2px rgba(60,64,67,.06)',
          border: '1px solid rgba(0,0,0,0.05)',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: '#202124', fontSize: '0.75rem', borderRadius: 6, padding: '6px 10px' },
        arrow: { color: '#202124' },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 10 },
        standardInfo: { backgroundColor: '#e8f0fe', color: '#1557b0', '& .MuiAlert-icon': { color: '#1a73e8' } },
        standardWarning: { backgroundColor: '#fef3e2', color: '#7a4f00', '& .MuiAlert-icon': { color: '#e37400' } },
        standardSuccess: { backgroundColor: '#e6f4ea', color: '#0d5225', '& .MuiAlert-icon': { color: '#137333' } },
        standardError: { backgroundColor: '#fce8e6', color: '#8c1d18', '& .MuiAlert-icon': { color: '#d93025' } },
      },
    },
    MuiSkeleton: {
      styleOverrides: { root: { borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.06)' } },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderColor: '#dadce0',
          color: '#5f6368',
          borderRadius: 8,
          '&.Mui-selected': {
            backgroundColor: '#e8f0fe',
            color: '#1a73e8',
            '&:hover': { backgroundColor: '#d2e3fc' },
          },
          '&:hover': { backgroundColor: '#f8faff' },
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: { gap: 4 },
        grouped: {
          '&:not(:first-of-type)': { borderLeft: '1px solid #dadce0', marginLeft: 0 },
          '&:not(:last-of-type)': { borderRight: '1px solid #dadce0' },
        },
      },
    },
    MuiBreadcrumbs: {
      styleOverrides: {
        separator: { color: '#9aa0a6' },
        li: { '& .MuiTypography-root': { fontSize: '0.875rem' } },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 16, boxShadow: '0 8px 24px rgba(60,64,67,.2)' },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: { fontSize: '1.125rem', fontWeight: 600, paddingBottom: 8 },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: { fontSize: '0.7rem', minWidth: 18, height: 18, borderRadius: 9 },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: { width: 42, height: 24, padding: 0 },
        switchBase: {
          padding: 3,
          '&.Mui-checked': {
            transform: 'translateX(18px)',
            color: '#fff',
            '& + .MuiSwitch-track': { backgroundColor: '#1a73e8', opacity: 1 },
          },
        },
        thumb: { width: 18, height: 18, boxShadow: 'none' },
        track: { borderRadius: 12, backgroundColor: '#bdc1c6', opacity: 1 },
      },
    },
  },
})

export default theme
