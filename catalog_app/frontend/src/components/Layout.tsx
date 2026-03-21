import { useState, type ReactNode } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import Button from '@mui/material/Button'
import HomeIcon from '@mui/icons-material/Home'
import StorageIcon from '@mui/icons-material/Storage'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import MenuIcon from '@mui/icons-material/Menu'
import TableChartIcon from '@mui/icons-material/TableChart'
import SearchBar from './SearchBar'

const DRAWER_WIDTH = 220

const navItems = [
  { label: 'Home', path: '/', icon: <HomeIcon /> },
  { label: 'Browse', path: '/browse', icon: <StorageIcon /> },
]

const addItems = [
  { label: 'Register Dataset', path: '/register/dataset', icon: <StorageIcon /> },
  { label: 'Register Table', path: '/register/table', icon: <TableChartIcon /> },
]

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isHome = location.pathname === '/'

  const drawer = (
    <Box sx={{ pt: 1 }}>
      <List dense>
        {navItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              component={Link}
              to={item.path}
              selected={location.pathname === item.path}
              onClick={() => setDrawerOpen(false)}
              sx={{
                mx: 1,
                borderRadius: 2,
                '&.Mui-selected': {
                  backgroundColor: '#e8f0fe',
                  color: '#1a73e8',
                  '& .MuiListItemIcon-root': { color: '#1a73e8' },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider sx={{ my: 1, mx: 2 }} />
      <Typography variant="caption" sx={{ px: 3, color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Register
      </Typography>
      <List dense>
        {addItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              component={Link}
              to={item.path}
              selected={location.pathname === item.path}
              onClick={() => setDrawerOpen(false)}
              sx={{
                mx: 1,
                borderRadius: 2,
                '&.Mui-selected': {
                  backgroundColor: '#e8f0fe',
                  color: '#1a73e8',
                  '& .MuiListItemIcon-root': { color: '#1a73e8' },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Top App Bar */}
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton
            edge="start"
            onClick={() => setDrawerOpen(!drawerOpen)}
            sx={{ color: 'text.secondary', display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          {/* Logo */}
          <Box
            component={Link}
            to="/"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', mr: 2, flexShrink: 0 }}
          >
            <StorageIcon sx={{ color: '#1a73e8', fontSize: 28 }} />
            <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 700, display: { xs: 'none', sm: 'block' } }}>
              DS Catalog
            </Typography>
          </Box>

          {/* Search bar in header (hidden on home) */}
          {!isHome && (
            <Box sx={{ flex: 1, maxWidth: 560 }}>
              <SearchBar size="small" />
            </Box>
          )}

          <Box sx={{ flex: 1 }} />

          <Tooltip title="Register Dataset">
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => navigate('/register/dataset')}
              sx={{ display: { xs: 'none', md: 'flex' } }}
            >
              Register
            </Button>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* Side Drawer – persistent on desktop */}
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', top: 64 },
        }}
      >
        {drawer}
      </Drawer>

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        {drawer}
      </Drawer>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          pt: '64px',
          pl: { sm: `${DRAWER_WIDTH}px` },
          minHeight: '100vh',
        }}
      >
        <Box sx={{ p: { xs: 2, sm: 3 } }}>{children}</Box>
      </Box>
    </Box>
  )
}
