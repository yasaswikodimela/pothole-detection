// Reusable stat card
export function StatCard({ label, value, sub, icon: Icon, color = 'blue', loading }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red:    'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="card card-hover">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          {loading ? (
            <div className="h-8 w-24 bg-slate-100 rounded-lg animate-pulse mt-2" />
          ) : (
            <p className="text-2xl font-bold text-slate-900 mt-1 truncate">{value ?? '—'}</p>
          )}
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        {Icon && (
          <div className={`p-2.5 rounded-xl ${colors[color]} flex-shrink-0`}>
            <Icon size={18} />
          </div>
        )}
      </div>
    </div>
  )
}

// Page header
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

// Section wrapper
export function Section({ title, children, className = '' }) {
  return (
    <div className={`card ${className}`}>
      {title && <h2 className="text-sm font-semibold text-slate-700 mb-4">{title}</h2>}
      {children}
    </div>
  )
}

// Empty state
export function Empty({ message = 'No data available.', icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
      {Icon && <Icon size={36} className="mb-3 opacity-40" />}
      <p className="text-sm">{message}</p>
    </div>
  )
}

// Spinner
export function Spinner({ size = 20 }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      className="animate-spin text-brand-600"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

// Severity badge
export function SeverityBadge({ severity }) {
  const map = {
    large:  'badge badge-red',
    medium: 'badge badge-yellow',
    small:  'badge badge-green',
  }
  return (
    <span className={map[severity?.toLowerCase()] || 'badge badge-gray'}>
      {severity ?? 'unknown'}
    </span>
  )
}

// Info note (academic disclaimer)
export function AcademicNote({ children }) {
  return (
    <div className="flex gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800 leading-relaxed">
      <span className="flex-shrink-0 mt-0.5">ℹ️</span>
      <span>{children}</span>
    </div>
  )
}
