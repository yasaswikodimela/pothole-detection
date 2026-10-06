import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Camera, Image, Film, BarChart2, Cpu, AlertCircle, CheckCircle2 } from 'lucide-react'
import { fetchDashboardSummary, fetchHealth } from '../services/api'
import { StatCard, AcademicNote, Spinner } from '../components/ui'

function QuickAction({ to, icon: Icon, label, color }) {
  const colors = {
    blue:   'bg-blue-500 hover:bg-blue-600',
    green:  'bg-green-500 hover:bg-green-600',
    purple: 'bg-purple-500 hover:bg-purple-600',
    orange: 'bg-orange-500 hover:bg-orange-600',
  }
  return (
    <Link
      to={to}
      className={`flex flex-col items-center justify-center gap-2 p-5 rounded-2xl text-white transition-colors ${colors[color]}`}
    >
      <Icon size={24} />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  )
}

export default function HomePage() {
  const [summary, setSummary] = useState(null)
  const [backendOk, setBackendOk] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchHealth()
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false))

    fetchDashboardSummary()
      .then(d => { setSummary(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Hero */}
      <div className="card bg-gradient-to-br from-brand-600 to-brand-800 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">PotholeGuard</h1>
            <p className="text-brand-200 text-sm mt-1">Spot it. Map it. Fix it.</p>
            <p className="text-white/80 text-xs mt-3 max-w-md">
              Real-time pothole detection using YOLOv8s trained on RDD2022 India (D40 class).
              Detections are stored in a star-schema data warehouse and analyzed with OLAP &amp; K-Means clustering.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {backendOk === null ? (
              <Spinner size={18} />
            ) : backendOk ? (
              <span className="flex items-center gap-1.5 text-green-300 text-xs">
                <CheckCircle2 size={14} /> Backend online
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-red-300 text-xs">
                <AlertCircle size={14} /> Backend offline
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Detections"
          value={summary?.total_detections ?? 0}
          icon={Activity}
          color="blue"
          loading={loading}
        />
        <StatCard
          label="Potholes Found"
          value={summary?.total_potholes ?? 0}
          icon={AlertCircle}
          color="red"
          loading={loading}
        />
        <StatCard
          label="Roads Monitored"
          value={summary?.total_roads ?? 0}
          icon={BarChart2}
          color="purple"
          loading={loading}
        />
        <StatCard
          label="Avg Confidence"
          value={summary?.avg_confidence != null ? `${(summary.avg_confidence * 100).toFixed(1)}%` : '—'}
          icon={Cpu}
          color="green"
          loading={loading}
        />
      </div>

      {/* Quick actions */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction to="/live"    icon={Camera}  label="Live Camera"     color="blue"   />
          <QuickAction to="/image"   icon={Image}   label="Upload Image"    color="green"  />
          <QuickAction to="/video"   icon={Film}    label="Upload Video"    color="purple" />
          <QuickAction to="/analytics" icon={BarChart2} label="Analytics"  color="orange" />
        </div>
      </div>

      {/* System info */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Model Info</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['Architecture', 'YOLOv8s'],
              ['Dataset',      'RDD2022 India (D40 — pothole)'],
              ['Training set', '1,224 images · 3,187 boxes'],
              ['Input size',   '640 × 640 px'],
              ['Precision',    '67.89%'],
              ['Recall',       '22.84%'],
              ['mAP50',        '18.40%'],
              ['Latency (CPU)','~376 ms/image'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-800 text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">DMDW Pipeline</h2>
          <div className="space-y-1.5 text-xs text-slate-600">
            {[
              'RDD2022 India D40 dataset',
              'YOLOv8s → pothole detection',
              'ETL → Star Schema (SQLite)',
              'Date · Time · Location · Road · Severity dims',
              'OLAP: Roll-Up / Drill-Down / Slice / Dice',
              'K-Means: road hazard clustering',
              'Dashboard & visualisations',
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AcademicNote>
        <strong>Academic Note:</strong> Severity labels are estimated proxies based on bounding-box area
        and do NOT represent physical pothole depth. Current model has moderate precision (67.89%) but low recall
        (22.84%), reflecting real training constraints. These metrics are reported honestly.
      </AcademicNote>
    </div>
  )
}
