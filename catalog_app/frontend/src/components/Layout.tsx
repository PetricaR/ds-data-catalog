import { useState, type ReactNode } from 'react'
import { useLocation, Link } from 'react-router-dom'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
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
import MenuIcon from '@mui/icons-material/Menu'
import StorageIcon from '@mui/icons-material/Storage'
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined'
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { canEdit, isAdmin, useAuth } from '../contexts/AuthContext'
import { notificationsApi } from '../api/notifications'
import { setupApi } from '../api/setup'
import { tokens } from '../theme'
import { Wordmark } from './Brand'
import SearchBar from './SearchBar'
import { MetaPill, formatDate } from './ui'

const DRAWER_WIDTH = 232
const HEADER_HEIGHT = 60
const { inverse } = tokens

type Section = { heading?: string; items: { label: string; path: string; icon: ReactNode }[] }

const MAIN_SECTION: Section = {
  heading: 'Catalog',
  items: [
    { label: 'Browse',       path: '/browse',  icon: <StorageIcon fontSize="small" /> },
    { label: 'Trusted data', path: '/trusted', icon: <VerifiedOutlinedIcon fontSize="small" /> },
  ],
}

const ADMIN_SECTION: Section = {
  heading: 'Admin',
  items: [
    { label: 'GCP sources', path: '/sources', icon: <CloudSyncOutlinedIcon fontSize="small" /> },
    { label: 'Users',       path: '/users',   icon: <PeopleOutlineIcon fontSize="small" /> },
    { label: 'Setup',       path: '/setup',   icon: <SettingsOutlinedIcon fontSize="small" /> },
  ],
}

function NavItem({ label, path, icon, active, onClick }: {
  label: string; path: string; icon: ReactNode; active: boolean; onClick: () => void
}) {
  return (
    <ListItem disablePadding sx={{ mb: 0.25 }}>
      <ListItemButton
        component={Link}
        to={path}
        selected={active}
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
        sx={{
          mx: 1.5, px: 1.25, py: 0.75, position: 'relative',
          color: tokens.ink2,
          '& .MuiListItemIcon-root': { minWidth: 32, color: tokens.ink3 },
          '&:hover': { bgcolor: tokens.paper2, color: tokens.ink },
          '&.Mui-selected': {
            bgcolor: tokens.accentWash,
            color: tokens.ink,
            '& .MuiListItemIcon-root': { color: tokens.accent },
            '&::before': {
              content: '""', position: 'absolute', left: 0, top: 6, bottom: 6, width: 2,
              borderRadius: 1, bgcolor: tokens.accent,
            },
          },
        }}
      >
        <ListItemIcon>{icon}</ListItemIcon>
        <ListItemText primary={label} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: active ? 600 : 500 }} />
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
  const sections = isAdmin(user) ? [MAIN_SECTION, ADMIN_SECTION] : [MAIN_SECTION]
  const canDismiss = canEdit(user)

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list(10),
    refetchInterval: 30_000,
  })

  // Flags a LOCAL_MODE backend, so a local session is never mistaken for the real catalog
  const { data: setupStatus } = useQuery({ queryKey: ['setup-status'], queryFn: setupApi.status, staleTime: Infinity })

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
    <Box component="nav" aria-label="Primary" sx={{ display: 'flex', flexDirection: 'column', height: '100%', pt: 2, pb: 2 }}>
      {sections.map((section) => (
        <Box key={section.heading} sx={{ mb: 2 }}>
          <Typography
            component="h2"
            sx={{
              px: 3, pb: 0.75, color: tokens.ink3, fontWeight: 600, fontSize: '0.6875rem',
              textTransform: 'uppercase', letterSpacing: '0.09em',
            }}
          >
            {section.heading}
          </Typography>
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
        </Box>
      ))}

      <Box sx={{ flex: 1 }} />
      <Typography variant="caption" sx={{ px: 3, color: tokens.ink3, fontFamily: tokens.fontMono, fontSize: '0.6875rem' }}>
        Light Data Catalog v1.0
      </Typography>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        component="a"
        href="#main"
        sx={{
          position: 'fixed', left: 16, top: -60, zIndex: (t) => t.zIndex.tooltip,
          px: 2, py: 1, bgcolor: tokens.surface, color: tokens.ink, borderRadius: `${tokens.radius}px`,
          fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none', boxShadow: 2,
          '&:focus': { top: 10 },
        }}
      >
        Skip to content
      </Box>

      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          bgcolor: inverse.paper,
          color: inverse.ink,
          borderBottom: `1px solid ${inverse.rule}`,
          colorScheme: 'dark',
        }}
      >
        <Toolbar sx={{ gap: { xs: 1, sm: 2 }, minHeight: `${HEADER_HEIGHT}px !important`, px: { xs: 1.5, sm: 2.5 } }}>
          <IconButton
            edge="start"
            aria-label={drawerOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(!drawerOpen)}
            sx={{ color: inverse.ink2, display: { md: 'none' }, '&:hover': { bgcolor: inverse.surface } }}
          >
            <MenuIcon />
          </IconButton>

          <Box
            component={Link}
            to="/browse"
            aria-label="Light Data Catalog, home"
            sx={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0, borderRadius: `${tokens.radius}px` }}
          >
            <Wordmark inverse />
          </Box>
          {setupStatus?.local_mode && (
            <Box sx={{ ml: 1.5, display: 'flex' }}>
              <MetaPill tone="warning" title="LOCAL_MODE is on: anyone on this machine can sign in as any user and role">
                Local mode
              </MetaPill>
            </Box>
          )}

          <Box sx={{ flex: 1, maxWidth: 560, ml: { md: 3 }, display: { xs: 'none', sm: 'block' } }}>
            <SearchBar />
          </Box>

          <Box sx={{ flex: 1 }} />

          <Tooltip title="Notifications" arrow>
            <IconButton
              aria-label={notifications.length ? `Notifications, ${notifications.length} new` : 'Notifications'}
              aria-haspopup="menu"
              onClick={(e) => setNotifAnchor(e.currentTarget)}
              sx={{ color: inverse.ink2, '&:hover': { bgcolor: inverse.surface, color: inverse.ink } }}
            >
              <Badge badgeContent={notifications.length} color="primary" max={9}>
                <NotificationsNoneIcon sx={{ fontSize: 22 }} />
              </Badge>
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={notifAnchor}
            open={!!notifAnchor}
            onClose={() => setNotifAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { width: 360, maxWidth: 'calc(100vw - 32px)', maxHeight: 480, mt: 1 } } }}
          >
            <Box sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', borderBottom: `1px solid ${tokens.rule}` }}>
              <Typography variant="subtitle2" sx={{ flex: 1 }}>Metadata changes</Typography>
              {canDismiss && notifications.length > 0 && (
                <Button size="small" onClick={() => { dismissAllMutation.mutate(); setNotifAnchor(null) }}>
                  Dismiss all
                </Button>
              )}
            </Box>
            {notifications.length === 0 ? (
              <Box sx={{ px: 3, py: 4, textAlign: 'center' }}>
                <NotificationsNoneIcon aria-hidden sx={{ fontSize: 32, color: tokens.ruleStrong, mb: 1 }} />
                <Typography variant="body2" color="text.secondary">Nothing new</Typography>
              </Box>
            ) : (
              notifications.map((n) => (
                <MenuItem
                  key={n.id}
                  sx={{ alignItems: 'flex-start', gap: 1.5, py: 1.25, px: 2, whiteSpace: 'normal' }}
                  onClick={() => { if (canDismiss) dismissMutation.mutate(n.id); else setNotifAnchor(null) }}
                >
                  <Box aria-hidden sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: tokens.accent, flexShrink: 0, mt: 1 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>{n.entity_name || n.entity_type}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {n.field_changed?.replace(/_/g, ' ')} changed{n.changed_by ? ` by ${n.changed_by}` : ''}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{formatDate(n.changed_at)}</Typography>
                </MenuItem>
              ))
            )}
            {canDismiss && notifications.length > 0 && (
              <Typography variant="caption" color="text.secondary" component="p" sx={{ px: 2, py: 1, borderTop: `1px solid ${tokens.rule}` }}>
                Select a change to dismiss it.
              </Typography>
            )}
          </Menu>

          {user && (
            <>
              <Tooltip title={`${user.name || user.email} · ${user.role}`} arrow>
                <IconButton
                  aria-label="Account"
                  aria-haspopup="menu"
                  onClick={(e) => setUserMenuAnchor(e.currentTarget)}
                  sx={{ p: 0.5, '&:hover': { bgcolor: inverse.surface } }}
                >
                  <Avatar src={user.picture ?? undefined} alt="" sx={{ width: 30, height: 30, fontSize: '0.8125rem' }}>
                    {(user.name || user.email)[0].toUpperCase()}
                  </Avatar>
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={userMenuAnchor}
                open={!!userMenuAnchor}
                onClose={() => setUserMenuAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: { sx: { width: 260, mt: 1 } } }}
              >
                <Box sx={{ px: 2, py: 1.5 }}>
                  <Typography variant="body2" fontWeight={600}>{user.name || user.email}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{user.email}</Typography>
                  <Box sx={{ mt: 1 }}><MetaPill tone="accent">{user.role}</MetaPill></Box>
                </Box>
                <Divider />
                <MenuItem onClick={() => { logout(); setUserMenuAnchor(null) }} sx={{ py: 1.25 }}>
                  <Typography variant="body2" color="error.main" fontWeight={500}>Sign out</Typography>
                </MenuItem>
              </Menu>
            </>
          )}
        </Toolbar>
      </AppBar>

      {/* Permanent sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            top: HEADER_HEIGHT,
            height: `calc(100% - ${HEADER_HEIGHT}px)`,
            borderRight: `1px solid ${tokens.rule}`,
          },
        }}
      >
        {drawer}
      </Drawer>

      {/* Mobile drawer: also carries the search, which the header has no room for */}
      <Drawer
        variant="temporary"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: 280 } }}
      >
        {/* The header stays above this drawer, so its menu button can close it */}
        <Box sx={{ minHeight: HEADER_HEIGHT, bgcolor: inverse.paper }} />
        <Box sx={{ p: 1.5, display: { sm: 'none' }, bgcolor: inverse.paper, colorScheme: 'dark' }} onSubmit={() => setDrawerOpen(false)}>
          <SearchBar placeholder="Search the catalog…" />
        </Box>
        {drawer}
      </Drawer>

      <Box component="main" id="main" tabIndex={-1} sx={{ flexGrow: 1, minWidth: 0, pt: `${HEADER_HEIGHT}px`, outline: 'none' }}>
        <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 2.5, sm: 3.5 } }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}
