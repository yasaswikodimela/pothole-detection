import { useEffect, useState } from 'react'
import { BarChart2, Layers, GitBranch, Filter, Grid, Users } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell, PieChart, Pie
} from 'recharts'
import {
  fetchOlapRollup, fetchOlapDrilldown, fetchOlapSlice,
  fetchOlapDice, fetchClusters
} from '../services/api'
import { PageHeader, AcademicNote, Empty, Spinner, Section } from '../components/ui'

const CLUSTER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

function TabBtn({ active, onClick, children, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors
        ${active ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
    >
      {Icon && <Icon size={14} />} {children}
    </button>
  )
}

// ── OLAP Roll-Up panel ─────────────────────────────────────────────────────
function RollUpPanel() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOlapRollup()
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-12"><Spinner size={28} /></div>

  const rows = data?.monthly_rollup || []
  if (!rows.length) return <Empty message="No detection data available. Run some detections first." />

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        OLAP Roll-Up: daily detections aggregated → monthly totals.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="total_potholes" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Total Potholes" />
          <Bar dataKey="detection_count" fill="#bfdbfe" radius={[4, 4, 0, 0]} name="Detection Sessions" />
        </BarChart>
      </ResponsiveContainer>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 border-b border-slate-100">
            <th className="text-left pb-2">Month</th>
            <th className="text-left pb-2">Sessions</th>
            <th className="text-left pb-2">Potholes</th>
            <th className="text-left pb-2">Avg Confidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="py-1.5 font-medium">{r.month}</td>
              <td className="py-1.5">{r.detection_count}</td>
              <td className="py-1.5 font-bold text-red-600">{r.total_potholes}</td>
              <td className="py-1.5">{r.avg_confidence != null ? `${(r.avg_confidence * 100).toFixed(1)}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── OLAP Drill-Down panel ──────────────────────────────────────────────────
function DrillDownPanel() {
  const [year,    setYear]    = useState(new Date().getFullYear())
  const [month,   setMonth]   = useState('')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)

  const load = () => {
    setLoading(true)
    fetchOlapDrilldown(year, month || null)
      .then(setData)
      .finally(() => setLoading(false))
  }

  const rows = data?.drilldown || []

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        OLAP Drill-Down: zoom from year → month → day level.
      </p>
      <div className="flex flex-wrap gap-3">
        <input
          type="number" value={year} onChange={e => setYear(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-brand-400"
          placeholder="Year"
        />
        <input
          type="number" value={month} onChange={e => setMonth(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-brand-400"
          placeholder="Month (opt)"
          min={1} max={12}
        />
        <button className="btn-primary" onClick={load} disabled={loading}>
          {loading ? <Spinner size={14} /> : 'Drill Down'}
        </button>
      </div>

      {rows.length === 0 && data !== null && (
        <Empty message="No data for selected period." />
      )}

      {rows.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey={rows[0]?.day ? 'day' : 'month'} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="total_potholes" stroke="#ef4444" dot={false} name="Potholes" />
              <Line type="monotone" dataKey="detection_count" stroke="#3b82f6" dot={false} name="Sessions" />
            </LineChart>
          </ResponsiveContainer>
          <table className="w-full text-xs max-h-48 overflow-y-auto block">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100">
                <th className="text-left pb-2">Date</th>
                <th className="text-left pb-2">Sessions</th>
                <th className="text-left pb-2">Potholes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="py-1.5">{r.day || r.month || r.year}</td>
                  <td className="py-1.5">{r.detection_count}</td>
                  <td className="py-1.5 font-bold text-red-600">{r.total_potholes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

// ── OLAP Slice panel ───────────────────────────────────────────────────────
function SlicePanel() {
  const [road,    setRoad]    = useState('')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)

  const load = () => {
    if (!road.trim()) return
    setLoading(true)
    fetchOlapSlice(road.trim())
      .then(setData)
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        OLAP Slice: filter data warehouse to one road only.
      </p>
      <div className="flex gap-3">
        <input
          type="text" value={road} onChange={e => setRoad(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
          className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          placeholder="Road name (e.g. MG Road)"
        />
        <button className="btn-primary" onClick={load} disabled={loading}>
          {loading ? <Spinner size={14} /> : 'Slice'}
        </button>
      </div>

      {data && (
        <div className="card bg-slate-50">
          {data.slice_result?.length === 0 ? (
            <Empty message={`No detections found for "${road}".`} />
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-100">
                  <th className="text-left pb-2">Date</th>
                  <th className="text-left pb-2">Potholes</th>
                  <th className="text-left pb-2">Confidence</th>
                  <th className="text-left pb-2">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.slice_result.map((r, i) => (
                  <tr key={i}>
                    <td className="py-1.5">{r.date || '—'}</td>
                    <td className="py-1.5 font-bold text-red-600">{r.pothole_count}</td>
                    <td className="py-1.5">{r.avg_confidence != null ? `${(r.avg_confidence * 100).toFixed(1)}%` : '—'}</td>
                    <td className="py-1.5">{r.severity || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ── OLAP Dice panel ────────────────────────────────────────────────────────
function DicePanel() {
  const [severity, setSeverity] = useState('large')
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(false)

  const load = () => {
    setLoading(true)
    fetchOlapDice({ severity })
      .then(setData)
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        OLAP Dice: multi-dimensional filter — e.g. severity + confidence threshold.
      </p>
      <div className="flex gap-3 flex-wrap">
        <select
          value={severity}
          onChange={e => setSeverity(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="large">Large severity</option>
          <option value="medium">Medium severity</option>
          <option value="small">Small severity</option>
        </select>
        <button className="btn-primary" onClick={load} disabled={loading}>
          {loading ? <Spinner size={14} /> : 'Dice'}
        </button>
      </div>

      {data && (
        data.dice_result?.length === 0 ? (
          <Empty message="No records match the selected dice criteria." />
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100">
                <th className="text-left pb-2">Road</th>
                <th className="text-left pb-2">Date</th>
                <th className="text-left pb-2">Potholes</th>
                <th className="text-left pb-2">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.dice_result?.map((r, i) => (
                <tr key={i}>
                  <td className="py-1.5">{r.road_name || '—'}</td>
                  <td className="py-1.5">{r.date || '—'}</td>
                  <td className="py-1.5 font-bold text-red-600">{r.pothole_count}</td>
                  <td className="py-1.5">{r.severity || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}

// ── K-Means panel ──────────────────────────────────────────────────────────
function KMeansPanel() {
  const [k,       setK]       = useState(3)
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const load = () => {
    setLoading(true); setError(null)
    fetchClusters(k)
      .then(setData)
      .catch(e => setError(e.response?.data?.detail || e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const clusters = data?.clusters || []
  const pieData  = clusters.map((c, i) => ({
    name:  `Cluster ${c.cluster_id} (${c.label})`,
    value: c.road_count,
    color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-xs text-slate-500 flex-1">
          K-Means clusters <strong>roads</strong> by pothole frequency and severity.
          YOLO is the detector; K-Means is the DMDW analysis tool.
        </p>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">k =</label>
          <input
            type="number" value={k} min={2} max={10}
            onChange={e => setK(Number(e.target.value))}
            className="border border-slate-200 rounded-xl px-2 py-1.5 text-sm w-16 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <button className="btn-primary" onClick={load} disabled={loading}>
            {loading ? <Spinner size={14} /> : 'Cluster'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-800 text-sm">
          {error}
          {error.includes('roads') && (
            <p className="mt-1 text-xs">Run more detections with different road names to enable clustering.</p>
          )}
        </div>
      )}

      {loading && <div className="flex justify-center py-8"><Spinner size={28} /></div>}

      {clusters.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData} cx="50%" cy="50%"
                  outerRadius={80} dataKey="value"
                  label={({ name, value }) => `${value} roads`}
                >
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            {clusters.map((c, i) => (
              <div key={i} className="p-3 rounded-xl border border-slate-100">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ background: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }}
                  />
                  <span className="text-sm font-semibold text-slate-700">
                    Cluster {c.cluster_id}: {c.label}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{c.description}</p>
                <div className="flex flex-wrap gap-3 mt-2 text-xs">
                  <span><span className="text-slate-400">Roads:</span> {c.road_count}</span>
                  <span><span className="text-slate-400">Avg potholes:</span> {c.avg_pothole_count?.toFixed(1)}</span>
                  <span><span className="text-slate-400">High severity:</span> {c.avg_high_severity?.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AcademicNote>
        K-Means clusters roads by detection statistics. YOLO detects potholes.
        K-Means does NOT detect potholes — it is a DMDW data-mining analysis technique.
      </AcademicNote>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
const TABS = [
  { id: 'rollup',    label: 'Roll-Up',    icon: Layers    },
  { id: 'drilldown', label: 'Drill-Down', icon: GitBranch },
  { id: 'slice',     label: 'Slice',      icon: Filter    },
  { id: 'dice',      label: 'Dice',       icon: Grid      },
  { id: 'kmeans',    label: 'K-Means',    icon: Users     },
]

export default function AnalyticsPage() {
  const [tab, setTab] = useState('rollup')

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <PageHeader
        title="DMDW Analytics"
        subtitle="OLAP operations & K-Means road hazard clustering"
      />

      <AcademicNote>
        <strong>Architecture:</strong> RDD2022 → YOLOv8s → Pothole Detection → ETL → Star Schema →
        OLAP (Roll-Up / Drill-Down / Slice / Dice) → K-Means Road Clustering → Dashboard
      </AcademicNote>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(t => (
          <TabBtn
            key={t.id}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
            icon={t.icon}
          >
            {t.label}
          </TabBtn>
        ))}
      </div>

      {/* Tab content */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          {TABS.find(t => t.id === tab)?.label}
          {tab === 'kmeans' && (
            <span className="badge badge-blue">Data Mining</span>
          )}
          {['rollup', 'drilldown', 'slice', 'dice'].includes(tab) && (
            <span className="badge badge-green">OLAP</span>
          )}
        </h2>

        {tab === 'rollup'    && <RollUpPanel    />}
        {tab === 'drilldown' && <DrillDownPanel />}
        {tab === 'slice'     && <SlicePanel     />}
        {tab === 'dice'      && <DicePanel      />}
        {tab === 'kmeans'    && <KMeansPanel    />}
      </div>
    </div>
  )
}
