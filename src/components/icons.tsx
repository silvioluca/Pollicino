interface IconProps {
  className?: string
}

const FILLED = { viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true } as const

export function IconPlay({ className }: IconProps) {
  return (
    <svg className={className} {...FILLED}>
      <polygon points="7,4 20,12 7,20" />
    </svg>
  )
}

export function IconPause({ className }: IconProps) {
  return (
    <svg className={className} {...FILLED}>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  )
}

const STROKED = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function IconFit({ className }: IconProps) {
  return (
    <svg className={className} {...STROKED}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
    </svg>
  )
}

export function IconSun({ className }: IconProps) {
  return (
    <svg className={className} {...STROKED}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" />
    </svg>
  )
}

export function IconMoon({ className }: IconProps) {
  return (
    <svg className={className} {...STROKED}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  )
}
