import { lazy, Suspense, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Browse from './pages/Browse'
import SearchResults from './pages/SearchResults'
import DatasetDetail from './pages/DatasetDetail'
import TableDetail from './pages/TableDetail'
import TrustedData from './pages/TrustedData'
import Sources from './pages/Sources'
import Users from './pages/Users'
import Login from './pages/Login'
import { AuthProvider, isAdmin, useAuth } from './contexts/AuthContext'

const Setup = lazy(() => import('./pages/Setup'))

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return isAdmin(user) ? <>{children}</> : <Navigate to="/browse" replace />
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
                <Routes>
                  <Route path="/" element={<Navigate to="/browse" replace />} />
                  <Route path="/browse" element={<Browse />} />
                  <Route path="/search" element={<SearchResults />} />
                  <Route path="/datasets/:id" element={<DatasetDetail />} />
                  <Route path="/datasets/:datasetId/tables/:tableId" element={<TableDetail />} />
                  <Route path="/trusted" element={<TrustedData />} />
                  <Route path="/sources" element={<RequireAdmin><Sources /></RequireAdmin>} />
                  <Route path="/users" element={<RequireAdmin><Users /></RequireAdmin>} />
                  <Route path="*" element={<Navigate to="/browse" replace />} />
                </Routes>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
