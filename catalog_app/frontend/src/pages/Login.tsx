import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined'
import GoogleIcon from '@mui/icons-material/Google'
import SearchIcon from '@mui/icons-material/Search'
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined'
import { isAdmin, useAuth } from '../contexts/AuthContext'
import { authApi } from '../api/auth'
import { setupApi } from '../api/setup'
import type { User } from '../api/types'
import { Wordmark } from '../components/Brand'
import { Eyebrow } from '../components/ui'
import { tokens } from '../theme'

const { inverse } = tokens

const FEATURES = [
  { icon: <SearchIcon />, title: 'Find data fast', text: 'Search every BigQuery dataset, table and column in one place.' },
  { icon: <CloudSyncOutlinedIcon />, title: 'Always current', text: 'Metadata syncs from all your GCP projects, keeping your own docs.' },
  { icon: <VerifiedOutlinedIcon />, title: 'Know what to trust', text: 'Editors certify tables, so analysts reach for the right source.' },
]

// After sign-in: back to where the user started (e.g. the setup wizard), else the wizard for an admin
// on a fresh install, else the catalog.
async function landingPage(user: User): Promise<string> {
  const returnTo = authApi.takeReturnTo()
  if (returnTo) return returnTo
  if (!isAdmin(user)) return '/browse'
  try {
    return (await setupApi.status()).is_fresh_install ? '/setup' : '/browse'
  } catch {
    return '/browse'
  }
}

export default function Login() {
  const navigate = useNavigate()
  const { setUser, user } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [freshInstall, setFreshInstall] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)
  // Set while the OAuth callback picks a landing page, so the "already signed in" redirect doesn't override it
  const completingSignIn = useRef(false)

  // The OAuth callback returns the token (or an error) in the URL fragment, which never reaches a server.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    if (params.toString()) window.history.replaceState(null, '', window.location.pathname)
    const token = params.get('token')
    const userParam = params.get('user')
    if (token && userParam) {
      let parsedUser: User
      try {
        parsedUser = JSON.parse(userParam)
      } catch {
        setError('Sign-in failed. Please try again.')
        return
      }
      completingSignIn.current = true
      authApi.storeToken(token, parsedUser)
      landingPage(parsedUser).then((path) => {
        navigate(path, { replace: true })
        setUser(parsedUser)
      })
      return
    }
    if (params.toString()) setError(params.get('error') || 'Sign-in failed. Please try again.')

    // Sign-in can't work until OAuth and an admin are configured — the setup wizard explains what's missing.
    if (user) return
    setupApi.status()
      .then((status) => {
        if (!status.oauth_configured || !status.admin_configured) navigate('/setup', { replace: true })
        else {
          setFreshInstall(status.is_fresh_install)
          setClientError(status.oauth_client_error)
        }
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user && !completingSignIn.current) navigate('/browse', { replace: true })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: tokens.paper }}>
      <Box
        component="aside"
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          width: { md: 460, lg: 540 },
          flexShrink: 0,
          px: { md: 6, lg: 8 },
          py: 6,
          bgcolor: inverse.paper,
          color: inverse.ink,
          colorScheme: 'dark',
          // formare.dev's blueprint grid
          backgroundImage: `linear-gradient(${inverse.gridLine} 1px, transparent 1px), linear-gradient(90deg, ${inverse.gridLine} 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      >
        <Wordmark inverse size={28} />
        <Box sx={{ my: 'auto', py: 6 }}>
          <Eyebrow color={inverse.accent}>BigQuery data catalog</Eyebrow>
          <Typography component="p" sx={{ fontSize: { md: '2.5rem', lg: '3rem' }, fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.05, mt: 1.5, mb: 2.5 }}>
            Your data, documented and easy to trust.
          </Typography>
          <Typography sx={{ color: inverse.ink2, lineHeight: 1.65, maxWidth: 420 }}>
            One place to find your organisation's BigQuery datasets and tables, read what they mean, and see which ones are certified.
          </Typography>
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 5, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {FEATURES.map(({ icon, title, text }) => (
              <Box component="li" key={title} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                <Box aria-hidden sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: `${tokens.radius}px`, display: 'grid', placeItems: 'center', bgcolor: inverse.surface, border: `1px solid ${inverse.rule}`, color: inverse.accent, '& svg': { fontSize: 20 } }}>
                  {icon}
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>{title}</Typography>
                  <Typography sx={{ color: inverse.ink3, fontSize: '0.875rem', lineHeight: 1.55 }}>{text}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
        <Typography sx={{ color: inverse.ink3, fontFamily: tokens.fontMono, fontSize: '0.75rem' }}>OAuth 2.0 · Google Workspace sign-in · BigQuery</Typography>
      </Box>

      <Box component="main" sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 3, py: 6 }}>
        <Box sx={{ width: '100%', maxWidth: 400 }}>
          <Box sx={{ display: { xs: 'flex', md: 'none' }, mb: 5 }}><Wordmark size={28} /></Box>

          <Eyebrow>Sign in</Eyebrow>
          <Typography variant="h4" component="h1" sx={{ mt: 0.75, mb: 1.5 }}>
            {freshInstall ? 'Welcome' : 'Welcome back'}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 4 }}>
            Use your Google Workspace account to open your organisation's data catalog.
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
          {clientError && (
            <Alert severity="error" sx={{ mb: 3 }}>
              Google sign-in is not working: Google rejects this app's OAuth client ({clientError}). An administrator
              needs to replace it — see <Link component={RouterLink} to="/setup">setup</Link>.
            </Alert>
          )}
          {freshInstall && (
            <Alert severity="info" sx={{ mb: 3 }}>
              First-time setup: sign in with an account listed in <code>ADMIN_EMAILS</code> to connect your BigQuery projects.
            </Alert>
          )}

          <Button
            variant="contained"
            fullWidth
            size="large"
            startIcon={<GoogleIcon />}
            onClick={() => { window.location.href = '/api/v1/auth/login' }}
          >
            Sign in with Google
          </Button>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2, textAlign: 'center' }}>
            You'll be sent to Google and brought back here.
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
