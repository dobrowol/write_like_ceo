import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'

const C = { ink: '#1A1D23', inkSoft: '#52596A', faint: '#8A92A6', line: '#E4E2DC', paper: '#FFFFFF', side: '#F6F5F1', sideHi: '#ECEAE3' }
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"

function Stars({ value, max = 5, onClick, size = 22 }) {
  const [hover, setHover] = useState(null)
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {Array.from({ length: max }, (_, i) => i + 1).map(i => (
        <span key={i} style={{ fontSize: size, cursor: onClick ? 'pointer' : 'default', color: i <= (hover ?? value ?? 0) ? '#F59E0B' : C.line, transition: 'color .1s' }}
          onMouseEnter={() => onClick && setHover(i)} onMouseLeave={() => onClick && setHover(null)}
          onClick={() => onClick && onClick(i)}>★</span>
      ))}
    </span>
  )
}

function ReviewForm({ invitation, onReviewed }) {
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [existing, setExisting] = useState(null)

  useEffect(() => {
    api.get(`/beta/${invitation.documentId}/my-review`)
      .then(r => { if (r) { setExisting(r); setRating(r.rating); setText(r.text) } })
      .catch(() => {})
  }, [invitation.documentId])

  const submit = async (e) => {
    e.preventDefault()
    if (!rating) return setError('Wybierz ocenę')
    if (!text.trim()) return setError('Napisz recenzję')
    setSending(true); setError('')
    try {
      await api.post(`/beta/${invitation.documentId}/review`, { rating, text: text.trim() })
      onReviewed()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.inkSoft, marginBottom: 10 }}>
        {existing ? 'Twoja recenzja (możesz edytować)' : 'Napisz recenzję'}
      </div>
      <div style={{ marginBottom: 10 }}>
        <Stars value={rating} onClick={setRating} />
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={4} placeholder="Twoje wrażenia, uwagi…"
        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 14, fontFamily: SERIF, color: C.ink, resize: 'vertical', outline: 'none' }} />
      {error && <p style={{ margin: '6px 0 0', fontSize: 13, color: '#BE185D' }}>{error}</p>}
      <button type="submit" disabled={sending} style={{ marginTop: 8, padding: '8px 18px', borderRadius: 8, border: 'none', background: C.ink, color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
        {sending ? 'Wysyłam…' : existing ? 'Zaktualizuj recenzję' : 'Wyślij recenzję'}
      </button>
    </form>
  )
}

export default function BetaQueue() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [reviewedId, setReviewedId] = useState(null)

  useEffect(() => {
    if (!user) return
    api.get('/beta').then(d => { setInvitations(d); setLoading(false) }).catch(() => setLoading(false))
  }, [user])

  if (!user) return (
    <div style={{ padding: 48, textAlign: 'center', fontFamily: SANS }}>
      <p style={{ color: C.faint }}>Zaloguj się, żeby zobaczyć zaproszenia beta.</p>
      <Link to="/login" style={{ color: C.ink, fontWeight: 600 }}>Zaloguj się</Link>
    </div>
  )

  const pending = invitations.filter(i => i.status === 'PENDING')
  const accepted = invitations.filter(i => i.status === 'ACCEPTED')
  const declined = invitations.filter(i => i.status === 'DECLINED')

  const respond = async (id, action) => {
    await api.put(`/beta/${id}/${action}`)
    setInvitations(prev => prev.map(i => i.id === id ? { ...i, status: action === 'accept' ? 'ACCEPTED' : 'DECLINED' } : i))
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 48px)', background: C.side, fontFamily: SANS }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 24px 80px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: C.ink, margin: '0 0 6px' }}>Zaproszenia beta</h1>
        <p style={{ fontSize: 14, color: C.faint, margin: '0 0 36px' }}>
          Beta-czytelnicy jako pierwsi czytają tekst i zostawiają recenzję — ich nazwiska pojawiają się na opublikowanej pracy.
        </p>

        {loading && <p style={{ color: C.faint }}>Ładowanie…</p>}

        {!loading && invitations.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: C.faint }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📬</div>
            <p style={{ fontSize: 15 }}>Brak zaproszeń beta.<br />Autor musi Cię zaprosić.</p>
          </div>
        )}

        {pending.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.faint, margin: '0 0 14px' }}>
              Oczekujące ({pending.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pending.map(inv => (
                <div key={inv.id} style={{ background: C.paper, borderRadius: 10, padding: '18px 22px', border: `1px solid ${C.line}` }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: C.ink, marginBottom: 3 }}>{inv.document.title}</div>
                  <div style={{ fontSize: 13, color: C.faint, marginBottom: 14 }}>od {inv.document.author.username}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => respond(inv.id, 'accept')} style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: '#0D7C6B', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Akceptuj</button>
                    <button onClick={() => respond(inv.id, 'decline')} style={{ padding: '7px 16px', borderRadius: 7, border: `1px solid ${C.line}`, background: 'none', fontSize: 13.5, color: C.inkSoft, cursor: 'pointer' }}>Odrzuć</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {accepted.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.faint, margin: '0 0 14px' }}>
              Do przeczytania i oceny ({accepted.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {accepted.map(inv => (
                <div key={inv.id} style={{ background: C.paper, borderRadius: 10, padding: '18px 22px', border: `1px solid ${C.line}` }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: C.ink, marginBottom: 3 }}>{inv.document.title}</div>
                  <div style={{ fontSize: 13, color: C.faint, marginBottom: 12 }}>od {inv.document.author.username}</div>
                  <Link to={`/beta/${inv.documentId}`} style={{
                    display: 'inline-block', padding: '6px 14px', borderRadius: 7,
                    border: `1px solid ${C.line}`, textDecoration: 'none', fontSize: 13.5, color: C.ink,
                  }}>Czytaj dokument →</Link>

                  {(reviewedId === inv.id || true) && (
                    <ReviewForm invitation={inv} onReviewed={() => setReviewedId(inv.id)} />
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {declined.length > 0 && (
          <section>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: C.faint, margin: '0 0 10px' }}>Odrzucone</h2>
            {declined.map(inv => (
              <div key={inv.id} style={{ fontSize: 13, color: C.faint, padding: '6px 0' }}>
                {inv.document.title} (od {inv.document.author.username})
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
