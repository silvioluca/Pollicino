import type { Fix } from '../types'

/** Legge i punti (con il loro istante) da un file GPX. Lancia un errore se il file non è utilizzabile. */
export function parseGpx(text: string): Fix[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Il file non è un GPX valido.')

  const fixes: Fix[] = []
  for (const pt of Array.from(doc.getElementsByTagName('trkpt'))) {
    const lat = Number(pt.getAttribute('lat'))
    const lon = Number(pt.getAttribute('lon'))
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
