import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useState, useEffect } from 'react'
import { api } from '../api/client.js'

const C = { ink: '#1A1D23', inkSoft: '#52596A', faint: '#8A92A6', line: '#E4E2DC', paper: '#FFFFFF', side: '#F6F5F1' }
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

export default function Navbar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!user) return
    api.get('/beta').then(list => {
      setPendingCount(list.filter(i => i.status === 'PENDING').length)
    }).catch(() => {})
  }, [user, location.pathname])

  const handleLogout = () => { logout(); navigate('/') }

  const linkStyle = (path) => ({
    textDecoration: 'none',
    fontSize: 13.5,
    fontWeight: 500,
    color: location.pathname === path ? C.ink : C.inkSoft,
    padding: '4px 10px',
    borderRadius: 6,
    background: location.pathname === path ? C.side : 'transparent',
    transition: 'color .12s, background .12s',
  })

  return (
    <nav style={{
      height: 48,
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      borderBottom: `1px solid ${C.line}`,
      background: C.paper,
      fontFamily: SANS,
      gap: 8,
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <Link to="/" style={{ textDecoration: 'none', fontWeight: 700, fontSize: 15, color: C.ink, marginRight: 8 }}>
        WriteLikeCEO
      </Link>

      <Link to="/" style={linkStyle('/')}>Strona główna</Link>
      {user && <Link to="/editor" style={linkStyle('/editor')}>Edytor</Link>}
      {user && (
        <Link to="/beta" style={{ ...linkStyle('/beta'), position: 'relative' }}>
          Beta{pendingCount > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4, background: '#BE185D', color: '#fff',
              borderRadius: 9, fontSize: 10, fontWeight: 700, padding: '1px 5px', lineHeight: 1.4,
            }}>{pendingCount}</span>
          )}
        </Link>
      )}

      <span style={{ flex: 1 }} />

      {user ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: C.inkSoft }}>{user.username}</span>
          <button onClick={handleLogout} style={{
            background: 'none', border: `1px solid ${C.line}`, borderRadius: 6,
            padding: '4px 10px', fontSize: 13, color: C.inkSoft, cursor: 'pointer',
          }}>Wyloguj</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/login" style={{
            textDecoration: 'none', fontSize: 13.5, color: C.inkSoft,
            padding: '4px 12px', borderRadius: 6, border: `1px solid ${C.line}`,
          }}>Zaloguj</Link>
          <Link to="/register" style={{
            textDecoration: 'none', fontSize: 13.5, color: '#fff',
            padding: '4px 12px', borderRadius: 6, background: C.ink,
          }}>Zarejestruj</Link>
        </div>
      )}
    </nav>
  )
}
