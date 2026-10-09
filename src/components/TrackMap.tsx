import { useEffect, useRef, type ReactNode } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { nearestByPosition } from '../lib/geo'
import type { Range, Row } from '../types'
import { IconFit, IconPause, IconPlay } from './icons'

const ACCENT = '#d71921'
const CURSOR = '#0ea5e9'

type CanvasInternals = { _ctx?: CanvasRenderingContext2D; _redraw(): void }

/**
 * Renderer canvas (un cerchio SVG per ogni punto della traccia sarebbe troppo pesante).
 * Quando la vista cambia, Leaflet ridisegna subito ma lascia in coda il ridisegno già richiesto,
 * senza più poterlo annullare: se nel frattempo la mappa viene rimossa, quel ridisegno trova il
 * canvas distrutto e lancia «Cannot read properties of undefined (reading 'clearRect')».
 */
const SafeCanvas = L.Canvas.extend({
  _redraw(this: CanvasInternals) {
    if (this._ctx) (L.Canvas.prototype as unknown as CanvasInternals)._redraw.call(this)
  },
})

interface Props {
  rows: Row[]
  range: Range | null
  cursor: number | null
  recording: boolean
  /** Riproduzione del percorso in corso: la mappa segue il punto fissato. */
  playing: boolean
  onTogglePlay: () => void
  /** Cambia quando la vista va riadattata alla traccia (import, demo, cambio intervallo). */
  fitKey: string
  onPick: (index: number) => void
  /** Se presente, un tocco sulla mappa aggiunge un punto in quella posizione invece di fissarne uno esistente. */
  onAdd?: (lat: number, lon: number) => void
  children?: ReactNode
}

interface Layers {
  map: L.Map
  base: L.Polyline
  selected: L.Polyline
  dots: L.LayerGroup
  marks: L.LayerGroup
}

export function TrackMap({ rows, range, cursor, recording, playing, onTogglePlay, fitKey, onPick, onAdd, children }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const layersRef = useRef<Layers | null>(null)
  const latest = useRef({ rows, onPick, onAdd })
  const adding = onAdd !== undefined

  useEffect(() => {
    latest.current = { rows, onPick, onAdd }
  }, [rows, onPick, onAdd])

  useEffect(() => {
    const map = L.map(elRef.current!, { center: [41.9, 12.5], zoom: 5, renderer: new SafeCanvas() as L.Renderer })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    const base = L.polyline([], { color: '#888888', weight: 3, opacity: 0.85 }).addTo(map)
    const selected = L.polyline([], { color: ACCENT, weight: 4 }).addTo(map)
    const dots = L.layerGroup().addTo(map)
    const marks = L.layerGroup().addTo(map)
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { rows, onPick, onAdd } = latest.current
      if (onAdd) onAdd(e.latlng.lat, e.latlng.lng)
      else if (rows.length > 0) onPick(nearestByPosition(rows, e.latlng.lat, e.latlng.lng))
    })
    layersRef.current = { map, base, selected, dots, marks }
    return () => {
      map.remove()
      layersRef.current = null
    }
  }, [])

  useEffect(() => {
    const layers = layersRef.current
    if (!layers) return
    const from = range?.from ?? 0
    const to = range?.to ?? rows.length - 1
    const sel = rows.slice(from, to + 1)
    layers.base.setLatLngs(rows.map((r) => [r.lat, r.lon]))
    layers.selected.setLatLngs(sel.map((r) => [r.lat, r.lon]))

    // Un pallino per ogni punto: rosso nell'intervallo selezionato, grigio fuori.
    layers.dots.clearLayers()
    for (const r of rows) {
      const fillColor = r.i >= from && r.i <= to ? ACCENT : '#888888'
      L.circleMarker([r.lat, r.lon], { radius: 4, color: '#ffffff', weight: 1, fillColor, fillOpacity: 1, interactive: false }).addTo(layers.dots)
    }
  }, [rows, range])

  // Dichiarato dopo i pallini e con le stesse dipendenze: i marcatori restano disegnati sopra.
  useEffect(() => {
    const layers = layersRef.current
    if (!layers) return
    const sel = rows.slice(range?.from ?? 0, (range?.to ?? rows.length - 1) + 1)
    layers.marks.clearLayers()
    const mark = (r: Row, color: string, fill: string, radius: number) =>
      L.circleMarker([r.lat, r.lon], { radius, color, weight: 2, fillColor: fill, fillOpacity: 1, interactive: false }).addTo(layers.marks)
    if (sel.length > 0) {
      mark(sel[0], '#ffffff', ACCENT, 7)
      if (sel.length > 1) mark(sel[sel.length - 1], ACCENT, '#ffffff', 7)
    }
    const pinned = cursor !== null ? rows[cursor] : undefined
    if (pinned) {
      mark(pinned, '#ffffff', CURSOR, 8)
      if (playing && !layers.map.getBounds().pad(-0.1).contains([pinned.lat, pinned.lon])) layers.map.panTo([pinned.lat, pinned.lon])
    }
  }, [rows, range, cursor, playing])

  // Inserendo punti a mano due tocchi ravvicinati sono due punti, non uno zoom.
  useEffect(() => {
    const zoom = layersRef.current?.map.doubleClickZoom
    if (adding) zoom?.disable()
    else zoom?.enable()
  }, [adding])

  function fit() {
    const layers = layersRef.current
    if (!layers || rows.length === 0) return
    if (rows.length === 1) {
      layers.map.setView([rows[0].lat, rows[0].lon], 17)
      return
    }
    const line = range ? layers.selected : layers.base
    layers.map.fitBounds(line.getBounds(), { padding: [24, 24], maxZoom: 18 })
  }

  // Dichiarato dopo l'aggiornamento dei layer: le polilinee sono già aggiornate.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fit, [fitKey])

  // Durante la registrazione la mappa segue l'ultimo punto quando esce dalla vista.
  const count = rows.length
  useEffect(() => {
    const layers = layersRef.current
    const last = latest.current.rows[count - 1]
    if (!layers || !recording || !last) return
    if (count === 1) layers.map.setView([last.lat, last.lon], 17)
    else if (!layers.map.getBounds().pad(-0.15).contains([last.lat, last.lon])) layers.map.panTo([last.lat, last.lon])
  }, [count, recording])

  return (
    <div className="map-panel">
      <div className="main-graph__header">
        <span className="main-graph__title">Mappa</span>
        <div className="main-graph__header-controls">
          <button
            className={playing ? 'btn btn--icon btn--primary' : 'btn btn--icon'}
            onClick={onTogglePlay}
            disabled={rows.length < 2}
            title={playing ? 'Metti in pausa' : 'Rivedi il percorso, mezzo secondo per punto'}
          >
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <button className="btn btn--icon" onClick={fit} disabled={rows.length === 0} title="Adatta la vista alla traccia">
            <IconFit />
          </button>
        </div>
      </div>
      <div ref={elRef} className="map-panel__map" />
      {children}
    </div>
  )
}
