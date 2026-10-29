import { useEffect, useRef } from 'react'
import { downloadCsv } from '../lib/csvExport'
import { speedIn, speedLabel } from '../lib/geo'
import type { Row, SpeedUnit } from '../types'

interface Props {
  /** Punti dell'intervallo selezionato. */
  rows: Row[]
  cursor: number | null
  speedUnit: SpeedUnit
  onPick: (index: number) => void
  onDelete: (index: number) => void
}

export function DataTable({ rows, cursor, speedUnit, onPick, onDelete }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLTableRowElement>(null)

  // Porta la riga del punto fissato al centro della tabella, senza far scorrere la pagina.
  useEffect(() => {
    const box = scrollRef.current
    const row = activeRef.current
    if (!box || !row) return
    box.scrollTop += row.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 2
  }, [cursor])

  return (
    <div className="data-table-panel">
      <div className="data-table__header">
        <span className="main-graph__title">Dati</span>
        <button className="graphs__download" onClick={() => downloadCsv(rows)} disabled={rows.length === 0} title="Scarica i dati come CSV">
          CSV
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="data-table__empty">Nessun dato ancora. Avvia la registrazione o importa un file GPX (Impostazioni avanzate) per vedere i dati qui.</p>
      ) : (
        <div className="data-table" ref={scrollRef}>
          <table>
            <thead>
              <tr>
                <th>N</th>
                <th>Orario</th>
                <th>t (s)</th>
                <th>Lat (°)</th>
                <th>Lon (°)</th>
                <th>s (m)</th>
                <th>v ({speedLabel(speedUnit)})</th>
                <th>± (m)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.i}
                  ref={r.i === cursor ? activeRef : undefined}
                  className={r.i === cursor ? 'data-table__row data-table__row--active' : 'data-table__row'}
                  onClick={() => onPick(r.i)}
                >
                  <td>{r.i + 1}</td>
                  <td>{new Date(r.time).toLocaleTimeString('it-IT')}</td>
                  <td>{r.t.toFixed(1)}</td>
                  <td>{r.lat.toFixed(6)}</td>
                  <td>{r.lon.toFixed(6)}</td>
                  <td>{r.s.toFixed(1)}</td>
                  <td>{r.v === null ? '—' : speedIn(r.v, speedUnit).toFixed(2)}</td>
                  <td>{r.accuracy === null ? '—' : r.accuracy.toFixed(0)}</td>
                  <td>
                    <button
                      className="data-table__delete"
                      title="Elimina questo punto"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(r.i)
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
