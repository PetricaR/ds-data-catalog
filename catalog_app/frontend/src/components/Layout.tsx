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
import StorageIcon from '@mui/icons-material/Storage'
import MenuIcon from '@mui/icons-material/Menu'
import TableChartIcon from '@mui/icons-material/TableChart'
import VerifiedIcon from '@mui/icons-material/Verified'
import NotificationsIcon from '@mui/icons-material/Notifications'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { notificationsApi } from '../api/notifications'

import SearchBar from './SearchBar'

const DRAWER_WIDTH = 200

const SECTIONS = [
  {
    items: [
      { label: 'Browse',       path: '/browse',  icon: <StorageIcon /> },
      { label: 'Trusted Data', path: '/trusted', icon: <VerifiedIcon /> },
    ],
  },
]

function NavItem({
  label, path, icon, active, onClick,
}: {
  label: string; path: string; icon: ReactNode; active: boolean; onClick: () => void
}) {
  return (
    <ListItem disablePadding sx={{ mb: 0.5 }}>
      <ListItemButton
        component={Link}
        to={path}
        selected={active}
        onClick={onClick}
        sx={{
          mx: 1.5,
          px: 1.5,
          py: 0.9,
          borderRadius: 3,
          transition: 'background 0.15s',
          '&.Mui-selected': {
            bgcolor: '#e8f0fe',
            '& .MuiListItemIcon-root': { color: '#1a73e8' },
            '& .MuiListItemText-primary': { color: '#1a73e8', fontWeight: 600 },
          },
          '&:hover:not(.Mui-selected)': { bgcolor: '#f1f3f4' },
        }}
      >
        <ListItemIcon sx={{ minWidth: 36, color: active ? '#1a73e8' : 'text.secondary' }}>
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

  const dismiss = (id: string) => dismissMutation.mutate(id)
  const dismissAll = () => dismissAllMutation.mutate()

  const isActive = (path: string) => location.pathname.startsWith(path)

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', pt: 1.5, pb: 2 }}>
      {SECTIONS.map((section, si) => (
        <Box key={si}>
          {section.heading && (
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                px: 3,
                pt: 1.5,
                pb: 0.5,
                color: 'text.disabled',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontSize: '0.68rem',
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

      {/* Spacer pushes version to bottom */}
      <Box sx={{ flex: 1 }} />

      <Divider sx={{ mx: 2, mb: 1.5 }} />
      <Typography variant="caption" sx={{ px: 3, color: 'text.disabled' }}>
        DS Data Catalog v1.0
      </Typography>
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

          <Box
            component={Link}
            to="/browse"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', mr: 2, flexShrink: 0 }}
          >
            <StorageIcon sx={{ color: '#1a73e8', fontSize: 26 }} />
            <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 700, display: { xs: 'none', sm: 'block' } }}>
              DS Catalog
            </Typography>
          </Box>

          <Box sx={{ flex: 1, maxWidth: 560 }}>
            <SearchBar size="small" />
          </Box>

          <Box sx={{ flex: 1 }} />

          {/* Notifications */}
          <Tooltip title="Notifications">
            <IconButton onClick={(e) => setNotifAnchor(e.currentTarget)} sx={{ color: 'text.secondary' }}>
              <Badge badgeContent={notifications?.length ?? 0} color="error" max={9}>
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={notifAnchor}
            open={!!notifAnchor}
            onClose={() => setNotifAnchor(null)}
            PaperProps={{ sx: { width: 360, maxHeight: 440 } }}
          >
            <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>Metadata Changes</Typography>
              {(notifications?.length ?? 0) > 0 && (
                <Button size="small" sx={{ fontSize: '0.7rem' }} onClick={() => { dismissAll(); setNotifAnchor(null) }}>
                  Clear all
                </Button>
              )}
            </Box>
            {!notifications?.length ? (
              <MenuItem disabled>
                <Typography variant="body2" color="text.secondary">No new notifications</Typography>
              </MenuItem>
            ) : (
              notifications.map((n) => (
                <MenuItem key={n.id} sx={{ alignItems: 'flex-start', gap: 1, py: 1 }} onClick={() => dismiss(n.id)}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={500} noWrap>{n.entity_name || n.entity_type}</Typography>
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
              <Tooltip title={`${user.name || user.email} (${user.role})`}>
                <IconButton onClick={(e) => setUserMenuAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
                  {user.picture
                    ? <Avatar src={user.picture} sx={{ width: 32, height: 32 }} />
                    : <Avatar sx={{ width: 32, height: 32, fontSize: '0.85rem', bgcolor: '#1a73e8' }}>{(user.name || user.email)[0].toUpperCase()}</Avatar>
                  }
                </IconButton>
              </Tooltip>
              <Menu anchorEl={userMenuAnchor} open={!!userMenuAnchor} onClose={() => setUserMenuAnchor(null)}>
                <Box sx={{ px: 2, py: 1 }}>
                  <Typography variant="body2" fontWeight={600}>{user.name || user.email}</Typography>
                  <Typography variant="caption" color="text.secondary">{user.email}</Typography>
                  <Chip label={user.role} size="small" sx={{ mt: 0.5, fontSize: '0.65rem', height: 18 }} />
                </Box>
                <Divider />
                <MenuItem onClick={() => { logout(); setUserMenuAnchor(null) }}>
                  <Typography variant="body2" color="error">Sign out</Typography>
                </MenuItem>
              </Menu>
            </>
          ) : (
            <Button
              size="small"
              variant="outlined"
              onClick={() => { window.location.href = '/api/v1/auth/login' }}
              sx={{ fontSize: '0.8rem', textTransform: 'none', ml: 1 }}
            >
              Sign in
            </Button>
          )}

        </Toolbar>
      </AppBar>

      {/* Side Drawer – persistent on desktop */}
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            top: 64,
            height: 'calc(100% - 64px)',
            borderRight: '1px solid',
            borderColor: 'divider',
          },
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
          minHeight: '100vh',
        }}
      >
        <Box sx={{ pt: { xs: 1.5, sm: 2 }, pb: { xs: 1.5, sm: 2 }, pl: { xs: 1.5, sm: 2 }, pr: { xs: 1.5, sm: 2 } }}>{children}</Box>
      </Box>
    </Box>
  )
}
