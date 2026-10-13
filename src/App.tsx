import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TrackMap } from './components/TrackMap'
import { Toolbar } from './components/Toolbar'
import { DataTable } from './components/DataTable'
import { Graphs } from './components/Graphs'
import { IconMoon, IconSun } from './components/icons'
import { useGeoRecorder } from './hooks/useGeoRecorder'
import { computeRows, nearestIndex, speedIn, speedLabel } from './lib/geo'
import { parseGpx } from './lib/gpx'
import { demoTrack } from './lib/demo'
import type { Fix, Mode, Quantity, Range, SpeedUnit, Theme } from './types'
import './App.css'

const TRACK_KEY = 'pollicino-track'
/** Durata di ogni punto quando si rivede il percorso (non è il tempo reale). */
const PLAY_STEP_MS = 500

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('pollicino-theme') as Theme | null) ?? 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('pollicino-theme', theme)
  }, [theme])

  return [theme, () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))]
}

const numberOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Rilegge la traccia salvata, scartando ciò che non è un punto con istante e posizione. */
function loadTrack(): Fix[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(TRACK_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    const fixes: Fix[] = []
    for (const item of saved as unknown[]) {
      if (typeof item !== 'object' || item === null) continue
      const { time, lat, lon, accuracy, speed } = item as Record<string, unknown>
      const [t, la, lo] = [numberOrNull(time), numberOrNull(lat), numberOrNull(lon)]
      if (t === null || la === null || lo === null) continue
      if (fixes.length > 0 && t <= fixes[fixes.length - 1].time) continue
      fixes.push({ time: t, lat: la, lon: lo, accuracy: numberOrNull(accuracy), speed: numberOrNull(speed) })
    }
    return fixes
  } catch {
    return []
  }
}

function saveTrack(fixes: Fix[]) {
  try {
    localStorage.setItem(TRACK_KEY, JSON.stringify(fixes))
  } catch {
    // Spazio esaurito: la traccia resta in memoria e si può esportare in CSV.
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stats__item">
      <span className="stats__label">{label}</span>
      <span className="stats__value">{value}</span>
    </div>
  )
}

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const [mode, setMode] = useState<Mode>('gps')
  const [fixes, setFixes] = useState<Fix[]>(loadTrack)
  const [range, setRange] = useState<Range | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const [quantity, setQuantity] = useState<Quantity>('t')
  const [speedUnit, setSpeedUnit] = useState<SpeedUnit>('ms')
  const [sampleSeconds, setSampleSeconds] = useState(1)
  const [filterOn, setFilterOn] = useState(false)
  const [maxAccuracy, setMaxAccuracy] = useState(20)
  const [notice, setNotice] = useState<string | null>(null)
  const [fitCount, setFitCount] = useState(0)
  const [playing, setPlaying] = useState(false)
  // La traccia di esempio non va salvata: alla prossima apertura l'app deve partire vuota.
  const [demo, setDemo] = useState(false)
  const stored = useMemo(() => (demo ? [] : fixes), [demo, fixes])

  const lastTime = useRef<number | null>(null)

  useEffect(() => {
    lastTime.current = fixes.length > 0 ? fixes[fixes.length - 1].time : null
  }, [fixes])

  const addFix = useCallback((fix: Fix) => {
    // Un punto ben più vecchio dell'ultimo non è un doppione: la traccia caricata ha orari nel futuro.
    if (lastTime.current !== null && fix.time < lastTime.current - 1000) {
      setNotice('La traccia ha orari successivi a quello attuale: non si possono aggiungere nuovi punti. Cancellala per registrarne una nuova.')
    }
    // I tempi devono restare strettamente crescenti: ogni punto è identificato dal suo istante.
    setFixes((prev) => (prev.length > 0 && fix.time <= prev[prev.length - 1].time ? prev : [...prev, fix]))
  }, [])

  const recorder = useGeoRecorder(addFix, sampleSeconds)
  const { recording } = recorder

  // Durante la registrazione si salva ogni 15 punti, per non riscrivere tutta la traccia a ogni lettura.
  useEffect(() => {
    if (recording && stored.length % 15 !== 0) return
    saveTrack(stored)
  }, [stored, recording])

  // Se la pagina viene nascosta o chiusa a registrazione in corso, si salvano anche gli ultimi punti.
  useEffect(() => {
    if (!recording) return
    const save = () => saveTrack(stored)
    document.addEventListener('visibilitychange', save)
    window.addEventListener('pagehide', save)
    return () => {
      document.removeEventListener('visibilitychange', save)
      window.removeEventListener('pagehide', save)
    }
  }, [stored, recording])

  // Il filtro nasconde i punti poco precisi senza eliminarli. I punti senza precisione nota (GPX) restano.
  const visible = useMemo(
    () => (filterOn ? fixes.filter((f) => f.accuracy === null || f.accuracy <= maxAccuracy) : fixes),
    [fixes, filterOn, maxAccuracy],
  )
  const rows = useMemo(() => computeRows(visible), [visible])
  const from = range?.from ?? 0
  const to = range?.to ?? rows.length - 1
  const selected = useMemo(() => rows.slice(from, to + 1), [rows, from, to])
  const rangeKey = range ? `${range.from}-${range.to}` : 'all'
  const cursorRow = cursor !== null ? (rows[cursor] ?? null) : null

  // Riproduzione: il punto fissato avanza di uno ogni mezzo secondo fino alla fine dell'intervallo.
  // Riparte dal punto fissato se l'utente ne sceglie un altro nel frattempo.
  useEffect(() => {
    if (!playing || cursor === null || cursor < from || cursor >= to) return
    const id = setTimeout(() => {
      setCursor(cursor + 1)
      if (cursor + 1 >= to) setPlaying(false)
    }, PLAY_STEP_MS)
    return () => clearTimeout(id)
  }, [playing, cursor, from, to])

  function togglePlay() {
    if (playing) {
      setPlaying(false)
      return
    }
    if (cursor === null || cursor < from || cursor >= to) setCursor(from)
    setPlaying(true)
  }

  /** Toglie il punto fissato; la riproduzione, che lo fa avanzare, si ferma. */
  function clearCursor() {
    setCursor(null)
    setPlaying(false)
  }

  function changeMode(next: Mode) {
    if (next === 'manual') recorder.stop()
    setMode(next)
  }

  // Modalità manuale: la posizione è quella toccata, l'istante è quello del tocco.
  // Il tempo t parte quindi da zero sul primo punto e scorre con l'orologio.
  const addManualPoint = useCallback(
    (lat: number, lon: number) => addFix({ time: Date.now(), lat, lon, accuracy: null, speed: null }),
    [addFix],
  )

  function replaceTrack(next: Fix[], isDemo = false) {
    setFixes(next)
    setDemo(isDemo)
    setNotice(null)
    setRange(null)
    clearCursor()
    setFitCount((n) => n + 1)
  }

  function setBound(which: 'from' | 'to', index: number) {
    if (rows.length === 0) return
    const last = rows.length - 1
    let a = which === 'from' ? index : from
    let b = which === 'to' ? index : to
    if (a > b) [a, b] = [b, a]
    setPlaying(false)
    setRange(a === 0 && b === last ? null : { from: a, to: b })
  }

  function deletePoint(index: number) {
    const time = rows[index].time
    setPlaying(false)
    setFixes((prev) => prev.filter((f) => f.time !== time))
    // Gli indici dei punti successivi scalano di uno.
    setCursor((c) => (c === null || c === index ? null : c > index ? c - 1 : c))
    setRange((r) => {
      if (!r) return null
      const next = { from: index < r.from ? r.from - 1 : r.from, to: index <= r.to ? r.to - 1 : r.to }
      return next.to < next.from ? null : next
    })
  }

  // Cambiando il filtro cambiano i punti visibili, e con loro gli indici di selezione e punto fissato.
  function changeFilter(on: boolean, meters: number) {
    setFilterOn(on)
    setMaxAccuracy(meters)
    setRange(null)
    clearCursor()
  }

  async function importGpx(file: File) {
    try {
      replaceTrack(parseGpx(await file.text()))
      setNotice(null)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Impossibile leggere il file.')
    }
  }

  function clearTrack() {
    if (window.confirm('Cancellare la traccia registrata? I dati non esportati andranno persi.')) replaceTrack([])
  }

  const first = selected[0]
  const last = selected[selected.length - 1]
  const dt = first ? last.t - first.t : 0
  const ds = first ? last.s - first.s : 0
  const speeds = selected.flatMap((r) => (r.v === null ? [] : [r.v]))
  const unit = speedLabel(speedUnit)
  const message = recorder.error ?? notice

  // Tachimetro: velocità dal vivo durante la registrazione, altrimenti quella del punto fissato.
  const lastRow = rows[rows.length - 1]
  // In modalità manuale, senza un punto fissato, mostra l'ultimo punto inserito.
  const tachoRow = recording ? lastRow : (cursorRow ?? (mode === 'manual' ? (lastRow ?? null) : null))
  const tachoSpeed = recording ? (recorder.speed ?? lastRow?.v ?? null) : (tachoRow?.v ?? null)
  const tachoSource = recording ? 'dal vivo' : cursorRow ? `punto ${cursorRow.i + 1}` : tachoRow ? 'ultimo punto' : 'fermo'

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>Pollicino</h1>
          <p>Traccia GPS: tempo, posizione e velocità su mappa, grafici e tabella.</p>
        </div>
        <button className="btn btn--icon theme-toggle" onClick={toggleTheme} title="Cambia tema">
          {theme === 'light' ? <IconMoon /> : <IconSun />}
        </button>
      </header>

      <Toolbar
        mode={mode}
        onMode={changeMode}
        recording={recording}
        capturing={recorder.capturing}
        hasTrack={fixes.length > 0}
        accuracy={recorder.accuracy}
        sampleSeconds={sampleSeconds}
        onSampleSeconds={(s) => setSampleSeconds(Math.max(0.2, s))}
        onStart={recorder.start}
        onStop={recorder.stop}
        onCapture={recorder.capture}
        onImport={importGpx}
        onDemo={() => replaceTrack(demoTrack(), true)}
        onClear={clearTrack}
        quantity={quantity}
        onQuantity={setQuantity}
        fromValue={first ? first[quantity] : null}
        toValue={first ? last[quantity] : null}
        hasRange={range !== null}
        onBound={(which, value) => setBound(which, nearestIndex(rows, quantity, value))}
        onResetRange={() => {
          setRange(null)
          setPlaying(false)
        }}
        filterOn={filterOn}
        onFilterOn={(on) => changeFilter(on, maxAccuracy)}
        maxAccuracy={maxAccuracy}
        onMaxAccuracy={(m) => changeFilter(filterOn, Math.max(1, m))}
        hiddenCount={fixes.length - visible.length}
        speedUnit={speedUnit}
        onSpeedUnit={setSpeedUnit}
      />

      <div className={recording ? 'tacho tacho--live' : 'tacho'}>
        <div className="tacho__speed">
          <span className="tacho__digits">{tachoSpeed === null ? '--.-' : speedIn(tachoSpeed, speedUnit).toFixed(1)}</span>
          <span className="tacho__unit">{unit}</span>
        </div>
        <div className="tacho__side">
          <span className="tacho__source">{tachoSource}</span>
          <span>t {tachoRow ? `${tachoRow.t.toFixed(1)} s` : '—'}</span>
          <span>s {tachoRow ? `${tachoRow.s.toFixed(1)} m` : '—'}</span>
        </div>
      </div>

      {message && <p className="status status--warning">{message}</p>}

      <main className="app__main">
        <TrackMap rows={rows} range={range} cursor={cursor} recording={recording} playing={playing} onTogglePlay={togglePlay} fitKey={`${fitCount}:${rangeKey}`} onPick={setCursor} onAdd={mode === 'manual' ? addManualPoint : undefined}>
          {cursorRow ? (
            <div className="pin">
              <span className="pin__readout">
                <strong>Punto {cursorRow.i + 1}</strong>
                <span>t = {cursorRow.t.toFixed(1)} s</span>
                <span>s = {cursorRow.s.toFixed(1)} m</span>
                <span>v = {cursorRow.v === null ? '—' : `${speedIn(cursorRow.v, speedUnit).toFixed(2)} ${unit}`}</span>
                <span className="pin__coords">
                  {cursorRow.lat.toFixed(5)}°, {cursorRow.lon.toFixed(5)}°
                </span>
              </span>
              <span className="pin__actions">
                <button className="btn" onClick={() => setBound('from', cursorRow.i)} title="L'intervallo selezionato parte da questo punto">
                  Inizio qui
                </button>
                <button className="btn" onClick={() => setBound('to', cursorRow.i)} title="L'intervallo selezionato finisce in questo punto">
                  Fine qui
                </button>
                <button className="btn" onClick={() => deletePoint(cursorRow.i)} title="Elimina questo punto dalla traccia">
                  Elimina
                </button>
                <button className="btn" onClick={clearCursor} title="Togli il punto fissato">
                  ✕
                </button>
              </span>
            </div>
          ) : (
            <p className="status">
              {mode === 'manual'
                ? 'Tocca la mappa per aggiungere un punto: il tempo parte da zero sul primo e continua a scorrere. Per fissare un punto usa un grafico o una riga della tabella.'
                : rows.length === 0
                ? 'Premi Avvia per registrare il percorso con il GPS di questo dispositivo, oppure importa un file GPX.'
                : 'Tocca la mappa, un grafico o una riga della tabella per fissare un punto: potrai usarlo come inizio o fine dell’intervallo, oppure eliminarlo.'}
            </p>
          )}
        </TrackMap>

        <Graphs rows={selected} cursor={cursorRow} speedUnit={speedUnit} theme={theme} rangeKey={rangeKey} onPick={setCursor} />
      </main>

      {first && (
        <section className="app__section">
          <div className="stats">
            <span className="control-bar__label">{range ? 'Intervallo selezionato' : 'Tutta la traccia'}</span>
            <Stat label="punti" value={String(selected.length)} />
            <Stat label="Δt" value={`${dt.toFixed(1)} s`} />
            <Stat label="Δs" value={`${ds.toFixed(1)} m`} />
            <Stat label="v media" value={dt > 0 ? `${speedIn(ds / dt, speedUnit).toFixed(2)} ${unit}` : '—'} />
            <Stat label="v max" value={speeds.length ? `${speedIn(speeds.reduce((m, v) => Math.max(m, v), 0), speedUnit).toFixed(2)} ${unit}` : '—'} />
          </div>
        </section>
      )}

      <section className="app__section">
        <DataTable rows={selected} cursor={cursor} speedUnit={speedUnit} onPick={setCursor} onDelete={deletePoint} />
      </section>
    </div>
  )
}
