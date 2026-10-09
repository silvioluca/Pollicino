/** Una lettura grezza del GPS. */
export interface Fix {
  /** Istante della lettura, in ms dall'epoca Unix. */
  time: number
  lat: number
  lon: number
  /** Precisione orizzontale in metri, se nota. */
  accuracy: number | null
  /** Velocità misurata dal dispositivo in m/s, se disponibile. */
  speed: number | null
}

/** Un punto della traccia con le grandezze derivate. */
export interface Row {
  i: number
  time: number
  /** Tempo dall'inizio della traccia (s). */
  t: number
  lat: number
  lon: number
  /** Spazio percorso dall'inizio della traccia (m). */
  s: number
  /** Velocità (m/s). */
  v: number | null
  accuracy: number | null
}

/** Intervallo selezionato, come indici (inclusi) dei punti della traccia. */
export interface Range {
  from: number
  to: number
}

/** Da dove arrivano i punti: dal GPS del dispositivo o dai tocchi sulla mappa. */
export type Mode = 'gps' | 'manual'
export type Quantity = 't' | 's'
export type SpeedUnit = 'ms' | 'kmh'
export type Theme = 'light' | 'dark'
