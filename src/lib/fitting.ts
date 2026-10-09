export type FitType = 'linear' | 'quadratic' | 'polynomial'

export const FIT_TYPES: { type: FitType; label: string }[] = [
  { type: 'linear', label: 'Lineare' },
  { type: 'quadratic', label: 'Quadratica' },
  { type: 'polynomial', label: 'Polinomiale' },
]

/** Gradi disponibili per il fit polinomiale (1 e 2 sono già «lineare» e «quadratica»). */
export const POLY_DEGREES = [3, 4, 5, 6]

export interface FitResult {
  equation: string
  r2: number
  predict: (x: number) => number
}

type Point = { x: number; y: number }

/** Risolve il sistema lineare A·x = b con eliminazione di Gauss e pivot parziale. */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    }
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    if (Math.abs(M[col][col]) < 1e-12) continue

    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = M[r][col] / M[col][col]
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c]
    }
  }

  return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]))
}

/** Regressione polinomiale ai minimi quadrati: y = c0 + c1*x + ... + cn*x^n. */
function fitPolynomialCoeffs(points: Point[], degree: number): number[] {
  const n = degree + 1
  const A: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  const b: number[] = new Array(n).fill(0)

  for (const p of points) {
    const powers: number[] = [1]
    for (let k = 1; k <= 2 * degree; k++) powers.push(powers[k - 1] * p.x)
    for (let i = 0; i < n; i++) {
      b[i] += powers[i] * p.y
      for (let j = 0; j < n; j++) A[i][j] += powers[i + j]
    }
  }

  return solveLinearSystem(A, b)
}

function binomial(n: number, k: number): number {
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}

/** Riscrive Σ c_k·((x − mid)/half)^k come polinomio in x. */
function toRawCoeffs(scaled: number[], mid: number, half: number): number[] {
  const raw: number[] = new Array(scaled.length).fill(0)
  scaled.forEach((c, k) => {
    for (let j = 0; j <= k; j++) raw[j] += (c / half ** k) * binomial(k, j) * (-mid) ** (k - j)
  })
  return raw
}

function computeR2(points: Point[], predict: (x: number) => number): number {
  const meanY = points.reduce((s, p) => s + p.y, 0) / points.length
  let ssRes = 0
  let ssTot = 0
  for (const p of points) {
    ssRes += (p.y - predict(p.x)) ** 2
    ssTot += (p.y - meanY) ** 2
  }
  return ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot)
}

function fmt(n: number): string {
  if (!isFinite(n)) return '0'
  const abs = Math.abs(n)
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e5)) return n.toExponential(3)
  return n.toFixed(4).replace(/\.?0+$/, '') || '0'
}

function polyEquation(coeffs: number[], xName: string, yName: string): string {
  const terms = coeffs
    .map((c, i) => {
      if (i === 0) return fmt(c)
      if (i === 1) return `${fmt(c)}·${xName}`
      return `${fmt(c)}·${xName}^${i}`
    })
    .reverse()
  return `${yName} = ${terms.join(' + ').replace(/\+ -/g, '- ')}`
}

/**
 * Fit polinomiale ai minimi quadrati di grado `degree`. Restituisce null se i punti non bastano.
 * Il calcolo avviene su x riportata in [−1, 1]: con tempi di centinaia di secondi le potenze
 * di x renderebbero il sistema troppo mal condizionato già dal terzo grado.
 */
export function fitPolynomial(points: Point[], degree: number, xName = 'x', yName = 'y'): FitResult | null {
  if (points.length < degree + 1) return null
  let min = Infinity
  let max = -Infinity
  for (const p of points) {
    if (p.x < min) min = p.x
    if (p.x > max) max = p.x
  }
  if (max <= min) return null
  const mid = (min + max) / 2
  const half = (max - min) / 2

  const scaled = fitPolynomialCoeffs(
    points.map((p) => ({ x: (p.x - mid) / half, y: p.y })),
    degree,
  )
  const predict = (x: number) => {
    const u = (x - mid) / half
    return scaled.reduceRight((sum, c) => sum * u + c, 0)
  }
  return { equation: polyEquation(toRawCoeffs(scaled, mid, half), xName, yName), r2: computeR2(points, predict), predict }
}
