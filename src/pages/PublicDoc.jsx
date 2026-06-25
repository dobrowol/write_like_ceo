import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'

const C = { ink: '#1A1D23', inkSoft: '#52596A', faint: '#8A92A6', line: '#E4E2DC', paper: '#FFFFFF', side: '#F6F5F1' }
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
const PALETTE = ['#0D7C6B', '#4338CA', '#B45309', '#BE185D', '#1D4ED8', '#7C3AED', '#15803D', '#C2410C']
const colorAt = (i) => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length]
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function mdToHtml(src) {
  if (!src?.trim()) return ''
  const math = []
  let s = src.replace(/(\$\$[\s\S]+?\$\$|\$[^\n$]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g, (m) => { math.push(m); return `@@M${math.length - 1}@@` })
  s = esc(s)
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\*)([^*\n]+)\*/g, '$1<em>$2</em>')
  s = s.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')
  s = s.replace(/@@M(\d+)@@/g, (_, i) => esc(math[+i]))
  return s
}
const KATEX_OPTS = { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\[', right: '\\]', display: true }, { left: '$', right: '$', display: false }, { left: '\\(', right: '\\)', display: false }], throwOnError: false }

function Rendered({ source, ready }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    el.innerHTML = mdToHtml(source)
    if (ready && window.renderMathInElement) { try { window.renderMathInElement(el, KATEX_OPTS) } catch {} }
  }, [source, ready])
  return <div ref={ref} className="pub-body" style={{ fontFamily: SERIF }} />
}

function DocNode({ node, depth, color, mathReady }) {
  const hSize = depth === 0 ? 26 : depth === 1 ? 19 : 15.5
  return (
    <>
      <section style={{ marginLeft: depth * 22, marginTop: depth === 0 ? 28 : 12, borderLeft: `3px solid ${color}`, padding: '6px 18px 12px', borderRadius: 7 }}>
        <div style={{ fontSize: hSize, fontWeight: depth === 2 ? 700 : 600, fontFamily: SERIF, color, marginBottom: 4 }}>{node.name}</div>
        {node.content?.trim() && <Rendered source={node.content} ready={mathReady} />}
      </section>
      {(node.children || []).map((c) => <DocNode key={c.id} node={c} depth={depth + 1} color={color} mathReady={mathReady} />)}
    </>
  )
}

function Stars({ value, max = 5, size = 18, onClick }) {
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

export default function PublicDoc() {
  const { id } = useParams()
  const { user } = useAuth()
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mathReady, setMathReady] = useState(false)
  const [rating, setRating] = useState(null)
  const [ratingMsg, setRatingMsg] = useState('')

  useEffect(() => {
    if (window.renderMathInElement) { setMathReady(true); return }
    const base = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9'
    if (!document.getElementById('katex-css')) {
      const l = document.createElement('link'); l.id = 'katex-css'; l.rel = 'stylesheet'; l.href = base + '/katex.min.css'; document.head.appendChild(l)
    }
    const s1 = document.createElement('script'); s1.src = base + '/katex.min.js'
    s1.onload = () => { const s2 = document.createElement('script'); s2.src = base + '/contrib/auto-render.min.js'; s2.onload = () => setMathReady(true); document.head.appendChild(s2) }
    document.head.appendChild(s1)
  }, [])

  useEffect(() => {
    api.get(`/feed/${id}`).then(d => {
      setDoc(d)
      setRating(d.userRating)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  const submitRating = async (value) => {
    if (!user) return setRatingMsg('Zaloguj się, żeby ocenić')
    if (doc.author.id === user.id) return setRatingMsg('Nie możesz oceniać własnego tekstu')
    try {
      const res = await api.post(`/feed/${id}/rate`, { value })
      setRating(res.userRating)
      setDoc(d => ({ ...d, avgRating: res.avg }))
      setRatingMsg('Ocena zapisana!')
      setTimeout(() => setRatingMsg(''), 2000)
    } catch (e) {
      setRatingMsg(e.message)
    }
  }

  if (loading) return <div style={{ padding: 48, fontFamily: SANS, color: C.faint }}>Ładowanie…</div>
  if (!doc) return (
    <div style={{ padding: 48, fontFamily: SANS, textAlign: 'center' }}>
      <p style={{ color: C.faint }}>Nie znaleziono dokumentu.</p>
      <Link to="/" style={{ color: C.ink }}>← Strona główna</Link>
    </div>
  )

  const tree = Array.isArray(doc.tree) ? doc.tree : []

  return (
    <div style={{ fontFamily: SANS, color: C.ink }}>
      <style>{`.pub-body { font-size: 17px; line-height: 1.72; color: ${C.ink}; } .pub-body p { margin: 0 0 .6em; } .pub-body p:last-child { margin: 0; } .pub-body code { background: #F0EFEA; padding: 1px 5px; border-radius: 4px; font-size: .9em; } .pub-body .katex-display { margin: .5em 0; overflow-x: auto; }`}</style>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 32px 80px' }}>

        <div style={{ marginBottom: 8 }}>
          <Link to="/" style={{ fontSize: 13, color: C.faint, textDecoration: 'none' }}>← Strona główna</Link>
        </div>

        <header style={{ marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${C.line}` }}>
          <h1 style={{ fontSize: 34, fontWeight: 700, fontFamily: SERIF, margin: '0 0 10px', color: C.ink }}>{doc.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, color: C.inkSoft }}>Autor: <strong>{doc.author.username}</strong></span>
            {doc.betaReaders.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 600, background: '#EEF2FF', color: '#4338CA', padding: '3px 10px', borderRadius: 20 }}>
                ✓ Przeszło przez {doc.betaReaders.length} beta-czytelnik{doc.betaReaders.length === 1 ? 'a' : 'ów'}
              </span>
            )}
          </div>
          {doc.betaReaders.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 13, color: C.faint }}>
              Beta-czytelnicy: {doc.betaReaders.map(br => br.user.username).join(', ')}
            </div>
          )}
        </header>

        <main>
          {tree.map((node, i) => <DocNode key={node.id || i} node={node} depth={0} color={colorAt(i)} mathReady={mathReady} />)}
        </main>

        <section style={{ marginTop: 56, paddingTop: 32, borderTop: `1px solid ${C.line}` }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Oceń ten tekst</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Stars value={rating} onClick={submitRating} size={26} />
            {doc.avgRating && (
              <span style={{ fontSize: 14, color: C.inkSoft }}>Średnia: <strong>{doc.avgRating.toFixed(1)}</strong></span>
            )}
            {ratingMsg && <span style={{ fontSize: 13, color: '#0D7C6B' }}>{ratingMsg}</span>}
          </div>
          {!user && <p style={{ marginTop: 8, fontSize: 13, color: C.faint }}><Link to="/login" style={{ color: C.ink }}>Zaloguj się</Link>, żeby ocenić.</p>}
        </section>

        {doc.reviews.length > 0 && (
          <section style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 20px' }}>
              Recenzje beta-czytelników ({doc.reviews.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {doc.reviews.map(r => (
                <div key={r.id} style={{ background: C.side, borderRadius: 10, padding: '18px 22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{r.user.username}</span>
                    <Stars value={r.rating} size={14} />
                    <span style={{ fontSize: 12, color: C.faint, marginLeft: 'auto' }}>
                      {new Date(r.createdAt).toLocaleDateString('pl-PL')}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: C.inkSoft, fontFamily: SERIF }}>{r.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
