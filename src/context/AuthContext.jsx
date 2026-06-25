import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api/client.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setLoading(false); return }
    api.get('/auth/me')
      .then(u => { setUser(u); setLoading(false) })
      .catch(() => { localStorage.removeItem('token'); setLoading(false) })
  }, [])

  const login = async (email, password) => {
    const { user: u, token } = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', token)
    setUser(u)
    return u
  }

  const register = async (email, username, password) => {
    const { user: u, token } = await api.post('/auth/register', { email, username, password })
    localStorage.setItem('token', token)
    setUser(u)
    return u
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
