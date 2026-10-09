import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChartData, ChartOptions } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { ChartJS, zoomOptions } from '../lib/chartSetup'
import { FIT_TYPES, POLY_DEGREES, fitPolynomial, type FitType } from '../lib/fitting'
import { nearestIndex, speedIn, speedLabel } from '../lib/geo'
import type { Row, SpeedUnit, Theme } from '../types'

type Point = { x: number; y: number }

const FIT_STEPS = 100

interface CardProps {
  title: string
  /** Simbolo della grandezza sull'asse y, usato nell'equazione del fit. */
  yName: string
  yLabel: string
  fileName: string
  points: Point[]
  cursorPoint: Point | null
  theme: Theme
  /** Quando cambia l'intervallo selezionato lo zoom viene reimpostato. */
  rangeKey: string
  onPickTime: (t: number) => void
}

function GraphCard({ title, yName, yLabel, fileName, points, cursorPoint, theme, rangeKey, onPickTime }: CardProps) {
  const chartRef = useRef<ChartJS<'line'> | null>(null)
  const onPickRef = useRef(onPickTime)
  const [fitType, setFitType] = useState<FitType | 'none'>('none')
  const [polyDegree, setPolyDegree] = useState(POLY_DEGREES[0])

  useEffect(() => {
    onPickRef.current = onPickTime
  }, [onPickTime])

  useEffect(() => {
    chartRef.current?.resetZoom()
  }, [rangeKey])

  // Le opzioni restano stabili tra un punto e l'altro: ricrearle farebbe perdere lo zoom.
  const options = useMemo<ChartOptions<'line'>>(() => {
    const color = theme === 'dark' ? '#a3a3a3' : '#555555'
    const grid = { color: theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)' }
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      scales: {
        x: { type: 'linear', title: { display: true, text: 't (s)', color }, ticks: { color }, grid },
        y: { type: 'linear', title: { display: true, text: yLabel, color }, ticks: { color }, grid },
      },
      plugins: { legend: { display: false }, zoom: zoomOptions },
      onClick: (event, _elements, chart) => {
        if (event.x === null) return
        const t = chart.scales.x.getValueForPixel(event.x)
        if (t !== undefined) onPickRef.current(t)
      },
    }
  }, [theme, yLabel])

  // Il fit usa i punti mostrati, cioè quelli dell'intervallo selezionato.
  const degree = fitType === 'linear' ? 1 : fitType === 'quadratic' ? 2 : polyDegree
  const fit = useMemo(() => (fitType === 'none' ? null : fitPolynomial(points, degree, 't', yName)), [fitType, degree, points, yName])
  const fitCurve = useMemo(() => {
    if (!fit) return []
    const x0 = points[0].x
    const x1 = points[points.length - 1].x
    return Array.from({ length: FIT_STEPS + 1 }, (_, i) => {
      const x = x0 + ((x1 - x0) * i) / FIT_STEPS
      return { x, y: fit.predict(x) }
    })
  }, [fit, points])

  const fitColor = theme === 'dark' ? '#f5f5f5' : '#111111'
  // `order` più basso = disegnato sopra: punto fissato, poi curva di fit, poi dati.
  const data: ChartData<'line'> = {
    datasets: [
      { label: title, data: points, borderColor: '#d71921', backgroundColor: '#d71921', pointRadius: 3, pointHoverRadius: 5, tension: 0.15, order: 2 },
      {
        label: 'fit',
        data: fitCurve,
        borderColor: fitColor,
        backgroundColor: fitColor,
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
        order: 1,
      },
      {
        label: 'punto fissato',
        data: cursorPoint ? [cursorPoint] : [],
        borderColor: '#ffffff',
        backgroundColor: '#0ea5e9',
        pointRadius: 7,
        pointHoverRadius: 7,
        pointBorderWidth: 2,
        showLine: false,
        order: 0,
      },
    ],
  }

  function download() {
    const chart = chartRef.current
    if (!chart) return
    const a = document.createElement('a')
    a.href = chart.toBase64Image()
    a.download = `pollicino-${fileName}.png`
    a.click()
  }

  return (
    <div className="graphs__card">
      <div className="graphs__card-header">
        <h3>{title}</h3>
        <div className="main-graph__header-controls">
          <select
            className="graphs__select"
            value={fitType}
            onChange={(e) => setFitType(e.target.value as FitType | 'none')}
            title="Adatta una funzione ai punti mostrati"
            aria-label="Tipo di fit"
          >
            <option value="none">Fit: nessuno</option>
            {FIT_TYPES.map((f) => (
              <option key={f.type} value={f.type}>
                Fit: {f.label}
              </option>
            ))}
          </select>
          {fitType === 'polynomial' && (
            <select
              className="graphs__select"
              value={polyDegree}
              onChange={(e) => setPolyDegree(Number(e.target.value))}
              title="Grado del polinomio"
              aria-label="Grado del polinomio"
            >
              {POLY_DEGREES.map((d) => (
                <option key={d} value={d}>
                  grado {d}
                </option>
              ))}
            </select>
          )}
          <button className="graphs__download" onClick={() => chartRef.current?.resetZoom()} title="Reimposta lo zoom">
            RESET
          </button>
          <button className="graphs__download" onClick={download} title="Scarica il grafico come immagine PNG">
            PNG
          </button>
        </div>
      </div>
      <div className="graphs__canvas">
        <Line ref={chartRef} data={data} options={options} />
      </div>
      {fitType !== 'none' &&
        (fit ? (
          <div className="graphs__fit">
            <code>{fit.equation}</code>
            <span>R² = {fit.r2.toFixed(4)}</span>
          </div>
        ) : (
          <p className="graphs__fit">Servono almeno {degree + 1} punti per questo fit.</p>
        ))}
    </div>
  )
}

interface Props {
  /** Punti dell'intervallo selezionato. */
  rows: Row[]
  cursor: Row | null
  speedUnit: SpeedUnit
  theme: Theme
  rangeKey: string
  onPick: (index: number) => void
}

export function Graphs({ rows, cursor, speedUnit, theme, rangeKey, onPick }: Props) {
  const spacePoints = useMemo(() => rows.map((r) => ({ x: r.t, y: r.s })), [rows])
  const speedPoints = useMemo(
    () => rows.filter((r) => r.v !== null).map((r) => ({ x: r.t, y: speedIn(r.v as number, speedUnit) })),
    [rows, speedUnit],
  )

  if (rows.length < 2) {
    return <p className="graphs__empty">I grafici compariranno non appena ci saranno almeno due punti registrati.</p>
  }

  const shown = cursor && cursor.i >= rows[0].i && cursor.i <= rows[rows.length - 1].i ? cursor : null
  const pickTime = (t: number) => onPick(rows[nearestIndex(rows, 't', t)].i)

  return (
    <div className="graphs">
      <GraphCard
        title="Spazio – tempo"
        yName="s"
        yLabel="s (m)"
        fileName="spazio-tempo"
        points={spacePoints}
        cursorPoint={shown ? { x: shown.t, y: shown.s } : null}
        theme={theme}
        rangeKey={rangeKey}
        onPickTime={pickTime}
      />
      <GraphCard
        title="Velocità – tempo"
        yName="v"
        yLabel={`v (${speedLabel(speedUnit)})`}
        fileName="velocita-tempo"
        points={speedPoints}
        cursorPoint={shown && shown.v !== null ? { x: shown.t, y: speedIn(shown.v, speedUnit) } : null}
        theme={theme}
        rangeKey={rangeKey}
        onPickTime={pickTime}
      />
      <p className="main-graph__hint">Tocca un grafico per fissare un punto. Rotellina o pizzico per zoomare, Shift+trascina per spostare.</p>
    </div>
  )
}
