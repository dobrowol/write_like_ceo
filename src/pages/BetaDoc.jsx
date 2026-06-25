import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client.js'

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
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\*)([^*\n]+)\*/g, '$1<em>$2</em>')
  s = s.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')
  s = s.replace(/@@M(\d+)@@/g, (_, i) => esc(math[+i]))
  return s
}

function Rendered({ source, ready }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    el.innerHTML = mdToHtml(source)
    if (ready && window.renderMathInElement) { try { window.renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false }) } catch {} }
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

export default function BetaDoc() {
  const { id } = useParams()
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mathReady, setMathReady] = useState(false)
  const [error, setError] = useState('')

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
    api.get(`/documents/${id}`).then(d => { setDoc(d); setLoading(false) }).catch(e => { setError(e.message); setLoading(false) })
  }, [id])

  if (loading) return <div style={{ padding: 48, fontFamily: SANS, color: C.faint }}>Ładowanie…</div>
  if (error || !doc) return (
    <div style={{ padding: 48, textAlign: 'center', fontFamily: SANS }}>
      <p style={{ color: C.faint }}>{error || 'Brak dostępu do dokumentu'}</p>
      <Link to="/beta" style={{ color: C.ink }}>← Zaproszenia beta</Link>
    </div>
  )

  const tree = Array.isArray(doc.tree) ? doc.tree : []

  return (
    <div style={{ fontFamily: SANS, color: C.ink }}>
      <style>{`.pub-body { font-size: 17px; line-height: 1.72; color: ${C.ink}; } .pub-body p { margin: 0 0 .6em; } .pub-body code { background: #F0EFEA; padding: 1px 5px; border-radius: 4px; font-size: .9em; }`}</style>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 32px 80px' }}>
        <div style={{ marginBottom: 8 }}>
          <Link to="/beta" style={{ fontSize: 13, color: C.faint, textDecoration: 'none' }}>← Zaproszenia beta</Link>
        </div>
        <div style={{ marginBottom: 24, padding: '12px 18px', background: '#EEF2FF', borderRadius: 8, fontSize: 13, color: '#4338CA' }}>
          Jesteś beta-czytelnikiem tego dokumentu. Po przeczytaniu wróć do listy zaproszeń i zostaw recenzję.
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 700, fontFamily: SERIF, margin: '0 0 8px', color: C.ink }}>{doc.title}</h1>
        <p style={{ fontSize: 13, color: C.faint, margin: '0 0 32px' }}>Autor: {doc.author?.username}</p>
        {tree.map((node, i) => <DocNode key={node.id || i} node={node} depth={0} color={colorAt(i)} mathReady={mathReady} />)}
      </div>
    </div>
  )
}
