import { useEffect, useState } from 'react'
import { Clock, ChevronLeft, ChevronRight, MapPin, AlertCircle } from 'lucide-react'
import { fetchDetections } from '../services/api'
import { PageHeader, Empty, SeverityBadge, Spinner } from '../components/ui'

function Pagination({ page, total, pageSize, onPage }) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between mt-4">
      <button
        className="btn-secondary"
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
      >
        <ChevronLeft size={14} /> Prev
      </button>
      <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
      <button
        className="btn-secondary"
        onClick={() => onPage(page + 1)}
        disabled={page === totalPages}
      >
        Next <ChevronRight size={14} />
      </button>
    </div>
  )
}

export default function HistoryPage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(1)
  const PAGE_SIZE = 20

  const load = p => {
    setLoading(true)
    fetchDetections(p, PAGE_SIZE)
      .then(d => { setData(d); setPage(p) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(1) }, [])

  const detections = data?.detections || data?.data || []
  const total      = data?.total      || 0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <PageHeader
        title="Detection History"
        subtitle="All pothole detections stored in the data warehouse"
      >
        <button className="btn-secondary" onClick={() => load(1)}>
          <Clock size={14} /> Refresh
        </button>
      </PageHeader>

      {loading ? (
        <div className="card flex items-center justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : detections.length === 0 ? (
        <div className="card">
          <Empty
            message="No detection data available. Run an image, webcam, or video detection first."
            icon={AlertCircle}
          />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">
              {total} total detections in warehouse
            </h2>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-100">
                <th className="text-left pb-3">ID</th>
                <th className="text-left pb-3">Timestamp</th>
                <th className="text-left pb-3">Source</th>
                <th className="text-left pb-3">Road</th>
                <th className="text-left pb-3">Location</th>
                <th className="text-left pb-3">Potholes</th>
                <th className="text-left pb-3">Confidence</th>
                <th className="text-left pb-3">Est. Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {detections.map(d => (
                <tr key={d.detection_id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 text-xs text-slate-400 font-mono">
                    {d.detection_id ? d.detection_id.substring(0, 8) + '…' : '—'}
                  </td>
                  <td className="py-2.5 text-xs whitespace-nowrap">
                    {d.timestamp ? new Date(d.timestamp).toLocaleString() : (d.date ? `${d.date} ${d.time || ''}` : '—')}
                  </td>
                  <td className="py-2.5 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium text-[11px]">
                      {d.source || '—'}
                    </span>
                  </td>
                  <td className="py-2.5 font-medium">{d.road_name || d.road || '—'}</td>
                  <td className="py-2.5 text-xs text-slate-500">
                    {d.latitude != null ? (
                      <span className="flex items-center gap-1">
                        <MapPin size={11} className="text-blue-500" />
                        {Number(d.latitude).toFixed(3)}, {Number(d.longitude).toFixed(3)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-2.5">
                    <span className={`font-bold px-2 py-0.5 rounded-md ${d.pothole_count > 0 ? 'bg-red-50 text-red-600 border border-red-100' : 'text-slate-400'}`}>
                      {d.pothole_count}
                    </span>
                  </td>
                  <td className="py-2.5 text-xs font-mono">
                    {(d.confidence ?? d.avg_confidence) != null
                      ? `${(((d.confidence ?? d.avg_confidence)) * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                  <td className="py-2.5">
                    <SeverityBadge severity={d.estimated_severity || d.severity || d.max_severity || 'Small'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Pagination
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            onPage={load}
          />
        </div>
      )}
    </div>
  )
}
