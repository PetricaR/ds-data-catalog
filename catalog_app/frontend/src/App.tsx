import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Browse from './pages/Browse'
import SearchResults from './pages/SearchResults'
import DatasetDetail from './pages/DatasetDetail'
import TableDetail from './pages/TableDetail'
import TrustedData from './pages/TrustedData'
import Sources from './pages/Sources'
import Login from './pages/Login'
import { AuthProvider } from './contexts/AuthContext'

const Setup = lazy(() => import('./pages/Setup'))

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/setup" element={<Suspense fallback={null}><Setup /></Suspense>} />
        <Route path="/login" element={<Login />} />
        <Route
          path="*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/browse" replace />} />
                <Route path="/browse" element={<Browse />} />
                <Route path="/search" element={<SearchResults />} />
                <Route path="/datasets/:id" element={<DatasetDetail />} />
                <Route path="/datasets/:datasetId/tables/:tableId" element={<TableDetail />} />
                <Route path="/trusted" element={<TrustedData />} />
                <Route path="/sources" element={<Sources />} />
                <Route path="*" element={<Navigate to="/browse" replace />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
