import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import StorageIcon from '@mui/icons-material/Storage'
import GoogleIcon from '@mui/icons-material/Google'
import { useAuth } from '../contexts/AuthContext'
import { authApi } from '../api/auth'
import type { User } from '../api/types'

export default function Login() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { setUser, user } = useAuth()

  useEffect(() => {
    const token = params.get('token')
    const userParam = params.get('user')
    if (token) {
      try {
        const parsedUser: User = userParam ? JSON.parse(decodeURIComponent(userParam)) : { id: '', email: '', name: null, picture: null, role: 'viewer' }
        authApi.storeToken(token, parsedUser)
        setUser(parsedUser)
        navigate('/browse', { replace: true })
      } catch {
        // ignore parse error
      }
    }
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user) navigate('/browse', { replace: true })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f8f9fa' }}>
      <Card sx={{ width: 380, p: 2, textAlign: 'center', borderRadius: 3, boxShadow: 4 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <StorageIcon sx={{ fontSize: 48, color: '#1a73e8' }} />
          </Box>
          <Typography variant="h5" fontWeight={700} gutterBottom>DS Data Catalog</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Sign in with your Google workspace account to access your organization's data catalog.
          </Typography>
          <Button
            variant="contained"
            fullWidth
            size="large"
            startIcon={<GoogleIcon />}
            onClick={() => { window.location.href = '/api/v1/auth/login' }}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            Sign in with Google
          </Button>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2 }}>
            Secure access via Google OAuth 2.0
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
