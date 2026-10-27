import { lazy, Suspense, type ReactNode } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Layout from './components/Layout'
import Browse from './pages/Browse'
import Login from './pages/Login'
import { AuthProvider, isAdmin, useAuth } from './contexts/AuthContext'

// Browse is the landing page; the rest load on first visit
const SearchResults = lazy(() => import('./pages/SearchResults'))
const DatasetDetail = lazy(() => import('./pages/DatasetDetail'))
const TableDetail = lazy(() => import('./pages/TableDetail'))
const TrustedData = lazy(() => import('./pages/TrustedData'))
const Sources = lazy(() => import('./pages/Sources'))
const Users = lazy(() => import('./pages/Users'))
const Setup = lazy(() => import('./pages/Setup'))

const PageLoading = () => <Box sx={{ pt: 1 }}><LinearProgress aria-label="Loading page" /></Box>

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return isAdmin(user) ? <>{children}</> : <Navigate to="/browse" replace />
}

// React Router reuses a route's component when only its params change; a key per id remounts it,
// so drafts, scan results and open editors don't carry over from the previous dataset or table.
function KeyedDatasetDetail() {
  const { id } = useParams()
  return <DatasetDetail key={id} />
}

function KeyedTableDetail() {
  const { tableId } = useParams()
  return <TableDetail key={tableId} />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/setup" element={<Suspense fallback={null}><Setup /></Suspense>} />
        <Route path="/login" element={<Login />} />
        <Route
          path="*"
          element={
            <RequireAuth>
              <Layout>
                <Suspense fallback={<PageLoading />}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/browse" replace />} />
                    <Route path="/browse" element={<Browse />} />
                    <Route path="/search" element={<SearchResults />} />
                    <Route path="/datasets/:id" element={<KeyedDatasetDetail />} />
                    <Route path="/datasets/:datasetId/tables/:tableId" element={<KeyedTableDetail />} />
                    <Route path="/trusted" element={<TrustedData />} />
                    <Route path="/sources" element={<RequireAdmin><Sources /></RequireAdmin>} />
                    <Route path="/users" element={<RequireAdmin><Users /></RequireAdmin>} />
                    <Route path="*" element={<Navigate to="/browse" replace />} />
                  </Routes>
                </Suspense>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
