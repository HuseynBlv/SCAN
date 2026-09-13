const paths = {
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10M9 20v-6h6v6" />
    </>
  ),
  opportunities: (
    <>
      <path d="M12 3v3m6.4-.4-2.1 2.1M21 12h-3M5.6 5.6l2.1 2.1M3 12h3" />
      <path d="M8.5 15.5a5 5 0 1 1 7 0c-.8.7-1.1 1.3-1.2 2.5H9.7c-.1-1.2-.4-1.8-1.2-2.5ZM10 21h4" />
    </>
  ),
  explore: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 5 5M11 8v6m-3-3h6" />
    </>
  ),
  stores: (
    <>
      <path d="M4 10v10h16V10M3 10l2-6h14l2 6" />
      <path d="M8 20v-6h4v6m-8-10c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2" />
    </>
  ),
  ask: (
    <>
      <path d="M4 5h16v12H8l-4 4V5Z" />
      <path d="M9.8 9a2.3 2.3 0 0 1 4.4 1c0 1.7-2.2 1.8-2.2 3M12 15.5h.01" />
    </>
  ),
  sales: (
    <>
      <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />
      <path d="m4 8 5-4 5 5 6-6" />
    </>
  ),
  alerts: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
    </>
  ),
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  basket: (
    <>
      <path d="M4 9h16l-1.4 10H5.4L4 9Z" />
      <path d="m8 9 4-6 4 6M8 13v2m4-2v2m4-2v2" />
    </>
  ),
  products: (
    <>
      <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
    </>
  ),
  'time-store': (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4m8-4v4M3 10h18M8 14h3m2 0h3m-8 3h3" />
    </>
  ),
  recommendations: (
    <>
      <path d="M9 18h6M10 22h4" />
      <path d="M8.4 15.5A7 7 0 1 1 15.6 15.5c-.9.7-1.2 1.3-1.3 2.5h-4.6c-.1-1.2-.4-1.8-1.3-2.5Z" />
    </>
  ),
  sync: (
    <>
      <path d="M20 7h-5V2" />
      <path d="M4.9 6.4A8 8 0 0 1 19.7 7M4 17h5v5" />
      <path d="M19.1 17.6A8 8 0 0 1 4.3 17" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7h-5V2" />
      <path d="M20 7a9 9 0 1 0 1 8" />
    </>
  ),
  signout: (
    <>
      <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
      <path d="m16 8 4 4-4 4m4-4H9" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  warning: (
    <>
      <path d="M12 3 2.8 20h18.4L12 3Z" />
      <path d="M12 9v4m0 3h.01" />
    </>
  ),
  pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  chart: (
    <>
      <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  connection: (
    <>
      <path d="M8 12h8M6 8v8m12-8v8" />
      <path d="M3 6h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3M21 6h-3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l4 4v14H6V3Z" />
      <path d="M14 3v5h5M9 13h6m-6 4h6" />
    </>
  ),
  mapping: (
    <>
      <path d="M4 7h10m0 0-3-3m3 3-3 3M20 17H10m0 0 3-3m-3 3 3 3" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" />
    </>
  ),
}

export default function ScanIcon({ name, size = 20 }) {
  return (
    <svg
      aria-hidden="true"
      className="scan-icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        {paths[name] || <circle cx="12" cy="12" r="8" />}
      </g>
    </svg>
  )
}
