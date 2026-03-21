import { createTheme } from '@mui/material/styles'

// Google Material Design 3 inspired palette
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1a73e8',       // Google Blue
      light: '#4a90e2',
      dark: '#1557b0',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#137333',       // Google Green
      light: '#34a853',
      dark: '#0d5225',
      contrastText: '#ffffff',
    },
    error: {
      main: '#d93025',
    },
    warning: {
      main: '#f9ab00',
    },
    info: {
      main: '#1a73e8',
    },
    success: {
      main: '#137333',
    },
    background: {
      default: '#f8f9fa',
      paper: '#ffffff',
    },
    text: {
      primary: '#202124',
      secondary: '#5f6368',
    },
    divider: '#e8eaed',
  },
  typography: {
    fontFamily: '"Google Sans", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 500 },
    h5: { fontWeight: 500 },
    h6: { fontWeight: 500 },
    subtitle1: { fontWeight: 500 },
    button: { textTransform: 'none', fontWeight: 500 },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          padding: '8px 24px',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: '0 1px 3px rgba(60,64,67,.3)' },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px rgba(60,64,67,.15)',
          border: '1px solid #e8eaed',
          '&:hover': { boxShadow: '0 2px 8px rgba(60,64,67,.2)' },
          transition: 'box-shadow 0.2s ease',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 6 },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined' },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px rgba(60,64,67,.15)',
          backgroundColor: '#ffffff',
          color: '#202124',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          border: 'none',
          backgroundColor: '#f8f9fa',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          backgroundColor: '#f8f9fa',
          color: '#5f6368',
        },
      },
    },
  },
})

export default theme
