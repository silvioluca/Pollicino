import type { Fix } from '../types'

/** Traccia sintetica (un punto al secondo, con una sosta) per provare l'app senza GPS. */
export function demoTrack(): Fix[] {
  const n = 240
  const lat0 = 41.8902
  const lon0 = 12.4922
  const metersPerDegLat = 111_320
  const metersPerDegLon = metersPerDegLat * Math.cos((lat0 * Math.PI) / 180)
  const start = Date.now() - n * 1000

  const fixes: Fix[] = []
  let x = 0
  let y = 0
  for (let k = 0; k < n; k++) {
    const stopped = k >= 100 && k < 125
    const v = stopped ? 0 : 4 + 3 * Math.sin(k / 18)
    const heading = k / 45
    x += v * Math.cos(heading)
    y += v * Math.sin(heading)
    fixes.push({ time: start + k * 1000, lat: lat0 + y / metersPerDegLat, lon: lon0 + x / metersPerDegLon, accuracy: 5, speed: null })
  }
  return fixes
}
