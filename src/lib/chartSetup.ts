import { Chart as ChartJS, LinearScale, PointElement, LineElement, Tooltip } from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, zoomPlugin)

export const zoomOptions = {
  pan: { enabled: true, mode: 'xy' as const, modifierKey: 'shift' as const },
  zoom: {
    wheel: { enabled: true },
    pinch: { enabled: true },
    mode: 'xy' as const,
  },
}

export { ChartJS }
