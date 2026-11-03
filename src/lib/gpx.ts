import { downloadText } from './download'
import type { Fix, Row } from '../types'

/** Coordinata di un punto; NaN se l'attributo manca o è vuoto (Number('') varrebbe 0). */
function coord(pt: Element, name: string): number {
  const text = pt.getAttribute(name)?.trim()
  return text ? Number(text) : NaN
}

/** Legge i punti (con il loro istante) da un file GPX. Lancia un errore se il file non è utilizzabile. */
export function parseGpx(text: string): Fix[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Il file non è un GPX valido.')

  const fixes: Fix[] = []
  for (const pt of Array.from(doc.getElementsByTagName('trkpt'))) {
    const lat = coord(pt, 'lat')
    const lon = coord(pt, 'lon')
    const time = Date.parse(pt.getElementsByTagName('time')[0]?.textContent ?? '')
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(time)) continue
    const speedText = pt.getElementsByTagName('speed')[0]?.textContent
    const speed = speedText ? Number(speedText) : NaN
    fixes.push({ time, lat, lon, accuracy: null, speed: Number.isFinite(speed) ? speed : null })
  }
  if (fixes.length === 0) throw new Error('Il file GPX non contiene punti con posizione e orario.')

  // Tempi strettamente crescenti: i duplicati renderebbero indefinita la velocità.
  fixes.sort((a, b) => a.time - b.time)
  return fixes.filter((f, i) => i === 0 || f.time > fixes[i - 1].time)
}

/** Scarica i punti come traccia GPX, leggibile da altre app (mappe, sport, navigatori). */
export function downloadGpx(rows: Row[], filename = 'pollicino-traccia.gpx') {
  const points = rows.map(
    (r) => `      <trkpt lat="${r.lat.toFixed(7)}" lon="${r.lon.toFixed(7)}"><time>${new Date(r.time).toISOString()}</time></trkpt>`,
  )
  const gpx = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Pollicino" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <trk>',
    '    <name>Pollicino</name>',
    '    <trkseg>',
    ...points,
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
  ].join('\n')
  downloadText(gpx, filename, 'application/gpx+xml')
}
