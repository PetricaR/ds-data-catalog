import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import SchemaIcon from '@mui/icons-material/Schema'
import GoogleIcon from '@mui/icons-material/Google'
import SearchIcon from '@mui/icons-material/Search'
import VerifiedIcon from '@mui/icons-material/Verified'
import CloudSyncIcon from '@mui/icons-material/CloudSync'
import { useAuth } from '../contexts/AuthContext'
import { authApi } from '../api/auth'
import type { User } from '../api/types'

const FEATURES = [
  { icon: <SearchIcon sx={{ fontSize: 20 }} />, text: 'Search across all BigQuery datasets and tables' },
  { icon: <CloudSyncIcon sx={{ fontSize: 20 }} />, text: 'Auto-sync metadata from multiple GCP projects' },
  { icon: <VerifiedIcon sx={{ fontSize: 20 }} />, text: 'Validate and certify trusted data sources' },
]

export default function Login() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { setUser, user } = useAuth()

  useEffect(() => {
    const token = params.get('token')
    const userParam = params.get('user')
    if (token) {
      try {
        const parsedUser: User = userParam
          ? JSON.parse(decodeURIComponent(userParam))
          : { id: '', email: '', name: null, picture: null, role: 'viewer' }
        authApi.storeToken(token, parsedUser)
        setUser(parsedUser)
        navigate('/browse', { replace: true })
      } catch {
        // ignore
      }
    }
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user) navigate('/browse', { replace: true })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: '#f0f4f9' }}>
      {/* Left panel */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          width: 480,
          flexShrink: 0,
          background: 'linear-gradient(160deg, #1a73e8 0%, #0d5225 100%)',
          px: 7,
          py: 6,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative circles */}
        <Box sx={{ position: 'absolute', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.06)' }} />
        <Box sx={{ position: 'absolute', bottom: -60, left: -60, width: 240, height: 240, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.06)' }} />
        <Box sx={{ position: 'absolute', top: '40%', right: -40, width: 160, height: 160, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.04)' }} />

        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 5 }}>
            <SchemaIcon sx={{ color: '#ffffff', fontSize: 32 }} />
            <Typography variant="h6" sx={{ color: '#ffffff', fontWeight: 700, letterSpacing: '0.01em' }}>
              Light Data Catalog
            </Typography>
          </Box>

          <Typography variant="h3" sx={{ color: '#ffffff', fontWeight: 700, lineHeight: 1.2, mb: 2 }}>
            Your data,<br />organized.
          </Typography>
          <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)', mb: 5, lineHeight: 1.7 }}>
            A single source of truth for all your organization's BigQuery datasets — documented, validated, and searchable.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {FEATURES.map(({ icon, text }) => (
              <Box key={text} sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Box sx={{
                  mt: 0.1, flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
                  bgcolor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: '#ffffff',
                }}>
                  {icon}
                </Box>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, pt: 0.75 }}>
                  {text}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Right panel */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 3 }}>
        <Box sx={{ width: '100%', maxWidth: 400 }}>
          {/* Mobile logo */}
          <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1.5, mb: 4, justifyContent: 'center' }}>
            <SchemaIcon sx={{ color: '#1a73e8', fontSize: 32 }} />
            <Typography variant="h5" fontWeight={700}>Light Data Catalog</Typography>
          </Box>

          <Typography variant="h4" fontWeight={700} gutterBottom sx={{ color: '#1f1f1f' }}>
            Welcome back
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.6 }}>
            Sign in with your Google Workspace account to access your organization's data catalog.
          </Typography>

          <Button
            variant="contained"
            fullWidth
            size="large"
            startIcon={<GoogleIcon />}
            onClick={() => { window.location.href = '/api/v1/auth/login' }}
            sx={{
              borderRadius: 3,
              py: 1.5,
              fontSize: '1rem',
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(26,115,232,0.4)',
              '&:hover': { boxShadow: '0 4px 12px rgba(26,115,232,0.5)' },
            }}
          >
            Sign in with Google
          </Button>

          <Divider sx={{ my: 3 }}>
            <Typography variant="caption" color="text.disabled" sx={{ px: 1 }}>
              SECURE ACCESS
            </Typography>
          </Divider>

          <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
            {['OAuth 2.0', 'BigQuery', 'Workspace SSO'].map((label) => (
              <Typography key={label} variant="caption" color="text.disabled" sx={{ fontWeight: 500 }}>
                {label}
              </Typography>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
