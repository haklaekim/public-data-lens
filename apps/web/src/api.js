const BASE = '/api'

async function get(path, params) {
  const url = new URL(BASE + path, window.location.origin)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
    }
  }
  const res = await fetch(url)
  const body = await res.json()
  if (!res.ok) {
    const err = new Error(body?.error?.message || `HTTP ${res.status}`)
    err.code = body?.error?.code
    throw err
  }
  return body
}

export const api = {
  status: () => get('/status'),
  search: (params) => get('/search', params),
  dataset: (id, view) => get(`/datasets/${encodeURIComponent(id)}`, { view }),
  compare: (ids) => get('/compare', { ids: ids.join(',') }),
  changes: (params) => get('/changes', params),
  stats: (axis, limit) => get('/stats', { axis, limit }),
}
