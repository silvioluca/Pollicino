import type { Fix, Quantity, Row, SpeedUnit } from '../types'

const EARTH_RADIUS = 6371008.8
const RAD = Math.PI / 180

/** Distanza in metri tra due punti sulla superficie terrestre. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD
  const dLon = (lon2 - lon1) * RAD
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Ricava tempo, spazio percorso e velocità da una sequenza di letture GPS. */
export function computeRows(fixes: Fix[]): Row[] {
  if (fixes.length === 0) return []
  const t0 = fixes[0].time
  let s = 0
  const rows: Row[] = fixes.map((f, i) => {
    if (i > 0) s += haversine(fixes[i - 1].lat, fixes[i - 1].lon, f.lat, f.lon)
    return { i, time: f.time, t: (f.time - t0) / 1000, lat: f.lat, lon: f.lon, s, v: null, accuracy: f.accuracy }
  })
  rows.forEach((r, i) => {
    const device = fixes[i].speed
    if (device !== null && Number.isFinite(device) && device >= 0) {
      r.v = device
      return
    }
    // Senza la velocità del dispositivo: differenza centrata sullo spazio percorso.
    const a = rows[Math.max(i - 1, 0)]
    const b = rows[Math.min(i + 1, rows.length - 1)]
    const dt = b.t - a.t
    r.v = dt > 0 ? (b.s - a.s) / dt : null
  })
  return rows
}

/** Indice del punto con tempo (o spazio) più vicino al valore dato. */
export function nearestIndex(rows: Row[], key: Quantity, value: number): number {
  let best = 0
  let bestDiff = Infinity
  rows.forEach((r, i) => {
    const diff = Math.abs(r[key] - value)
    if (diff < bestDiff) {
      best = i
      bestDiff = diff
    }
  })
  return best
}

/** Indice del punto della traccia più vicino a una posizione sulla mappa. */
export function nearestByPosition(rows: Row[], lat: number, lon: number): number {
  const k = Math.cos(lat * RAD)
  let best = 0
  let bestDist = Infinity
  rows.forEach((r, i) => {
    const d = (r.lat - lat) ** 2 + ((r.lon - lon) * k) ** 2
    if (d < bestDist) {
      best = i
      bestDist = d
    }
  })
  return best
}

export function speedIn(v: number, unit: SpeedUnit): number {
  return unit === 'kmh' ? v * 3.6 : v
}

export function speedLabel(unit: SpeedUnit): string {
  return unit === 'kmh' ? 'km/h' : 'm/s'
}
