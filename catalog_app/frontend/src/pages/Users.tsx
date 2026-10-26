import {
  Alert, Avatar, Box, CircularProgress, MenuItem, Paper, Select, Switch, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '../api/users'
import type { ManagedUser, UserRole } from '../api/types'
import { useAuth } from '../contexts/AuthContext'

const ROLE_HELP: Record<UserRole, string> = {
  viewer: 'Browse and search the catalog',
  editor: 'Edit metadata, validate tables, run previews and scans',
  admin: 'Everything, plus GCP sources, sync and user management',
}

export default function Users() {
  const qc = useQueryClient()
  const { user: me } = useAuth()
  const { data: users, isLoading, error } = useQuery({ queryKey: ['users'], queryFn: usersApi.list })

  const update = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; role?: UserRole; is_active?: boolean }) =>
      usersApi.update(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom>Users</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        People appear here after their first sign-in. Who may sign in is set by{' '}
        <code>ALLOWED_EMAIL_DOMAINS</code>, <code>ALLOWED_EMAILS</code> and <code>ADMIN_EMAILS</code> on the backend.
      </Typography>

      {isLoading && <CircularProgress size={24} />}
      {error && <Alert severity="error">Could not load users.</Alert>}

      {users && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Last sign-in</TableCell>
                <TableCell align="center">Active</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u: ManagedUser) => {
                const isMe = u.id === me?.id
                return (
                  <TableRow key={u.id} sx={{ opacity: u.is_active ? 1 : 0.5 }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar src={u.picture ?? undefined} sx={{ width: 28, height: 28, fontSize: '0.8rem' }}>
                          {(u.name || u.email)[0].toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={500}>{u.name || u.email}</Typography>
                          <Typography variant="caption" color="text.secondary">{u.email}</Typography>
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
                            sx={{ minWidth: 120, fontSize: '0.875rem' }}
                          >
                            <MenuItem value="viewer">viewer</MenuItem>
                            <MenuItem value="editor">editor</MenuItem>
                            <MenuItem value="admin">admin</MenuItem>
                          </Select>
                        </span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {u.last_login ? new Date(u.last_login).toLocaleString() : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        size="small"
                        checked={u.is_active}
                        disabled={isMe || update.isPending}
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
