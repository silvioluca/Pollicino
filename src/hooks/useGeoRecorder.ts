import { useCallback, useEffect, useRef, useState } from 'react'
import { PositionFilter } from '../lib/geo'
import type { Fix } from '../types'

/** Oltre questa età la velocità letta dal dispositivo non descrive più l'istante campionato. */
const STALE_SPEED_MS = 3000

const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }

/**
 * Le prime letture arrivano spesso dalla rete (decine o centinaia di metri di errore):
 * il campionamento attende una stima entro questa precisione, o al massimo WARMUP_MS.
 */
const WARMUP_ACCURACY_M = 25
const WARMUP_MS = 15000

/** Un punto aggiunto a mano a registrazione ferma attende questa precisione, o al massimo CAPTURE_MS. */
const CAPTURE_ACCURACY_M = 15
const CAPTURE_MS = 10000

/** Sotto questa deviazione standard dell'accelerazione (m/s²) il telefono non si sta muovendo. */
const STILL_ACCEL_STD = 0.2
const MOTION_WINDOW_MS = 2000
/**
 * Fermo per l'accelerometro non basta: in treno o in auto a velocità costante il telefono è immobile.
 * Serve anche una velocità GPS quasi nulla.
 */
const STILL_MAX_SPEED = 1

/** Ultima stima della posizione (filtrata), con l'istante dell'ultima lettura. */
interface Reading {
  at: number
  lat: number
  lon: number
  accuracy: number
  speed: number | null
}

/** Aggiorna il filtro con una lettura del GPS e restituisce la nuova stima. */
function filterReading(filter: PositionFilter, pos: GeolocationPosition, motion?: StillnessDetector): Reading {
  const { latitude, longitude, accuracy, speed } = pos.coords
  const at = Date.now()
  const v = speed !== null && Number.isFinite(speed) && speed >= 0 ? speed : null
  const still = v !== null && v < STILL_MAX_SPEED && motion?.isStill() === true
  filter.update(latitude, longitude, accuracy, at, v, still)
  return { at, lat: filter.lat, lon: filter.lon, accuracy: filter.accuracy ?? accuracy, speed: still ? 0 : v }
}

type MotionPermission = { requestPermission?: () => Promise<'granted' | 'denied'> }

/**
 * Dall'accelerometro capisce se il telefono è immobile: da fermi il GPS continua a oscillare di qualche metro
 * e quelle oscillazioni diventerebbero spazio percorso.
 */
class StillnessDetector {
  private samples: { at: number; g: number }[] = []

  private onMotion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity
    if (a?.x == null || a.y == null || a.z == null) return
    const at = Date.now()
    this.samples.push({ at, g: Math.hypot(a.x, a.y, a.z) })
    while (this.samples[0].at < at - MOTION_WINDOW_MS) this.samples.shift()
  }

  /** Va chiamato durante un tocco dell'utente: su iPhone l'accesso ai sensori va chiesto così. */
  start() {
    if (typeof DeviceMotionEvent === 'undefined') return
    const ask = (DeviceMotionEvent as unknown as MotionPermission).requestPermission
    if (!ask) {
      window.addEventListener('devicemotion', this.onMotion)
      return
    }
    ask
      .call(DeviceMotionEvent)
      .then((answer) => {
        if (answer === 'granted') window.addEventListener('devicemotion', this.onMotion)
      })
      .catch(() => {
        // Senza sensori si registra comunque, solo senza riconoscere le soste.
      })
  }

  stop() {
    window.removeEventListener('devicemotion', this.onMotion)
    this.samples = []
  }

  isStill(): boolean {
    const now = Date.now()
    const recent = this.samples.filter((s) => s.at >= now - MOTION_WINDOW_MS)
    // Pochi campioni: sensori assenti o fermi da tempo (pagina in background), meglio non concludere nulla.
    if (recent.length < 10) return false
    const mean = recent.reduce((sum, s) => sum + s.g, 0) / recent.length
    const variance = recent.reduce((sum, s) => sum + (s.g - mean) ** 2, 0) / recent.length
    return Math.sqrt(variance) < STILL_ACCEL_STD
  }
}

function errorMessage(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) return 'Permesso di localizzazione negato: abilitalo nelle impostazioni del browser.'
  if (err.code === err.TIMEOUT) return 'Il GPS non risponde: spostati in un luogo aperto.'
  return 'Posizione non disponibile: controlla che il GPS sia attivo.'
}

/**
 * Registra la posizione del dispositivo a intervalli regolari di `sampleSeconds`.
 * Il GPS aggiorna la posizione con i suoi tempi (spesso una volta al secondo, o solo quando ci si muove):
 * un timer campiona l'ultima posizione nota, così l'intervallo scelto dall'utente è sempre rispettato.
 */
export function useGeoRecorder(onFix: (fix: Fix) => void, sampleSeconds: number) {
  const [recording, setRecording] = useState(false)
  const [ready, setReady] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [speed, setSpeed] = useState<number | null>(null)
  const watchId = useRef<number | null>(null)
  const latest = useRef<Reading | null>(null)
  const cancelCapture = useRef<(() => void) | null>(null)
  const wakeLock = useRef<WakeLockSentinel | null>(null)
  const motion = useRef<StillnessDetector | null>(null)
  const onFixRef = useRef(onFix)

  useEffect(() => {
    onFixRef.current = onFix
  }, [onFix])

  const emit = useCallback((r: Reading) => {
    const now = Date.now()
    onFixRef.current({ time: now, lat: r.lat, lon: r.lon, accuracy: r.accuracy, speed: now - r.at <= STALE_SPEED_MS ? r.speed : null })
  }, [])

  // Senza wake lock lo schermo si spegne e il browser smette di ricevere posizioni.
  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return
    try {
      const lock = await navigator.wakeLock.request('screen')
      // La registrazione può essere stata fermata mentre si attendeva la risposta.
      if (watchId.current === null) void lock.release()
      else wakeLock.current = lock
    } catch {
      // Negato dal sistema (es. risparmio energetico): si registra comunque.
    }
  }, [])

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    latest.current = null
    motion.current?.stop()
    motion.current = null
    void wakeLock.current?.release()
    wakeLock.current = null
    setRecording(false)
    setReady(false)
  }, [])

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('Questo browser non supporta la geolocalizzazione.')
      return
    }
    if (watchId.current !== null) return
    setError(null)
    setAccuracy(null)
    setSpeed(null)
    const filter = new PositionFilter()
    const startedAt = Date.now()
    const detector = new StillnessDetector()
    detector.start()
    motion.current = detector
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const reading = filterReading(filter, pos, detector)
        latest.current = reading
        setError(null)
        setAccuracy(reading.accuracy)
        setSpeed(reading.speed)
        if (reading.accuracy <= WARMUP_ACCURACY_M || reading.at - startedAt >= WARMUP_MS) setReady(true)
      },
      (err) => {
        setError(errorMessage(err))
        if (err.code === err.PERMISSION_DENIED) stop()
      },
      GEO_OPTIONS,
    )
    setRecording(true)
    void acquireWakeLock()
  }, [acquireWakeLock, stop])

  // Il campionamento parte alla prima posizione ricevuta...
  useEffect(() => {
    if (recording && ready && latest.current) emit(latest.current)
  }, [recording, ready, emit])

  // ...poi procede a passo costante. Cambiare il passo non aggiunge un punto fuori tempo.
  useEffect(() => {
    if (!recording || !ready) return
    const id = setInterval(() => {
      if (latest.current) emit(latest.current)
    }, sampleSeconds * 1000)
    return () => clearInterval(id)
  }, [recording, ready, sampleSeconds, emit])

  /** Aggiunge subito un punto con l'istante e la posizione attuali, anche a registrazione ferma. */
  const capture = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('Questo browser non supporta la geolocalizzazione.')
      return
    }
    if (watchId.current !== null && latest.current) {
      emit(latest.current)
      return
    }
    if (cancelCapture.current) return
    // Una lettura singola è spesso quella grossolana dalla rete: si ascolta il GPS finché la stima è buona.
    setCapturing(true)
    const filter = new PositionFilter()
    let last: Reading | null = null
    let expired = false
    const end = () => {
      navigator.geolocation.clearWatch(id)
      clearTimeout(timer)
      cancelCapture.current = null
      setCapturing(false)
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        last = filterReading(filter, pos)
        setError(null)
        setAccuracy(last.accuracy)
        if (expired || last.accuracy <= CAPTURE_ACCURACY_M) {
          end()
          emit(last)
        }
      },
      (err) => {
        if (last) return
        end()
        setError(errorMessage(err))
      },
      GEO_OPTIONS,
    )
    // Scaduta l'attesa si tiene la stima migliore, o la prima lettura che arriverà.
    const timer = setTimeout(() => {
      expired = true
      if (last) {
        end()
        emit(last)
      }
    }, CAPTURE_MS)
    cancelCapture.current = end
  }, [emit])

  // Il wake lock viene rilasciato quando la pagina va in background: va richiesto di nuovo.
  useEffect(() => {
    if (!recording) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquireWakeLock()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [recording, acquireWakeLock])

  useEffect(
    () => () => {
      stop()
      cancelCapture.current?.()
    },
    [stop],
  )

  return { recording, ready, capturing, error, accuracy, speed, start, stop, capture }
}
