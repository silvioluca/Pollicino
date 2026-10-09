import type { Row } from '../types'

export function downloadCsv(rows: Row[], filename = 'pollicino-dati.csv') {
  const header = ['n', 'orario', 't_s', 'lat', 'lon', 's_m', 'v_ms', 'v_kmh', 'precisione_m']
  const lines = rows.map((r) =>
    [r.i + 1, new Date(r.time).toISOString(), r.t, r.lat, r.lon, r.s, r.v, r.v === null ? null : r.v * 3.6, r.accuracy]
      .map((v) => (v === null || v === undefined ? '' : v))
      .join(','),
  )
  const csv = [header.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
