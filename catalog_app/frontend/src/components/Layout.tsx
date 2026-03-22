import { useState, type ReactNode } from 'react'
import { useLocation, Link } from 'react-router-dom'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import Button from '@mui/material/Button'
import SchemaIcon from '@mui/icons-material/Schema'
import MenuIcon from '@mui/icons-material/Menu'
import StorageIcon from '@mui/icons-material/Storage'
import VerifiedIcon from '@mui/icons-material/Verified'
import CloudSyncIcon from '@mui/icons-material/CloudSync'
import NotificationsIcon from '@mui/icons-material/Notifications'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { notificationsApi } from '../api/notifications'
import SearchBar from './SearchBar'

const DRAWER_WIDTH = 210

const SECTIONS: { heading?: string; items: { label: string; path: string; icon: ReactNode }[] }[] = [
  {
    items: [
      { label: 'Browse',       path: '/browse',  icon: <StorageIcon fontSize="small" /> },
      { label: 'Trusted Data', path: '/trusted', icon: <VerifiedIcon fontSize="small" /> },
    ],
  },
  {
    heading: 'Admin',
    items: [
      { label: 'GCP Sources', path: '/sources', icon: <CloudSyncIcon fontSize="small" /> },
    ],
  },
]

function NavItem({ label, path, icon, active, onClick }: {
  label: string; path: string; icon: ReactNode; active: boolean; onClick: () => void
}) {
  return (
    <ListItem disablePadding sx={{ mb: 0.25 }}>
      <ListItemButton
        component={Link}
        to={path}
        selected={active}
        onClick={onClick}
        sx={{
          mx: 1,
          px: 1.5,
          py: 0.875,
          borderRadius: 2.5,
          transition: 'background 0.12s',
          '&.Mui-selected': {
            bgcolor: '#e8f0fe',
            '& .MuiListItemIcon-root': { color: '#1a73e8' },
            '& .MuiListItemText-primary': { color: '#1a73e8', fontWeight: 600 },
          },
          '&:hover:not(.Mui-selected)': { bgcolor: 'rgba(0,0,0,0.04)' },
        }}
      >
        <ListItemIcon sx={{ minWidth: 34, color: active ? '#1a73e8' : '#5f6368' }}>
          {icon}
        </ListItemIcon>
        <ListItemText
          primary={label}
          primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: active ? 600 : 400 }}
        />
      </ListItemButton>
    </ListItem>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [notifAnchor, setNotifAnchor] = useState<null | HTMLElement>(null)
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null)
  const { user, logout } = useAuth()
  const qc = useQueryClient()

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list(10),
    refetchInterval: 30_000,
  })

  const dismissMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.dismiss(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const dismissAllMutation = useMutation({
    mutationFn: () => notificationsApi.dismissAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const isActive = (path: string) => location.pathname.startsWith(path)

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', pt: 1, pb: 2 }}>
      {SECTIONS.map((section, si) => (
        <Box key={si}>
          {section.heading && (
            <Typography
              variant="caption"
              sx={{
                display: 'block', px: 2.5, pt: 1.5, pb: 0.5,
                color: '#9aa0a6', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem',
              }}
            >
              {section.heading}
            </Typography>
          )}
          <List dense disablePadding>
            {section.items.map((item) => (
              <NavItem
                key={item.path}
                {...item}
                active={isActive(item.path)}
                onClick={() => setDrawerOpen(false)}
              />
            ))}
          </List>
          {si < SECTIONS.length - 1 && <Divider sx={{ mx: 2, my: 1.5 }} />}
        </Box>
      ))}

      <Box sx={{ flex: 1 }} />
      <Divider sx={{ mx: 2, mb: 1.5 }} />
      <Typography variant="caption" sx={{ px: 2.5, color: '#bdc1c6', fontSize: '0.7rem' }}>
        DS Data Catalog v1.0
      </Typography>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* AppBar */}
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 1, minHeight: '60px !important' }}>
          <IconButton
            edge="start"
            onClick={() => setDrawerOpen(!drawerOpen)}
            sx={{ color: '#5f6368', display: { sm: 'none' }, mr: 0.5 }}
          >
            <MenuIcon />
          </IconButton>

          {/* Logo */}
          <Box
            component={Link}
            to="/browse"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', mr: 2, flexShrink: 0 }}
          >
            <Box sx={{
              width: 32, height: 32, borderRadius: 2, bgcolor: '#1a73e8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <SchemaIcon sx={{ color: '#fff', fontSize: 20 }} />
            </Box>
            <Typography
              variant="subtitle1"
              sx={{ color: '#1f1f1f', fontWeight: 700, display: { xs: 'none', sm: 'block' }, letterSpacing: '-0.01em' }}
            >
              DS Catalog
            </Typography>
          </Box>

          {/* Search */}
          <Box sx={{ flex: 1, maxWidth: 560 }}>
            <SearchBar size="small" />
          </Box>

          <Box sx={{ flex: 1 }} />

          {/* Notifications */}
          <Tooltip title="Notifications" arrow>
            <IconButton onClick={(e) => setNotifAnchor(e.currentTarget)} sx={{ color: '#5f6368' }}>
              <Badge badgeContent={notifications?.length ?? 0} color="error" max={9}>
                <NotificationsIcon sx={{ fontSize: 22 }} />
              </Badge>
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={notifAnchor}
            open={!!notifAnchor}
            onClose={() => setNotifAnchor(null)}
            PaperProps={{ sx: { width: 360, maxHeight: 480, borderRadius: 3, mt: 1 } }}
          >
            <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>Notifications</Typography>
              {(notifications?.length ?? 0) > 0 && (
                <Button size="small" sx={{ fontSize: '0.75rem', color: '#1a73e8' }}
                  onClick={() => { dismissAllMutation.mutate(); setNotifAnchor(null) }}>
                  Clear all
                </Button>
              )}
            </Box>
            {!notifications?.length ? (
              <Box sx={{ px: 3, py: 4, textAlign: 'center' }}>
                <NotificationsIcon sx={{ fontSize: 32, color: '#dadce0', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">No new notifications</Typography>
              </Box>
            ) : (
              notifications.map((n) => (
                <MenuItem
                  key={n.id}
                  sx={{ alignItems: 'flex-start', gap: 1.5, py: 1.5, px: 2 }}
                  onClick={() => dismissMutation.mutate(n.id)}
                >
                  <Box sx={{
                    width: 8, height: 8, borderRadius: '50%', bgcolor: '#1a73e8',
                    flexShrink: 0, mt: 0.75,
                  }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={500} noWrap>
                      {n.entity_name || n.entity_type}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {n.field_changed} changed{n.changed_by ? ` by ${n.changed_by}` : ''}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0, mt: 0.25 }}>
                    {new Date(n.changed_at).toLocaleDateString()}
                  </Typography>
                </MenuItem>
              ))
            )}
          </Menu>

          {/* User menu */}
          {user ? (
            <>
              <Tooltip title={`${user.name || user.email} · ${user.role}`} arrow>
                <IconButton onClick={(e) => setUserMenuAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
                  {user.picture
                    ? <Avatar src={user.picture} sx={{ width: 32, height: 32 }} />
                    : <Avatar sx={{ width: 32, height: 32, fontSize: '0.875rem', bgcolor: '#1a73e8', fontWeight: 600 }}>
                        {(user.name || user.email)[0].toUpperCase()}
                      </Avatar>
                  }
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={userMenuAnchor}
                open={!!userMenuAnchor}
                onClose={() => setUserMenuAnchor(null)}
                PaperProps={{ sx: { width: 240, borderRadius: 3, mt: 1 } }}
              >
                <Box sx={{ px: 2, py: 1.5 }}>
                  <Typography variant="body2" fontWeight={600}>{user.name || user.email}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{user.email}</Typography>
                  <Chip label={user.role} size="small" sx={{ mt: 0.75, fontSize: '0.7rem', height: 20, bgcolor: '#e8f0fe', color: '#1a73e8' }} />
                </Box>
                <Divider />
                <MenuItem onClick={() => { logout(); setUserMenuAnchor(null) }} sx={{ py: 1.25 }}>
                  <Typography variant="body2" color="error.main" fontWeight={500}>Sign out</Typography>
                </MenuItem>
              </Menu>
            </>
          ) : (
            <Button
              size="small"
              variant="outlined"
              onClick={() => { window.location.href = '/api/v1/auth/login' }}
              sx={{ fontSize: '0.8rem', ml: 1 }}
            >
              Sign in
            </Button>
          )}
        </Toolbar>
      </AppBar>

      {/* Permanent sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            top: 60,
            height: 'calc(100% - 60px)',
            borderRight: '1px solid #e8eaed',
            bgcolor: '#f8f9fa',
          },
        }}
      >
        {drawer}
      </Drawer>

      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH },
        }}
      >
        <Toolbar sx={{ minHeight: '60px !important' }} />
        {drawer}
      </Drawer>

      {/* Main */}
      <Box component="main" sx={{ flexGrow: 1, pt: '60px', minHeight: '100vh' }}>
        <Box sx={{ p: { xs: 2, sm: 3 } }}>{children}</Box>
      </Box>
    </Box>
  )
}
