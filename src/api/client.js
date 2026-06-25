const BASE = '/api'

function getToken() { return localStorage.getItem('token') }

function reqHeaders() {
  const h = { 'Content-Type': 'application/json' }
  const t = getToken()
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: reqHeaders(),
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Błąd serwera')
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
}
