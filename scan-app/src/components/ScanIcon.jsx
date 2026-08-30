const paths = {
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
