import {
  Alert, Avatar, Box, Link, MenuItem, Select, Skeleton, Switch, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tooltip, Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '../api/users'
import type { UserRole } from '../api/types'
import { MetaPill, PageHeader, formatDateTime } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { tokens } from '../theme'

const ROLE_HELP: Record<UserRole, string> = {
  viewer: 'Browse and search the catalog',
  editor: 'Edit metadata, validate tables, run previews and scans',
  admin: 'Everything, plus GCP sources, sync, user management and settings',
}

export default function Users() {
  const qc = useQueryClient()
  const { user: me } = useAuth()
  const { data: users, isLoading, error } = useQuery({ queryKey: ['users'], queryFn: usersApi.list })

  const update = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; role?: UserRole; is_active?: boolean }) => usersApi.update(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  return (
    <Box>
      <PageHeader
        eyebrow="Admin"
        title="Users"
        subtitle={<>
          People appear here after their first sign-in. Who may sign in, and the role new users get, is set
          on the <Link component={RouterLink} to="/settings">Settings</Link> page.
        </>}
      />

      <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5, m: 0, mb: 3 }}>
        {(Object.keys(ROLE_HELP) as UserRole[]).map((role) => (
          <Box key={role} sx={{ border: `1px solid ${tokens.rule}`, borderRadius: `${tokens.radiusLg}px`, bgcolor: tokens.surface, px: 2, py: 1.5 }}>
            <Typography component="dt" variant="subtitle2" sx={{ textTransform: 'capitalize' }}>{role}</Typography>
            <Typography component="dd" variant="body2" color="text.secondary" sx={{ m: 0 }}>{ROLE_HELP[role]}</Typography>
          </Box>
        ))}
      </Box>

      {isLoading && <Skeleton variant="rounded" height={160} />}
      {error && <Alert severity="error">Could not load users.</Alert>}

      {users && (
        <TableContainer sx={{ border: `1px solid ${tokens.rule}`, borderRadius: `${tokens.radiusLg}px`, bgcolor: tokens.surface }}>
          <Table size="small" aria-label="Users">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Last sign-in</TableCell>
                <TableCell align="center">Active</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => {
                const isMe = u.id === me?.id
                const name = u.name || u.email
                return (
                  <TableRow key={u.id} sx={{ opacity: u.is_active ? 1 : 0.55 }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5 }}>
                        <Avatar src={u.picture ?? undefined} alt="" sx={{ width: 30, height: 30, fontSize: '0.8125rem' }}>{name[0].toUpperCase()}</Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {name} {isMe && <MetaPill tone="accent">you</MetaPill>}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{u.email}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={isMe ? 'You cannot change your own role' : ROLE_HELP[u.role]} placement="left">
                        <span>
                          <Select
                            size="small"
                            value={u.role}
                            disabled={isMe || update.isPending}
                            onChange={(e) => update.mutate({ id: u.id, role: e.target.value as UserRole })}
                            inputProps={{ 'aria-label': `Role of ${name}` }}
                            sx={{ minWidth: 120, fontSize: '0.875rem' }}
                          >
                            <MenuItem value="viewer">Viewer</MenuItem>
                            <MenuItem value="editor">Editor</MenuItem>
                            <MenuItem value="admin">Admin</MenuItem>
                          </Select>
                        </span>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', color: tokens.ink3 }}>{formatDateTime(u.last_login)}</TableCell>
                    <TableCell align="center">
                      <Switch
                        size="small"
                        checked={u.is_active}
                        disabled={isMe || update.isPending}
                        inputProps={{ 'aria-label': `${name} can sign in` }}
                        onChange={(e) => update.mutate({ id: u.id, is_active: e.target.checked })}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}
