import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const C = { ink: '#1A1D23', inkSoft: '#52596A', faint: '#8A92A6', line: '#E4E2DC', paper: '#FFFFFF', side: '#F6F5F1' }
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/editor')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 48px)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.side, fontFamily: SANS }}>
      <div style={{ background: C.paper, borderRadius: 12, padding: '40px 44px', width: '100%', maxWidth: 380, boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, margin: '0 0 6px' }}>Zaloguj się</h1>
        <p style={{ fontSize: 13.5, color: C.faint, margin: '0 0 28px' }}>
          Nie masz konta? <Link to="/register" style={{ color: C.ink }}>Zarejestruj się</Link>
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={labelStyle}>
            <span style={labelText}>Email</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoFocus style={inputStyle} placeholder="ty@przykład.pl" />
          </label>
          <label style={labelStyle}>
            <span style={labelText}>Hasło</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required style={inputStyle} placeholder="••••••••" />
          </label>

          {error && <p style={{ margin: 0, fontSize: 13, color: '#BE185D', background: '#FDF2F7', padding: '8px 12px', borderRadius: 6 }}>{error}</p>}

          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? 'Logowanie…' : 'Zaloguj'}
          </button>
        </form>
      </div>
    </div>
  )
}

const labelStyle = { display: 'flex', flexDirection: 'column', gap: 5 }
const labelText = { fontSize: 13, fontWeight: 600, color: '#52596A' }
const inputStyle = {
  padding: '9px 12px', borderRadius: 8, border: '1px solid #E4E2DC',
  fontSize: 14, outline: 'none', fontFamily: 'inherit', color: '#1A1D23',
  transition: 'border-color .15s',
}
const btnStyle = {
  marginTop: 6, padding: '10px', borderRadius: 8, border: 'none',
  background: '#1A1D23', color: '#fff', fontSize: 14, fontWeight: 600,
  cursor: 'pointer', transition: 'filter .15s',
}
