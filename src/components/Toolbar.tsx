import { useState } from 'react'
import type { Mode, Quantity, SpeedUnit } from '../types'

interface NumberFieldProps {
  label: string
  title?: string
  value: number | null
  digits?: number
  disabled?: boolean
  onCommit: (v: number) => void
}

/** Campo numerico che applica il valore solo a fine digitazione (Invio o uscita dal campo). */
function NumberField({ label, title, value, digits, disabled, onCommit }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)

  function commit() {
    if (draft === null) return
    const n = Number(draft.replace(',', '.'))
    if (draft.trim() !== '' && Number.isFinite(n)) onCommit(n)
    setDraft(null)
  }

  const shown = value === null ? '' : digits === undefined ? String(value) : value.toFixed(digits)

  return (
    <label className="control-bar__field" title={title}>
      {label}
      <input
        type="number"
        inputMode="decimal"
        step="any"
        disabled={disabled}
        value={draft ?? shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    </label>
  )
}

interface Props {
  mode: Mode
  onMode: (m: Mode) => void
  recording: boolean
  capturing: boolean
  hasTrack: boolean
  accuracy: number | null
  sampleSeconds: number
  onSampleSeconds: (s: number) => void
  onStart: () => void
  onStop: () => void
  onCapture: () => void
  onImport: (file: File) => void
  onDemo: () => void
  onClear: () => void

  quantity: Quantity
  onQuantity: (q: Quantity) => void
  fromValue: number | null
  toValue: number | null
  hasRange: boolean
  onBound: (which: 'from' | 'to', value: number) => void
  onResetRange: () => void

  filterOn: boolean
  onFilterOn: (on: boolean) => void
  maxAccuracy: number
  onMaxAccuracy: (m: number) => void
  hiddenCount: number

  speedUnit: SpeedUnit
  onSpeedUnit: (u: SpeedUnit) => void
}

export function Toolbar(p: Props) {
  const unit = p.quantity === 't' ? 's' : 'm'

  return (
    <div className="control-bar">
      <div className="control-bar__group">
        <span className="control-bar__label">Modalità</span>
        <label title="I punti arrivano dal GPS di questo dispositivo">
          <input type="radio" name="mode" checked={p.mode === 'gps'} onChange={() => p.onMode('gps')} />
          GPS
        </label>
        <label title="I punti si inseriscono toccando la mappa; il tempo scorre dal primo punto">
          <input type="radio" name="mode" checked={p.mode === 'manual'} onChange={() => p.onMode('manual')} />
          Manuale
        </label>
      </div>

      <div className="control-bar__divider" />

      <div className="control-bar__group control-bar__group--stack">
        <span className="control-bar__label">Traccia</span>
        {p.mode === 'manual' ? (
          <span className="control-bar__readout">tocca la mappa per aggiungere un punto</span>
        ) : (
          <>
            {p.recording ? (
              <button className="btn btn--primary" onClick={p.onStop}>
                Ferma
              </button>
            ) : (
              <button className="btn btn--primary" onClick={p.onStart} title="Registra la posizione GPS di questo dispositivo a intervalli regolari">
                {p.hasTrack ? 'Riprendi' : 'Avvia'}
              </button>
            )}
            <button className="btn" onClick={p.onCapture} disabled={p.capturing} title="Aggiunge subito un punto con l'istante e la posizione attuali">
              {p.capturing ? 'Attendo GPS…' : '+ Punto'}
            </button>
            <NumberField
              label="ogni (s)"
              title="Intervallo di tempo tra due punti registrati automaticamente (minimo 0,2 s)"
              value={p.sampleSeconds}
              onCommit={p.onSampleSeconds}
            />
          </>
        )}
        <label className="btn control-bar__file" title="Carica una traccia GPX registrata con un'altra app">
          Importa GPX
          <input
            type="file"
            accept=".gpx,application/gpx+xml,application/xml,text/xml"
            disabled={p.recording}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) p.onImport(f)
              e.target.value = ''
            }}
          />
        </label>
        {!p.hasTrack && !p.recording && (
          <button className="btn" onClick={p.onDemo} title="Carica una traccia di esempio">
            Demo
          </button>
        )}
        {p.hasTrack && !p.recording && (
          <button className="btn" onClick={p.onClear} title="Elimina tutti i punti">
            Cancella
          </button>
        )}
        {p.recording && (
          <span className="control-bar__readout control-bar__readout--live">
            {p.accuracy === null ? 'in attesa del GPS…' : `GPS ± ${p.accuracy.toFixed(0)} m`}
          </span>
        )}
      </div>

      <div className="control-bar__divider" />

      <div className="control-bar__group">
        <span className="control-bar__label">Velocità</span>
        <label>
          <input type="radio" name="speedUnit" checked={p.speedUnit === 'ms'} onChange={() => p.onSpeedUnit('ms')} />
          m/s
        </label>
        <label>
          <input type="radio" name="speedUnit" checked={p.speedUnit === 'kmh'} onChange={() => p.onSpeedUnit('kmh')} />
          km/h
        </label>
      </div>

      <details className="control-bar__advanced">
        <summary className="control-bar__label">Impostazioni avanzate</summary>

        <div className="control-bar__advanced-body">
          <div className="control-bar__group control-bar__group--stack">
            <span className="control-bar__label">Intervallo</span>
            <label>
              <input type="radio" name="quantity" checked={p.quantity === 't'} onChange={() => p.onQuantity('t')} />
              Tempo
            </label>
            <label>
              <input type="radio" name="quantity" checked={p.quantity === 's'} onChange={() => p.onQuantity('s')} />
              Spazio
            </label>
            <NumberField label={`da (${unit})`} value={p.fromValue} digits={1} disabled={!p.hasTrack} onCommit={(v) => p.onBound('from', v)} />
            <NumberField label={`a (${unit})`} value={p.toValue} digits={1} disabled={!p.hasTrack} onCommit={(v) => p.onBound('to', v)} />
            <button className="btn" onClick={p.onResetRange} disabled={!p.hasRange} title="Torna a mostrare tutta la traccia">
              Tutto
            </button>
          </div>

          <div className="control-bar__divider" />

          <div className="control-bar__group">
            <span className="control-bar__label">Filtro</span>
            <label title="Nasconde i punti con precisione GPS peggiore della soglia. I punti non vengono eliminati: togliendo il filtro ricompaiono.">
              <input type="checkbox" checked={p.filterOn} onChange={(e) => p.onFilterOn(e.target.checked)} />
              Precisione
            </label>
            <NumberField label="entro (m)" value={p.maxAccuracy} disabled={!p.filterOn} onCommit={p.onMaxAccuracy} />
            {p.filterOn && <span className="control-bar__readout">{p.hiddenCount} esclusi</span>}
          </div>
        </div>
      </details>
    </div>
  )
}
