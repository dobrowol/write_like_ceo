import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useAuth } from "./context/AuthContext.jsx";
import { api } from "./api/client.js";

// ── Typografia / paleta ─────────────────────────────────────────────
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
const C = { ink: "#1A1D23", inkSoft: "#52596A", faint: "#8A92A6", line: "#E4E2DC", paper: "#FFFFFF", side: "#F6F5F1", sideHi: "#ECEAE3" };
const PALETTE = ["#0D7C6B", "#4338CA", "#B45309", "#BE185D", "#1D4ED8", "#7C3AED", "#15803D", "#C2410C"];
const colorAt = (i) => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
const MAX_DEPTH = 2;

const uid = () => "n_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = (x) => JSON.parse(JSON.stringify(x));

// ── Operacje na drzewie ─────────────────────────────────────────────
const kids = (n) => n.children || [];
const subDepth = (n) => (kids(n).length ? 1 + Math.max(...kids(n).map(subDepth)) : 0);
const contains = (n, id) => n.id === id || kids(n).some((c) => contains(c, id));
function removeById(tree, id) {
  let removed = null;
  const rec = (arr) => { const out = []; for (const n of arr) { if (n.id === id) { removed = n; continue; } out.push({ ...n, children: rec(kids(n)) }); } return out; };
  return { tree: rec(tree), removed };
}
function insertSibling(tree, targetId, node, position) {
  const rec = (arr) => { const out = []; for (const n of arr) { if (n.id === targetId) { if (position === "before") out.push(node); out.push({ ...n, children: rec(kids(n)) }); if (position === "after") out.push(node); } else out.push({ ...n, children: rec(kids(n)) }); } return out; };
  return rec(tree);
}
function insertChild(tree, targetId, node) {
  const rec = (arr) => arr.map((n) => (n.id === targetId ? { ...n, children: [...kids(n), node] } : { ...n, children: rec(kids(n)) }));
  return rec(tree);
}
function mapTree(nodes, id, fn) { return nodes.map((n) => (n.id === id ? fn({ ...n, children: kids(n) }) : { ...n, children: mapTree(kids(n), id, fn) })); }
const countWords = (nodes) => nodes.reduce((a, n) => a + (n.content.trim() ? n.content.trim().split(/\s+/).length : 0) + countWords(kids(n)), 0);

// ── Eksport ──────────────────────────────────────────────────────────
function buildMd(nodes, depth = 0) {
  const h = "#".repeat(Math.min(depth + 1, 6)); const out = [];
  for (const n of nodes) { out.push(h + " " + n.name); if (n.content.trim()) out.push(n.content.trim()); if (kids(n).length) out.push(buildMd(kids(n), depth + 1)); }
  return out.join("\n\n");
}
function buildTxt(nodes, depth = 0) {
  const pad = "    ".repeat(depth); const out = [];
  for (const n of nodes) { out.push(pad + n.name); if (n.content.trim()) out.push(n.content.trim().split("\n").map((l) => pad + l).join("\n")); if (kids(n).length) out.push(buildTxt(kids(n), depth + 1)); }
  return out.join("\n\n");
}
function download(name, text) { const b = new Blob([text], { type: "text/plain;charset=utf-8" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }

// ── Warstwa zapisu: pamięć claude.ai → lokalnie localStorage ─────────
const hasLocal = () => { try { const k = "__edt"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; } catch { return false; } };
const persistent = () => (typeof window !== "undefined" && window.storage) || hasLocal();
const store = {
  load: async (key) => {
    if (typeof window !== "undefined" && window.storage) { try { const r = await window.storage.get(key); return r && r.value != null ? r.value : null; } catch { return null; } }
    try { return localStorage.getItem(key); } catch { return null; }
  },
  save: async (key, value) => {
    if (typeof window !== "undefined" && window.storage) { await window.storage.set(key, value); return; }
    localStorage.setItem(key, value);
  },
};
async function writeHandle(handle, text) { const w = await handle.createWritable(); await w.write(text); await w.close(); }
function parseMd(text) {
  const roots = []; const stack = []; let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const m = /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) {
      const depth = m[1].length - 1;
      const node = { id: uid(), name: m[2].trim() || "Bez nazwy", content: "", children: [] };
      if (depth > 0 && stack[depth - 1]) stack[depth - 1].children.push(node); else roots.push(node);
      stack[depth] = node; stack.length = depth + 1; cur = node;
    } else if (cur) { cur.content += (cur.content ? "\n" : "") + line; }
    else if (line.trim()) { const node = { id: uid(), name: "Tekst", content: line, children: [] }; roots.push(node); stack[0] = node; stack.length = 1; cur = node; }
  }
  const trim = (n) => { n.content = n.content.replace(/^\n+/, "").replace(/\n+$/, ""); (n.children || []).forEach(trim); };
  roots.forEach(trim);
  return roots.length ? roots : [{ id: uid(), name: "Import", content: text.trim(), children: [] }];
}

// ── Renderowanie: chroń wzory, potem lekki Markdown ──────────────────
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function mdToHtml(src) {
  if (!src || !src.trim()) return "";
  const math = [];
  let s = src.replace(/(\$\$[\s\S]+?\$\$|\$[^\n$]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g, (m) => { math.push(m); return `@@M${math.length - 1}@@`; });
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>")
       .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
       .replace(/(^|[^*])\*(?!\*)([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  s = s.replace(/@@M(\d+)@@/g, (_, i) => esc(math[+i]));
  return s;
}
const KATEX_OPTS = {
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "\\[", right: "\\]", display: true },
    { left: "$", right: "$", display: false },
    { left: "\\(", right: "\\)", display: false },
  ],
  throwOnError: false,
};

const seed = () => [{
  id: uid(), name: "Wprowadzenie",
  content:
    "Cały dokument widać naraz. Obsługiwana jest notacja LaTeX: w tekście $\\sigma(z) = \\frac{1}{1+e^{-z}}$, a w osobnej linii:\n\n$$\\nabla_\\theta J(\\theta) = \\frac{1}{m} \\sum_{i=1}^{m} \\left( h_\\theta(x^{(i)}) - y^{(i)} \\right) x^{(i)}$$\n\nDziała też lekki Markdown: **pogrubienie**, *kursywa*, `kod`. Kliknij ten akapit, żeby zobaczyć i edytować źródło.",
  children: [],
}];

const PHASE_LABELS = { DRAFT_1: "1. pisanie", DRAFT_2: "2. pisanie", DRAFT_3: "3. pisanie", BETA: "Beta czytelnicy", PUBLISHED: "Opublikowane" };
const PHASE_NEXT = { DRAFT_1: "DRAFT_2", DRAFT_2: "DRAFT_3", DRAFT_3: "BETA", BETA: "PUBLISHED" };
const PHASE_COLORS = { DRAFT_1: "#52596A", DRAFT_2: "#B45309", DRAFT_3: "#0D7C6B", BETA: "#4338CA", PUBLISHED: "#15803D" };

export default function Edytor() {
  const { user } = useAuth();
  const [docs, setDocs] = useState(() => [{ id: uid(), title: "Dokument", tree: seed() }]);
  const [activeId, setActiveId] = useState(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const [docRenaming, setDocRenaming] = useState(false);
  const [selId, setSelId] = useState(null);
  const [scrollReq, setScrollReq] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [drag, setDrag] = useState(null);
  const [drop, setDrop] = useState(null);
  const [status, setStatus] = useState("…");
  const [expOpen, setExpOpen] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [mathReady, setMathReady] = useState(false);
  const [betaEmail, setBetaEmail] = useState("");
  const [betaMsg, setBetaMsg] = useState("");
  const [betaReaders, setBetaReaders] = useState([]);
  const loaded = useRef(false);
  const blocks = useRef({});
  const fileHandle = useRef(null);
  const active = docs.find((d) => d.id === activeId) || docs[0];
  const doc = active ? active.tree : [];
  const setDoc = (u) => setDocs((prev) => prev.map((d) => (active && d.id === active.id ? { ...d, tree: typeof u === "function" ? u(d.tree) : u } : d)));

  // załaduj KaTeX (CDN) — działa lokalnie i w podglądzie
  useEffect(() => {
    if (window.renderMathInElement) { setMathReady(true); return; }
    const base = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9";
    if (!document.getElementById("katex-css")) {
      const l = document.createElement("link"); l.id = "katex-css"; l.rel = "stylesheet"; l.href = base + "/katex.min.css"; document.head.appendChild(l);
    }
    const s1 = document.createElement("script"); s1.src = base + "/katex.min.js";
    s1.onload = () => { const s2 = document.createElement("script"); s2.src = base + "/contrib/auto-render.min.js"; s2.onload = () => setMathReady(true); document.head.appendChild(s2); };
    document.head.appendChild(s1);
  }, []);

  // trwałość — API gdy zalogowany, localStorage gdy nie
  useEffect(() => {
    if (!user) {
      (async () => {
        try {
          const raw = await store.load("workspace");
          let ws = raw ? JSON.parse(raw) : null;
          if (!ws) {
            const old = await store.load("dokument");
            if (old) { const t = JSON.parse(old); if (Array.isArray(t) && t.length) ws = { docs: [{ id: uid(), title: "Dokument", tree: t }], activeId: null }; }
          }
          if (ws && Array.isArray(ws.docs) && ws.docs.length) {
            setDocs(ws.docs);
            const aid = ws.activeId && ws.docs.some((d) => d.id === ws.activeId) ? ws.activeId : ws.docs[0].id;
            setActiveId(aid);
            const at = ws.docs.find((d) => d.id === aid);
            setSelId(at && at.tree[0] ? at.tree[0].id : null);
          } else { setActiveId(docs[0].id); setSelId(docs[0].tree[0] ? docs[0].tree[0].id : null); }
        } catch { setActiveId(docs[0].id); setSelId(docs[0].tree[0] ? docs[0].tree[0].id : null); }
        finally { setStatus(persistent() ? "zapisane" : "pamięć sesji"); loaded.current = true; }
      })();
      return;
    }
    loaded.current = false;
    setStatus("ładowanie…");
    api.get("/documents").then(async (apiDocs) => {
      let localDocs;
      if (apiDocs.length === 0) {
        const d = await api.post("/documents", { title: "Dokument", tree: seed() });
        localDocs = [{ id: d.id, title: d.title, tree: d.tree || [], phase: d.phase }];
      } else {
        localDocs = apiDocs.map((d) => ({ id: d.id, title: d.title, tree: d.tree || [], phase: d.phase }));
      }
      setDocs(localDocs);
      setActiveId(localDocs[0].id);
      setSelId(localDocs[0].tree[0] ? localDocs[0].tree[0].id : null);
      setStatus("zapisane");
      loaded.current = true;
    }).catch(() => { setStatus("błąd połączenia"); loaded.current = true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!loaded.current) return;
    if (!user) {
      setStatus("zapisuję…");
      const t = setTimeout(async () => {
        try {
          await store.save("workspace", JSON.stringify({ docs, activeId }));
          if (fileHandle.current) { try { await writeHandle(fileHandle.current, JSON.stringify({ version: 1, docs }, null, 2)); } catch {} }
          setStatus(fileHandle.current ? `zapisano: ${fileName}` : "zapisane");
        } catch { setStatus("pamięć sesji"); }
      }, 450);
      return () => clearTimeout(t);
    }
    setStatus("zapisuję…");
    const t = setTimeout(async () => {
      const activeDoc = docs.find((d) => d.id === activeId);
      if (!activeDoc || !activeId) return;
      try {
        await api.put(`/documents/${activeId}`, { title: activeDoc.title, tree: activeDoc.tree });
        setStatus("zapisane");
      } catch { setStatus("błąd zapisu"); }
    }, 600);
    return () => clearTimeout(t);
  }, [docs, activeId, fileName]);
  useEffect(() => { if (scrollReq && blocks.current[scrollReq.id]) blocks.current[scrollReq.id].scrollIntoView({ behavior: "smooth", block: "start" }); }, [scrollReq]);

  const goTo = (id) => { setSelId(id); setRenaming(null); setScrollReq({ id, n: Date.now() }); };
  const rename = (id, name) => setDoc((d) => mapTree(d, id, (n) => ({ ...n, name })));
  const setContent = (id, content) => setDoc((d) => mapTree(d, id, (n) => ({ ...n, content })));
  const addParagraph = () => { const n = { id: uid(), name: "Nowy paragraf", content: "", children: [] }; setDoc((d) => [...d, n]); goTo(n.id); setRenaming(n.id); };
  const addChild = (parentId, parentDepth) => { const n = { id: uid(), name: parentDepth === 0 ? "Nowy podparagraf" : "Nowy podpunkt", content: "", children: [] }; setDoc((d) => insertChild(d, parentId, n)); goTo(n.id); setRenaming(n.id); };
  const remove = (node) => { if (!window.confirm(`Usunąć „${node.name}"${kids(node).length ? " wraz z zawartością" : ""}?`)) return; const { tree, removed } = removeById(doc, node.id); setDoc(tree); if (removed && contains(removed, selId)) setSelId(null); };

  // dokumenty
  const newDocument = async () => {
    if (user) {
      try {
        const d = await api.post("/documents", { title: "Nowy dokument", tree: [] });
        const nd = { id: d.id, title: d.title, tree: [], phase: d.phase };
        setDocs((p) => [...p, nd]); setActiveId(nd.id); setSelId(null); setRenaming(null); setDocsOpen(false); setDocRenaming(true);
      } catch { setStatus("błąd tworzenia dokumentu"); }
      return;
    }
    const d = { id: uid(), title: "Nowy dokument", tree: [] }; setDocs((p) => [...p, d]); setActiveId(d.id); setSelId(null); setRenaming(null); setDocsOpen(false); setDocRenaming(true);
  };
  const switchDoc = (id) => { setActiveId(id); setDocsOpen(false); setRenaming(null); setBetaMsg(""); setBetaReaders([]); const d = docs.find((x) => x.id === id); setSelId(d && d.tree[0] ? d.tree[0].id : null); };
  const renameDoc = (title) => setDocs((p) => p.map((d) => (active && d.id === active.id ? { ...d, title } : d)));
  const deleteDoc = async (id) => {
    const d = docs.find((x) => x.id === id); if (!d) return;
    if (!window.confirm(`Usunąć dokument „${d.title}" wraz z całą zawartością?`)) return;
    if (user) { try { await api.delete(`/documents/${id}`); } catch {} }
    setDocs((prev) => {
      const left = prev.filter((x) => x.id !== id);
      if (left.length === 0) {
        if (user) { api.post("/documents", { title: "Dokument", tree: [] }).then((nd) => { setDocs([{ id: nd.id, title: nd.title, tree: [], phase: nd.phase }]); setActiveId(nd.id); setSelId(null); }); return prev; }
        const nd = { id: uid(), title: "Dokument", tree: [] }; setActiveId(nd.id); setSelId(null); return [nd];
      }
      if (id === activeId) { setActiveId(left[0].id); setSelId(left[0].tree[0] ? left[0].tree[0].id : null); }
      return left;
    });
    setDocsOpen(false);
  };

  const advancePhase = async () => {
    if (!active || !user) return;
    try {
      const d = await api.post(`/documents/${active.id}/advance`);
      setDocs((p) => p.map((doc) => doc.id === d.id ? { ...doc, phase: d.phase } : doc));
      if (d.phase === "BETA") { setBetaMsg(""); setBetaReaders([]); }
    } catch (e) { setStatus(e.message); }
  };
  const retreatPhase = async () => {
    if (!active || !user) return;
    try {
      const d = await api.post(`/documents/${active.id}/retreat`);
      setDocs((p) => p.map((doc) => doc.id === d.id ? { ...doc, phase: d.phase } : doc));
    } catch (e) { setStatus(e.message); }
  };
  const inviteBeta = async () => {
    if (!betaEmail.trim() || !active) return;
    try {
      const reader = await api.post(`/documents/${active.id}/invite`, { email: betaEmail.trim() });
      setBetaReaders((p) => [...p.filter((r) => r.id !== reader.id), reader]);
      setBetaEmail(""); setBetaMsg(`Zaproszono ${reader.user.username}`);
      setTimeout(() => setBetaMsg(""), 3000);
    } catch (e) { setBetaMsg(e.message); }
  };
  useEffect(() => {
    if (!user || !active || active.phase !== "BETA") return;
    api.get(`/documents/${active.id}/beta`).then(setBetaReaders).catch(() => {});
  }, [active?.id, active?.phase, user]);

  // drag & drop
  const canDrop = (node, targetId, targetDepth, zone) => {
    if (!node || node.id === targetId || contains(node, targetId)) return false;
    if (zone === "into" && targetDepth >= MAX_DEPTH) return false;
    const landing = zone === "into" ? targetDepth + 1 : targetDepth;
    return landing + subDepth(node) <= MAX_DEPTH;
  };
  const onDragStart = (e, node) => { setDrag({ id: node.id, node }); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", node.id); } catch {} };
  const overRow = (e, node, depth) => {
    if (!drag) return; e.preventDefault(); e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect(); const y = (e.clientY - r.top) / r.height;
    let zone = y < 0.3 ? "before" : y > 0.7 ? "after" : "into";
    if (zone === "into" && !canDrop(drag.node, node.id, depth, "into")) zone = y < 0.5 ? "before" : "after";
    if (!canDrop(drag.node, node.id, depth, zone)) { setDrop(null); return; }
    setDrop({ id: node.id, zone });
  };
  const doDrop = (e) => { e.preventDefault(); if (!drag || !drop) return clearDrag(); const { tree, removed } = removeById(doc, drag.id); const node = clone(removed); setDoc(drop.zone === "into" ? insertChild(tree, drop.id, node) : insertSibling(tree, drop.id, node, drop.zone)); clearDrag(); };
  const clearDrag = () => { setDrag(null); setDrop(null); };
  const dropShadow = (id) => { if (!drop || drop.id !== id) return "none"; if (drop.zone === "before") return `inset 0 2px 0 0 ${C.ink}`; if (drop.zone === "after") return `inset 0 -2px 0 0 ${C.ink}`; return `inset 0 0 0 2px ${C.ink}`; };

  const words = countWords(doc);
  const doExport = (kind) => {
    setExpOpen(false);
    if (kind === "copy") navigator.clipboard?.writeText(buildMd(doc)).then(() => { setStatus("skopiowano"); setTimeout(() => setStatus("zapisane"), 1400); }).catch(() => {});
    else if (kind === "md") download(`${(active && active.title) || "dokument"}.md`, buildMd(doc));
    else download(`${(active && active.title) || "dokument"}.txt`, buildTxt(doc));
  };

  // trwały plik na dysku / kopie
  const fsSupported = typeof window !== "undefined" && "showSaveFilePicker" in window;
  const exportJson = () => download("zeszyt.json", JSON.stringify({ version: 1, docs }, null, 2));
  const loadWorkspace = (ws) => {
    if (ws && Array.isArray(ws.docs) && ws.docs.length) { setDocs(ws.docs); setActiveId(ws.docs[0].id); setSelId(ws.docs[0].tree[0] ? ws.docs[0].tree[0].id : null); setRenaming(null); return true; }
    return false;
  };
  const pickImport = () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,.md,.txt";
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const text = await f.text();
      if (/\.json$/i.test(f.name)) { try { if (!loadWorkspace(JSON.parse(text))) window.alert("Plik nie zawiera dokumentów."); } catch { window.alert("Nieprawidłowy plik .json"); } }
      else { const tree = parseMd(text); const d = { id: uid(), title: f.name.replace(/\.(md|txt)$/i, "") || "Import", tree }; setDocs((p) => [...p, d]); setActiveId(d.id); setSelId(tree[0] ? tree[0].id : null); }
    };
    inp.click();
  };
  const saveToDisk = async () => {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: "zeszyt.json", types: [{ description: "Zeszyt edytora", accept: { "application/json": [".json"] } }] });
      await writeHandle(handle, JSON.stringify({ version: 1, docs }, null, 2));
      fileHandle.current = handle; setFileName(handle.name);
    } catch {}
  };
  const openFromDisk = async () => {
    try {
      const [handle] = await window.showOpenFilePicker({ types: [{ accept: { "application/json": [".json"] } }] });
      const ws = JSON.parse(await (await handle.getFile()).text());
      if (loadWorkspace(ws)) { fileHandle.current = handle; setFileName(handle.name); }
    } catch {}
  };

  // Ctrl+S / Cmd+S → zapis do podłączonego pliku, w przeciwnym razie okno wyboru pliku
  useEffect(() => {
    const onKey = async (e) => {
      if (!(e.key === "s" || e.key === "S") || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (fileHandle.current) {
        try { await writeHandle(fileHandle.current, JSON.stringify({ version: 1, docs }, null, 2)); setStatus(`zapisano: ${fileName}`); }
        catch { setStatus("błąd zapisu"); }
      } else if (fsSupported) { saveToDisk(); }
      else { exportJson(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docs, fileName, fsSupported]);

  const dnd = { onDragStart, overRow, doDrop, clearDrag, dropShadow, dragId: drag && drag.id };
  const api = { selId, renaming, goTo, setRenaming, rename, addChild, remove };

  return (
    <div style={{ height: "calc(100vh - 48px)", display: "flex", fontFamily: SANS, color: C.ink, background: C.paper }} onClick={() => { if (expOpen) setExpOpen(false); if (docsOpen) setDocsOpen(false); }}>
      <style>{css}</style>

      <aside style={{ width: 304, flexShrink: 0, background: C.side, borderRight: `1px solid ${C.line}`, display: "flex", flexDirection: "column" }}>
        <div className="docbar" onClick={(e) => e.stopPropagation()}>
          {docRenaming ? (
            <input autoFocus className="doctitle-input" defaultValue={(active && active.title) || ""} onFocus={(e) => e.target.select()}
              onBlur={(e) => { renameDoc(e.target.value.trim() || (active && active.title)); setDocRenaming(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { renameDoc(e.target.value.trim() || (active && active.title)); setDocRenaming(false); } if (e.key === "Escape") setDocRenaming(false); }} />
          ) : (
            <button className="doctitle" onClick={() => setDocsOpen((o) => !o)} onDoubleClick={() => setDocRenaming(true)} title="Klik: przełącz dokument · dwuklik: zmień nazwę">
              <span className="doctitle-name">{(active && active.title) || "Dokument"}</span>
              <span className="caret">▾</span>
            </button>
          )}
          {docsOpen && (
            <div className="popover docs-pop">
              {docs.map((d) => (
                <div key={d.id} className={"doc-row" + (d.id === activeId ? " active" : "")}>
                  <button className="doc-pick" onClick={() => switchDoc(d.id)}>{d.title}</button>
                  {d.id === activeId && <button className="mini" title="Zmień nazwę" onClick={() => { setDocsOpen(false); setDocRenaming(true); }}><Pencil /></button>}
                  <button className="mini" title="Usuń dokument" onClick={() => deleteDoc(d.id)}><Trash /></button>
                </div>
              ))}
              <div className="docs-sep" />
              <button className="doc-new" onClick={newDocument}><Plus s={13} /> Nowy dokument</button>
            </div>
          )}
        </div>
        {user && active && active.phase && (
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, color: PHASE_COLORS[active.phase] || C.inkSoft, background: (PHASE_COLORS[active.phase] || C.inkSoft) + "1A", padding: "3px 9px", borderRadius: 20, fontSize: 12 }}>
                {PHASE_LABELS[active.phase] || active.phase}
              </span>
              {PHASE_NEXT[active.phase] && (
                <button onClick={advancePhase} style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 6, padding: "2px 9px", fontSize: 12, color: C.inkSoft, cursor: "pointer" }}>
                  → {PHASE_LABELS[PHASE_NEXT[active.phase]]}
                </button>
              )}
              {active.phase !== "DRAFT_1" && (
                <button onClick={retreatPhase} style={{ background: "none", border: "none", fontSize: 11, color: C.faint, cursor: "pointer", padding: "2px 4px" }}>↩</button>
              )}
              {active.phase === "PUBLISHED" && (
                <a href={`/d/${active.id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#15803D", textDecoration: "none", marginLeft: "auto" }}>Strona ↗</a>
              )}
            </div>
            {active.phase === "BETA" && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input value={betaEmail} onChange={(e) => setBetaEmail(e.target.value)} placeholder="Email beta-czytelnika"
                    style={{ flex: 1, padding: "5px 9px", borderRadius: 6, border: `1px solid ${C.line}`, fontSize: 12, outline: "none" }}
                    onKeyDown={(e) => e.key === "Enter" && inviteBeta()} />
                  <button onClick={inviteBeta} style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: "#4338CA", color: "#fff", fontSize: 12, cursor: "pointer" }}>Zaproś</button>
                </div>
                {betaMsg && <div style={{ fontSize: 12, color: betaMsg.startsWith("Zaproszono") ? "#0D7C6B" : "#BE185D" }}>{betaMsg}</div>}
                {betaReaders.length > 0 && (
                  <div style={{ fontSize: 12, color: C.faint }}>
                    {betaReaders.map((r) => (
                      <span key={r.id} style={{ marginRight: 6 }}>{r.user.username} <span style={{ color: r.status === "ACCEPTED" ? "#0D7C6B" : r.status === "DECLINED" ? "#BE185D" : C.faint }}>({r.status === "ACCEPTED" ? "tak" : r.status === "DECLINED" ? "nie" : "oczekuje"})</span></span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: C.faint, fontWeight: 600 }}>Struktura</div>
          <button className="btn-add" onClick={addParagraph} style={{ marginTop: 10 }}><Plus /> Dodaj paragraf</button>
        </div>
        <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "8px 8px 24px" }} onDragOver={(e) => drag && e.preventDefault()} onDrop={doDrop}>
          {doc.length === 0 && <p style={{ color: C.faint, fontSize: 13, padding: "20px 12px", lineHeight: 1.5 }}>Pusto. Dodaj pierwszy paragraf.</p>}
          {doc.map((p, i) => <SideNode key={p.id} node={p} depth={0} color={colorAt(i)} api={api} dnd={dnd} />)}
        </div>
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: C.faint }}>
          <span>{words} słów · {status}</span>
          <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-ghost" onClick={() => setExpOpen((o) => !o)}>Plik ▾</button>
            {expOpen && (
              <div className="popover">
                <button onClick={() => doExport("copy")}>Kopiuj do schowka (Markdown)</button>
                <button onClick={() => doExport("md")}>Pobierz .md</button>
                <button onClick={() => doExport("txt")}>Pobierz .txt</button>
                <div className="docs-sep" />
                <button onClick={() => { setExpOpen(false); exportJson(); }}>Pobierz kopię zapasową (.json)</button>
                <button onClick={() => { setExpOpen(false); pickImport(); }}>Importuj z pliku…</button>
                {fsSupported && (
                  <>
                    <div className="docs-sep" />
                    <button onClick={() => { setExpOpen(false); saveToDisk(); }}>{fileName ? `Plik na dysku: ${fileName}` : "Zapisz na dysk (auto-zapis)…"}</button>
                    <button onClick={() => { setExpOpen(false); openFromDisk(); }}>Otwórz plik z dysku…</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="scroll" style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        {doc.length === 0 ? (
          <div style={{ height: "100%", display: "flex" }}>
            <div style={{ margin: "auto", textAlign: "center", color: C.faint, maxWidth: 340 }}>
              <div style={{ fontSize: 34, marginBottom: 8 }}>✍️</div>
              <p style={{ fontSize: 15, lineHeight: 1.6 }}>Dodaj pierwszy paragraf w panelu po lewej, żeby zacząć pisać.</p>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 800, margin: "0 auto", padding: "36px 48px 160px" }}>
            {doc.map((p, i) => <DocNode key={p.id} node={p} depth={0} color={colorAt(i)} selId={selId} setSel={setSelId} rename={rename} setContent={setContent} refMap={blocks} mathReady={mathReady} />)}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Wyrenderowana treść (Markdown + KaTeX) ─────────────────────────────
function Rendered({ source, ready, onEdit }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    el.innerHTML = mdToHtml(source);
    if (ready && window.renderMathInElement) { try { window.renderMathInElement(el, KATEX_OPTS); } catch {} }
  }, [source, ready]);
  return <div ref={ref} className="body rendered" style={{ fontFamily: SERIF }} onClick={onEdit} />;
}

// ── Panel główny: rekurencyjny blok (klik = edycja, blur = render) ─────
function DocNode({ node, depth, color, selId, setSel, rename, setContent, refMap, mathReady }) {
  const [editing, setEditing] = useState(false);
  const ta = useRef(null);
  const resize = () => { const el = ta.current; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } };
  useLayoutEffect(() => { if (editing && ta.current) { const el = ta.current; el.focus(); const n = el.value.length; el.setSelectionRange(n, n); resize(); } }, [editing]);
  useLayoutEffect(() => { if (editing) resize(); }, [node.content, editing]);
  const sel = selId === node.id;
  const hClass = depth === 0 ? "h1" : depth === 1 ? "h2" : "h3";
  const startEdit = () => { setSel(node.id); setEditing(true); };
  return (
    <>
      <section ref={(el) => { refMap.current[node.id] = el; }} className={"block" + (sel ? " sel" : "")}
        style={{ marginLeft: depth * 24, marginTop: depth === 0 ? 30 : 14, borderLeft: `3px solid ${color}`, boxShadow: sel ? `0 0 0 2px ${color}` : "none", background: sel ? color + "0D" : "transparent", scrollMarginTop: 24 }}>
        <input className={hClass} value={node.name} onChange={(e) => rename(node.id, e.target.value)} onFocus={() => setSel(node.id)} placeholder="Nazwa…" style={{ fontFamily: SERIF, color }} />
        {editing ? (
          <textarea ref={ta} className="body" value={node.content} rows={1}
            onChange={(e) => { setContent(node.id, e.target.value); resize(); }} onFocus={() => setSel(node.id)} onBlur={() => setEditing(false)}
            placeholder="Pisz tutaj…   matematyka: $…$  lub  $$…$$" style={{ fontFamily: SERIF }} />
        ) : node.content.trim() ? (
          <Rendered source={node.content} ready={mathReady} onEdit={startEdit} />
        ) : (
          <div className="body placeholder" style={{ fontFamily: SERIF }} onClick={startEdit}>Pisz tutaj…&nbsp;&nbsp; matematyka: $…$ lub $$…$$</div>
        )}
      </section>
      {kids(node).map((c) => <DocNode key={c.id} node={c} depth={depth + 1} color={color} selId={selId} setSel={setSel} rename={rename} setContent={setContent} refMap={refMap} mathReady={mathReady} />)}
    </>
  );
}

// ── Panel boczny ───────────────────────────────────────────────────────
function SideNode({ node, depth, color, api, dnd }) {
  return (
    <>
      <Row node={node} depth={depth} color={color} selected={api.selId === node.id} renaming={api.renaming === node.id} canAddChild={depth < MAX_DEPTH}
        onSelect={() => api.goTo(node.id)} onStartRename={() => api.setRenaming(node.id)} onRename={(v) => { api.rename(node.id, v); api.setRenaming(null); }}
        onAddChild={() => api.addChild(node.id, depth)} onDelete={() => api.remove(node)}
        draggable onDragStart={(e) => dnd.onDragStart(e, node)} onDragOver={(e) => dnd.overRow(e, node, depth)} onDrop={dnd.doDrop} onDragEnd={dnd.clearDrag} shadow={dnd.dropShadow(node.id)} dim={dnd.dragId === node.id} />
      {kids(node).map((c) => <SideNode key={c.id} node={c} depth={depth + 1} color={color} api={api} dnd={dnd} />)}
    </>
  );
}
function Row({ node, depth, color, selected, renaming, canAddChild, onSelect, onStartRename, onRename, onAddChild, onDelete, shadow, dim, ...dragProps }) {
  const [val, setVal] = useState(node.name);
  useEffect(() => setVal(node.name), [node.name, renaming]);
  return (
    <div {...dragProps} draggable={!renaming} onClick={onSelect} onDoubleClick={onStartRename} className={"row" + (selected ? " sel" : "")}
      style={{ paddingLeft: 8 + depth * 18, boxShadow: shadow, opacity: dim ? 0.4 : 1, fontWeight: depth === 0 ? 600 : 400, ...(selected ? { background: color + "1F", color } : {}) }}>
      <span className="handle" title="Przeciągnij, aby zmienić kolejność lub zagnieżdżenie">⠿</span>
      <span className="dot" style={{ background: color, opacity: depth === 0 ? 1 : 0.45 }} />
      {renaming ? (
        <input autoFocus className="rename" value={val} onChange={(e) => setVal(e.target.value)} onFocus={(e) => e.target.select()} onBlur={() => onRename(val.trim() || node.name)}
          onKeyDown={(e) => { if (e.key === "Enter") onRename(val.trim() || node.name); if (e.key === "Escape") onRename(node.name); }} onClick={(e) => e.stopPropagation()} style={{ borderColor: color }} />
      ) : <span className="label">{node.name}</span>}
      <span className="actions" onClick={(e) => e.stopPropagation()}>
        {canAddChild && <button className="mini" title="Dodaj zagnieżdżony" onClick={onAddChild}><Plus s={13} /></button>}
        <button className="mini" title="Usuń" onClick={onDelete}><Trash /></button>
      </span>
    </div>
  );
}
const Plus = ({ s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>);
const Pencil = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>);
const Trash = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>);

const css = `
* { box-sizing: border-box; }
input, textarea, button { font-family: inherit; }
.btn-add { display:flex; align-items:center; gap:7px; width:100%; justify-content:center; background:${C.ink}; color:#fff; border:none; border-radius:8px; padding:9px 12px; font-size:13.5px; font-weight:600; cursor:pointer; transition:filter .15s; }
.btn-add:hover { filter:brightness(1.25); }
.btn-ghost { background:none; border:none; color:${C.inkSoft}; font-size:12px; cursor:pointer; padding:4px 7px; border-radius:6px; transition:background .12s,color .12s; }
.btn-ghost:hover { background:${C.sideHi}; color:${C.ink}; }
.popover { position:absolute; right:0; bottom:30px; background:#fff; border:1px solid ${C.line}; border-radius:9px; box-shadow:0 8px 24px rgba(0,0,0,.12); padding:5px; display:flex; flex-direction:column; min-width:158px; z-index:10; }
.popover button { text-align:left; background:none; border:none; padding:8px 10px; border-radius:6px; font-size:13px; color:${C.ink}; cursor:pointer; }
.popover button:hover { background:${C.sideHi}; }

.docbar { position:relative; padding:12px 14px; border-bottom:1px solid ${C.line}; }
.doctitle { display:flex; align-items:center; gap:8px; width:100%; justify-content:space-between; background:#fff; border:1px solid ${C.line}; border-radius:8px; padding:8px 11px; font-size:13.5px; font-weight:600; color:${C.ink}; cursor:pointer; transition:background .12s; }
.doctitle:hover { background:#FAFAF8; }
.doctitle-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.caret { color:${C.faint}; font-size:11px; flex-shrink:0; }
.doctitle-input { width:100%; border:1px solid ${C.ink}; border-radius:8px; padding:8px 11px; font-size:13.5px; font-weight:600; outline:none; color:${C.ink}; }
.docs-pop { left:14px; right:14px; top:52px; bottom:auto; max-height:300px; overflow-y:auto; }
.doc-row { display:flex; align-items:center; gap:2px; border-radius:6px; }
.doc-row:hover { background:${C.sideHi}; }
.doc-row.active .doc-pick { color:${C.ink}; font-weight:600; }
.doc-pick { flex:1; text-align:left; background:none; border:none; padding:8px 10px; font-size:13px; color:${C.inkSoft}; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.docs-sep { height:1px; background:${C.line}; margin:5px 2px; }
.doc-new { display:flex; align-items:center; gap:7px; width:100%; background:none; border:none; padding:8px 10px; border-radius:6px; font-size:13px; color:${C.ink}; cursor:pointer; }
.doc-new:hover { background:${C.sideHi}; }

.row { position:relative; display:flex; align-items:center; gap:7px; padding:7px 8px; margin:1px 0; border-radius:7px; cursor:pointer; font-size:13.5px; color:${C.ink}; user-select:none; transition:background .1s; }
.row:hover { background:${C.sideHi}; }
.handle { color:${C.faint}; cursor:grab; font-size:13px; line-height:1; flex-shrink:0; }
.handle:active { cursor:grabbing; }
.dot { width:9px; height:9px; border-radius:3px; flex-shrink:0; }
.label { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.actions { display:none; gap:2px; flex-shrink:0; }
.row:hover .actions { display:flex; }
.mini { display:flex; align-items:center; justify-content:center; width:22px; height:22px; background:none; border:none; border-radius:5px; color:${C.inkSoft}; cursor:pointer; transition:background .12s; }
.mini:hover { background:rgba(0,0,0,.08); }
.rename { flex:1; border:1px solid; border-radius:5px; padding:3px 6px; font-size:13.5px; outline:none; background:#fff; color:${C.ink}; }

.block { padding:8px 18px 14px; border-radius:8px; transition:box-shadow .18s, background .18s; }
.h1 { width:100%; border:none; outline:none; background:none; padding:2px 0 6px; font-size:27px; font-weight:600; }
.h2 { width:100%; border:none; outline:none; background:none; padding:2px 0 4px; font-size:20px; font-weight:600; }
.h3 { width:100%; border:none; outline:none; background:none; padding:2px 0 3px; font-size:16.5px; font-weight:700; }
.h1::placeholder, .h2::placeholder, .h3::placeholder { color:${C.faint}; opacity:.55; }
.body { width:100%; border:none; outline:none; background:none; font-size:17px; line-height:1.7; color:${C.ink}; }
textarea.body { resize:none; overflow:hidden; min-height:1.7em; }
textarea.body::placeholder { color:${C.faint}; }
.rendered { cursor:text; }
.rendered p { margin:0 0 .55em; }
.rendered p:last-child { margin-bottom:0; }
.rendered code { background:#F0EFEA; padding:1px 5px; border-radius:4px; font-size:.9em; font-family:ui-monospace,Menlo,Consolas,monospace; }
.rendered .katex-display { margin:.5em 0; overflow-x:auto; overflow-y:hidden; padding:2px 0; }
.placeholder { cursor:text; color:${C.faint}; }

.scroll::-webkit-scrollbar { width:10px; }
.scroll::-webkit-scrollbar-thumb { background:#D7D4CC; border-radius:6px; }
.scroll::-webkit-scrollbar-thumb:hover { background:#C2BFB6; }
`;
