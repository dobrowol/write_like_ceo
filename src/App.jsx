import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import Navbar from './components/Navbar.jsx'
import Feed from './pages/Feed.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import PublicDoc from './pages/PublicDoc.jsx'
import BetaQueue from './pages/BetaQueue.jsx'
import BetaDoc from './pages/BetaDoc.jsx'
import Edytor from './edytor.jsx'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <Routes>
        <Route path="/" element={<Feed />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/d/:id" element={<PublicDoc />} />
        <Route path="/beta/:documentId" element={<ProtectedRoute><BetaDoc /></ProtectedRoute>} />
        <Route path="/beta" element={<ProtectedRoute><BetaQueue /></ProtectedRoute>} />
        <Route path="/editor" element={<ProtectedRoute><Edytor /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
