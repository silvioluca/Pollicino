import { useCallback, useEffect, useRef, useState } from 'react'
import type { Fix } from '../types'

/** Oltre questa età la velocità letta dal dispositivo non descrive più l'istante campionato. */
const STALE_SPEED_MS = 3000

const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }

/** Ultima posizione ricevuta dal GPS, con l'istante di arrivo. */
interface Reading {
  at: number
  lat: number
  lon: number
  accuracy: number
  speed: number | null
}

function toReading(pos: GeolocationPosition): Reading {
  const { latitude, longitude, accuracy, speed } = pos.coords
  return { at: Date.now(), lat: latitude, lon: longitude, accuracy, speed: speed !== null && Number.isFinite(speed) ? speed : null }
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
  const wakeLock = useRef<WakeLockSentinel | null>(null)
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
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const reading = toReading(pos)
        latest.current = reading
        setError(null)
        setAccuracy(reading.accuracy)
        setSpeed(reading.speed)
        setReady(true)
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
    setCapturing(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const reading = toReading(pos)
        setCapturing(false)
        setError(null)
        setAccuracy(reading.accuracy)
        emit(reading)
      },
      (err) => {
        setCapturing(false)
        setError(errorMessage(err))
      },
      GEO_OPTIONS,
    )
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

  useEffect(() => stop, [stop])

  return { recording, capturing, error, accuracy, speed, start, stop, capture }
}
