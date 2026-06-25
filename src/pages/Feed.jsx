import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'

const C = { ink: '#1A1D23', inkSoft: '#52596A', faint: '#8A92A6', line: '#E4E2DC', paper: '#FFFFFF', side: '#F6F5F1', sideHi: '#ECEAE3' }
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"

function Stars({ value, max = 5 }) {
  if (!value) return <span style={{ color: C.faint, fontSize: 13 }}>brak ocen</span>
  return (
    <span style={{ fontSize: 13.5 }}>
      {'★'.repeat(Math.round(value))}{'☆'.repeat(max - Math.round(value))}
      <span style={{ color: C.inkSoft, marginLeft: 5, fontSize: 13 }}>{value.toFixed(1)}</span>
    </span>
  )
}

function DocCard({ doc }) {
  const fmtDate = (d) => new Date(d).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <Link to={`/d/${doc.id}`} style={{ textDecoration: 'none' }}>
      <article style={{
        background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10,
        padding: '22px 26px', transition: 'box-shadow .18s, border-color .18s',
        cursor: 'pointer',
      }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.08)'; e.currentTarget.style.borderColor = '#C8C5BC' }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = C.line }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: '0 0 5px', fontSize: 18, fontWeight: 700, color: C.ink, fontFamily: SERIF }}>{doc.title}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: C.inkSoft }}>{doc.author.username}</span>
              <span style={{ color: C.faint, fontSize: 12 }}>·</span>
              <span style={{ fontSize: 12, color: C.faint }}>{fmtDate(doc.updatedAt)}</span>
              {doc.hasBetaReaders && (
                <>
                  <span style={{ color: C.faint, fontSize: 12 }}>·</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, letterSpacing: '.05em',
                    background: '#EEF2FF', color: '#4338CA', padding: '2px 8px', borderRadius: 20,
                  }}>
                    ✓ beta-czytelnicy ({doc.betaReaderCount})
                  </span>
                </>
              )}
            </div>
            {doc.excerpt && (
              <p style={{ margin: 0, fontSize: 14.5, color: C.inkSoft, lineHeight: 1.65, fontFamily: SERIF }}>
                {doc.excerpt}{doc.excerpt.length >= 220 ? '…' : ''}
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <Stars value={doc.avgRating} />
            {doc.reviewCount > 0 && (
              <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>{doc.reviewCount} recenzj{doc.reviewCount === 1 ? 'a' : doc.reviewCount < 5 ? 'e' : 'i'}</div>
            )}
          </div>
        </div>
      </article>
    </Link>
  )
}

export default function Feed() {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    api.get('/feed').then(d => { setDocs(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <div style={{ minHeight: 'calc(100vh - 48px)', background: C.side, fontFamily: SANS }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>
        <header style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: C.ink, margin: '0 0 8px', fontFamily: SERIF }}>
            Opublikowane prace
          </h1>
          <p style={{ fontSize: 15, color: C.inkSoft, margin: 0 }}>
            Odkryj teksty pisarzy z naszej społeczności.
          </p>
          {!user && (
            <p style={{ marginTop: 12, fontSize: 14, color: C.faint }}>
              <Link to="/register" style={{ color: C.ink, fontWeight: 600 }}>Zarejestruj się</Link>, żeby pisać, czytać beta i oceniać.
            </p>
          )}
        </header>

        {loading ? (
          <p style={{ color: C.faint, fontSize: 14 }}>Ładowanie…</p>
        ) : docs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: C.faint }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✍️</div>
            <p style={{ fontSize: 15 }}>Brak opublikowanych prac.<br />Zaloguj się i opublikuj pierwszą!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {docs.map(d => <DocCard key={d.id} doc={d} />)}
          </div>
        )}
      </div>
    </div>
  )
}
