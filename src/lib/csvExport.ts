import { downloadText } from './download'
import type { Row } from '../types'

export function downloadCsv(rows: Row[], filename = 'pollicino-dati.csv') {
  const header = ['n', 'orario', 't_s', 'lat', 'lon', 's_m', 'v_ms', 'v_kmh', 'precisione_m']
  const lines = rows.map((r) =>
    [r.i + 1, new Date(r.time).toISOString(), r.t, r.lat, r.lon, r.s, r.v, r.v === null ? null : r.v * 3.6, r.accuracy]
      .map((v) => (v === null || v === undefined ? '' : v))
      .join(','),
  )
  downloadText([header.join(','), ...lines].join('\n'), filename, 'text/csv;charset=utf-8;')
}
