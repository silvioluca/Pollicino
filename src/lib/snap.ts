import { haversine } from './geo'
import type { Fix } from '../types'

/** Rete a cui appartiene una via: strade (anche sentieri e ciclabili) o binari. */
export type Network = 'road' | 'rail'

export interface LatLon {
  lat: number
  lon: number
}

export interface Way {
  id: number
  network: Network
  nodes: number[]
  geometry: LatLon[]
  /** Distanza lungo la via dall'inizio fino a ciascun vertice (m). */
  cum: number[]
}

interface Candidate extends LatLon {
  way: Way
  /** Distanza dalla lettura GPS (m). */
  d: number
  /** Posizione lungo la via (m). */
  along: number
}

/** Server Overpass pubblici, provati in ordine: spesso uno è sovraccarico. */
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
/** Attesa massima per ciascun server. */
const SERVER_TIMEOUT_MS = 60000
/** Se sono tutti occupati si riprova una volta dopo questa pausa. */
const RETRY_DELAY_MS = 5000

const RAIL_FILTER = 'way[railway~"^(rail|light_rail|subway|tram|narrow_gauge|monorail)$"]'
const ROAD_FILTER = 'way[highway]'

/** Oltre questa distanza dalla via (o dal binario) un punto resta dov'è. In treno il GPS è meno preciso. */
const RADIUS: Record<Network, number> = { road: 40, rail: 80 }
const MAX_RADIUS = Math.max(RADIUS.road, RADIUS.rail)

/**
 * Vie candidate per ciascun punto, per rete: in città le strade vicine sono tante
 * e senza un posto riservato il binario resterebbe escluso.
 */
const MAX_CANDIDATES: Record<Network, number> = { road: 3, rail: 2 }
/** Quanto pesa, in metri, la differenza tra il tragitto sulla rete e quello misurato dal GPS. */
const BETA = 10
/** Penalità per il passaggio su un'altra via collegata, o su una non collegata. */
const SWITCH_COST = 0.5
const JUMP_COST = 4
/**
 * Penalità per il passaggio tra strada e binario, anche dove si toccano (passaggi a livello):
 * si cambia mezzo di rado, mentre il GPS di un treno sfiora spesso le strade parallele.
 */
const NETWORK_SWITCH_COST = 12
/** Punti prima e dopo usati per smussare la posizione lungo la via. */
const SMOOTH_HALF_WINDOW = 2

const M_PER_DEG = 111320
const RAD = Math.PI / 180

/** Semplifica la traccia (Douglas-Peucker) per tenere breve la richiesta a Overpass. */
function simplify(points: LatLon[], tolerance: number): LatLon[] {
  if (points.length <= 2) return points
  const k = Math.cos(points[0].lat * RAD)
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [a, b] = stack.pop()!
    const ax = points[a].lon * k, ay = points[a].lat
    const dx = points[b].lon * k - ax, dy = points[b].lat - ay
    const len2 = dx * dx + dy * dy
    let worst = -1
    let worstD = 0
    for (let i = a + 1; i < b; i++) {
      const px = points[i].lon * k - ax, py = points[i].lat - ay
      const t = len2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0
      const d = Math.hypot(px - t * dx, py - t * dy) * M_PER_DEG
      if (d > worstD) {
        worst = i
        worstD = d
      }
    }
    if (worst >= 0 && worstD > tolerance) {
      keep[worst] = 1
      stack.push([a, worst], [worst, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

type OverpassData = {
  elements?: { type: string; id: number; nodes?: number[]; geometry?: LatLon[]; tags?: Record<string, string> }[]
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(id)
      reject(signal.reason)
    })
  })

/** Invia la richiesta al primo server Overpass che risponde. */
async function queryOverpass(query: string, signal?: AbortSignal): Promise<OverpassData> {
  let reached = false
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await wait(RETRY_DELAY_MS, signal)
    for (const url of OVERPASS_URLS) {
      try {
        const timeout = AbortSignal.timeout(SERVER_TIMEOUT_MS)
        const res = await fetch(url, {
          method: 'POST',
          body: new URLSearchParams({ data: query }),
          signal: signal && 'any' in AbortSignal ? AbortSignal.any([signal, timeout]) : (signal ?? timeout),
        })
        reached = true
        // 429, 502, 503, 504: server occupato, si prova il successivo.
        if (!res.ok) continue
        return (await res.json()) as OverpassData
      } catch (err) {
        if (signal?.aborted) throw err
      }
    }
  }
  throw new Error(
    reached
      ? 'I server di OpenStreetMap sono occupati: riprova tra qualche minuto.'
      : 'Impossibile contattare OpenStreetMap: controlla la connessione.',
  )
}

/** Scarica strade e binari vicini alla traccia, con una sola richiesta. */
async function fetchWays(fixes: Fix[], signal?: AbortSignal): Promise<Way[]> {
  const tolerance = RADIUS.road / 2
  const coords = simplify(fixes, tolerance)
    .map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`)
    .join(',')
  const around = (network: Network) => `(around:${Math.ceil(RADIUS[network] + tolerance)},${coords})`
  const query = `[out:json][timeout:90];(${ROAD_FILTER}${around('road')};${RAIL_FILTER}${around('rail')};);out geom;`
  const data = await queryOverpass(query, signal)
  return (data.elements ?? []).flatMap((el) =>
    el.type === 'way' && el.geometry && el.geometry.length >= 2
      ? [makeWay(el.id, el.tags?.railway && !el.tags.highway ? 'rail' : 'road', el.nodes ?? [], el.geometry)]
      : [],
  )
}

export function makeWay(id: number, network: Network, nodes: number[], geometry: LatLon[]): Way {
  const cum = [0]
  for (let i = 1; i < geometry.length; i++) {
    const [p, q] = [geometry[i - 1], geometry[i]]
    cum.push(cum[i - 1] + haversine(p.lat, p.lon, q.lat, q.lon))
  }
  return { id, network, nodes, geometry, cum }
}

/** Griglia dei segmenti delle vie, per trovare in fretta quelli vicini a un punto. */
class SegmentGrid {
  private cells = new Map<string, [Way, number][]>()
  private cellLat: number
  private cellLon: number

  constructor(ways: Way[], radius: number, minCos: number) {
    this.cellLat = radius / M_PER_DEG
    this.cellLon = radius / (M_PER_DEG * minCos)
    for (const way of ways) {
      for (let s = 0; s < way.geometry.length - 1; s++) {
        const [p, q] = [way.geometry[s], way.geometry[s + 1]]
        const [i0, i1] = [Math.floor(Math.min(p.lat, q.lat) / this.cellLat), Math.floor(Math.max(p.lat, q.lat) / this.cellLat)]
        const [j0, j1] = [Math.floor(Math.min(p.lon, q.lon) / this.cellLon), Math.floor(Math.max(p.lon, q.lon) / this.cellLon)]
        for (let i = i0; i <= i1; i++) {
          for (let j = j0; j <= j1; j++) {
            const key = `${i},${j}`
            let cell = this.cells.get(key)
            if (!cell) this.cells.set(key, (cell = []))
            cell.push([way, s])
          }
        }
      }
    }
  }

  /** Segmenti nelle celle attorno al punto: le celle sono grandi quanto il raggio di ricerca. */
  near(lat: number, lon: number): [Way, number][] {
    const i = Math.floor(lat / this.cellLat)
    const j = Math.floor(lon / this.cellLon)
    const out: [Way, number][] = []
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const cell = this.cells.get(`${i + di},${j + dj}`)
        if (cell) out.push(...cell)
      }
    }
    return out
  }
}

/** Proiezioni del punto sulle vie vicine: la più vicina per ciascuna via, le migliori MAX_CANDIDATES per rete. */
function candidates(fix: Fix, grid: SegmentGrid): Candidate[] {
  const k = Math.cos(fix.lat * RAD)
  const best = new Map<number, Candidate>()
  for (const [way, s] of grid.near(fix.lat, fix.lon)) {
    const [p, q] = [way.geometry[s], way.geometry[s + 1]]
    const dx = (q.lon - p.lon) * k, dy = q.lat - p.lat
    const px = (fix.lon - p.lon) * k, py = fix.lat - p.lat
    const len2 = dx * dx + dy * dy
    const t = len2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0
    const d = Math.hypot(px - t * dx, py - t * dy) * M_PER_DEG
    if (d > RADIUS[way.network]) continue
    const prev = best.get(way.id)
    if (prev && prev.d <= d) continue
    best.set(way.id, {
      way,
      d,
      lat: p.lat + t * (q.lat - p.lat),
      lon: p.lon + t * (q.lon - p.lon),
      along: way.cum[s] + t * (way.cum[s + 1] - way.cum[s]),
    })
  }
  const sorted = [...best.values()].sort((a, b) => a.d - b.d)
  return (['road', 'rail'] as const).flatMap((network) => sorted.filter((c) => c.way.network === network).slice(0, MAX_CANDIDATES[network]))
}

/** Punto della via a una data distanza dal suo inizio. */
function pointAt(way: Way, along: number): LatLon {
  let s = way.cum.findIndex((c) => c >= along)
  if (s <= 0) return way.geometry[s === 0 ? 0 : way.geometry.length - 1]
  const [c0, c1] = [way.cum[s - 1], way.cum[s]]
  const t = c1 > c0 ? (along - c0) / (c1 - c0) : 0
  const [p, q] = [way.geometry[s - 1], way.geometry[s]]
  return { lat: p.lat + t * (q.lat - p.lat), lon: p.lon + t * (q.lon - p.lon) }
}

/**
 * Agganciati alla via, i punti oscillano ancora avanti e indietro lungo di essa e gonfiano lo spazio percorso:
 * sui tratti consecutivi sulla stessa via si fa la media della posizione lungo la via con i punti vicini.
 */
function smoothAlong(chosen: Candidate[]): LatLon[] {
  return chosen.map((c, i) => {
    let sum = 0
    let n = 0
    for (let j = i - SMOOTH_HALF_WINDOW; j <= i + SMOOTH_HALF_WINDOW; j++) {
      if (chosen[j]?.way !== c.way) continue
      sum += chosen[j].along
      n++
    }
    return pointAt(c.way, sum / n)
  })
}

/** Vie già scaricate, per non richiederle di nuovo a ogni modifica della traccia. */
export interface SnapCache {
  ways: Map<number, Way>
  /** Istanti dei punti attorno ai quali le vie sono già state scaricate. */
  covered: Set<number>
}

export function createSnapCache(): SnapCache {
  return { ways: new Map(), covered: new Set() }
}

/**
 * Aggancia la traccia alle strade e ai binari di OpenStreetMap: a piedi, in bici o in auto segue le strade, in treno i binari.
 * Per ogni punto considera le vie vicine e sceglie la sequenza più coerente (algoritmo di Viterbi):
 * vicina alle letture, senza salti tra vie non collegate e con distanze percorse simili a quelle del GPS.
 * Restituisce la posizione agganciata di ciascun punto, per istante; i punti lontani dalla rete restano fuori.
 * Scarica solo le vie attorno ai punti non ancora coperti dalla cache (es. quelli aggiunti riprendendo la registrazione).
 */
export async function snapToNetwork(fixes: Fix[], cache: SnapCache, signal?: AbortSignal): Promise<Map<number, LatLon>> {
  const missing = fixes.filter((f) => !cache.covered.has(f.time))
  if (missing.length > 0) {
    for (const way of await fetchWays(missing, signal)) cache.ways.set(way.id, way)
    for (const f of missing) cache.covered.add(f.time)
  }
  return matchToWays(fixes, [...cache.ways.values()])
}

/** Sceglie per ogni punto la posizione sulle vie date (vedi snapToNetwork). */
export function matchToWays(fixes: Fix[], ways: Way[]): Map<number, LatLon> {
  const result = new Map<number, LatLon>()
  if (ways.length === 0) return result

  const maxLat = fixes.reduce((m, f) => Math.max(m, Math.abs(f.lat)), 0)
  const grid = new SegmentGrid(ways, MAX_RADIUS, Math.max(Math.cos(Math.min(maxLat + 1, 89) * RAD), 0.01))

  const byNode = new Map<number, number[]>()
  for (const way of ways) for (const n of way.nodes) byNode.set(n, [...(byNode.get(n) ?? []), way.id])
  const connected = (a: Way, b: Way) => a.nodes.some((n) => byNode.get(n)?.includes(b.id))

  // Viterbi su ciascun tratto di punti consecutivi vicini alla rete.
  let costs: number[] = []
  let steps: { fix: Fix; cands: Candidate[]; from: number[] }[] = []
  const flush = () => {
    if (steps.length === 0) return
    const chosen: Candidate[] = []
    let k = costs.indexOf(Math.min(...costs))
    for (let i = steps.length - 1; i >= 0; i--) {
      chosen[i] = steps[i].cands[k]
      k = steps[i].from[k]
    }
    smoothAlong(chosen).forEach((p, i) => result.set(steps[i].fix.time, p))
    steps = []
    costs = []
  }

  for (const fix of fixes) {
    const cands = candidates(fix, grid)
    if (cands.length === 0) {
      flush()
      continue
    }
    const sigma = Math.max(fix.accuracy ?? 10, 5)
    const emission = cands.map((c) => (c.d / sigma) ** 2 / 2)
    const prev = steps[steps.length - 1]
    if (!prev) {
      costs = emission
      steps.push({ fix, cands, from: cands.map(() => -1) })
      continue
    }
    const gps = haversine(prev.fix.lat, prev.fix.lon, fix.lat, fix.lon)
    const from: number[] = []
    costs = cands.map((c, j) => {
      let best = Infinity
      prev.cands.forEach((p, i) => {
        const same = p.way === c.way
        const route = same ? Math.abs(c.along - p.along) : haversine(p.lat, p.lon, c.lat, c.lon)
        const change = same ? 0 : p.way.network !== c.way.network ? NETWORK_SWITCH_COST : connected(p.way, c.way) ? SWITCH_COST : JUMP_COST
        const cost = costs[i] + Math.abs(route - gps) / BETA + change
        if (cost < best) {
          best = cost
          from[j] = i
        }
      })
      return best + emission[j]
    })
    steps.push({ fix, cands, from })
  }
  flush()
  return result
}
