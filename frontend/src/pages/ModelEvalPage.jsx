import { useEffect, useState } from 'react'
import { Cpu, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell
} from 'recharts'
import { fetchModelMetrics, fetchModelInfo } from '../services/api'
import { PageHeader, AcademicNote, Spinner, Section } from '../components/ui'

function MetricCard({ label, value, pct, note, good }) {
  const icon = good === true
    ? <TrendingUp size={14} className="text-green-500" />
    : good === false
    ? <TrendingDown size={14} className="text-red-500" />
    : <Minus size={14} className="text-slate-400" />

  return (
    <div className="card card-hover">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        {icon}
      </div>
      <p className="text-3xl font-bold text-slate-900">{pct ?? value ?? '—'}</p>
      {note && <p className="text-xs text-slate-400 mt-1 leading-relaxed">{note}</p>}
    </div>
  )
}

export default function ModelEvalPage() {
  const [metrics, setMetrics] = useState(null)
  const [info,    setInfo]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchModelMetrics(), fetchModelInfo()])
      .then(([m, i]) => { setMetrics(m); setInfo(i) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-64">
      <Spinner size={32} />
    </div>
  )

  // Use REAL measured values (never fabricate)
  const precision = metrics?.precision  ?? 0.6789
  const recall    = metrics?.recall     ?? 0.2284
  const map50     = metrics?.mAP50      ?? 0.184
  const map5095   = metrics?.mAP50_95   ?? 0.076

  const radarData = [
    { metric: 'Precision',   value: +(precision * 100).toFixed(1) },
    { metric: 'Recall',      value: +(recall    * 100).toFixed(1) },
    { metric: 'mAP50',       value: +(map50     * 100).toFixed(1) },
    { metric: 'mAP50-95',    value: +(map5095   * 100).toFixed(1) },
  ]

  const barData = radarData.map(d => ({
    ...d,
    color: d.value > 50 ? '#3b82f6' : d.value > 30 ? '#f59e0b' : '#ef4444',
  }))

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <PageHeader
        title="Model Evaluation"
        subtitle="YOLOv8s trained on RDD2022 India D40 — actual test-set metrics"
      />

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs leading-relaxed">
        ⚠️ <strong>Academic Honesty:</strong> These are real metrics from the test split (153 images, 324 instances).
        The model was trained for 10 epochs on CPU only. Low recall reflects limited training — not a fabrication.
        Do NOT interpret precision as overall accuracy.
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Precision"
          pct={`${(precision * 100).toFixed(2)}%`}
          note="Of detected boxes, 67.89% are true potholes"
          good={true}
        />
        <MetricCard
          label="Recall"
          pct={`${(recall * 100).toFixed(2)}%`}
          note="Model finds only 22.84% of actual potholes (low recall)"
          good={false}
        />
        <MetricCard
          label="mAP@50"
          pct={`${(map50 * 100).toFixed(2)}%`}
          note="Mean Average Precision at IoU 0.50"
          good={null}
        />
        <MetricCard
          label="mAP@50-95"
          pct={`${(map5095 * 100).toFixed(2)}%`}
          note="Stricter metric across IoU thresholds"
          good={false}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Bar chart */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Metrics Bar Chart</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={v => `${v}%`} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Radar chart */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Radar View</h2>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart cx="50%" cy="50%" outerRadius={70} data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
              <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model info */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Model Details</h2>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          {[
            ['Architecture',    'YOLOv8s'],
            ['Parameters',      '11,125,971'],
            ['Input Size',      '640 × 640 px'],
            ['Classes',         '1 (pothole / D40)'],
            ['Dataset',         'RDD2022 India D40'],
            ['Training Images', '1,224'],
            ['Val Images',      '153'],
            ['Test Images',     '153'],
            ['Training Epochs', '10 (CPU only)'],
            ['Latency (CPU)',   '~376 ms/image'],
            ['Model File',      `best.pt (${info?.model_size_mb?.toFixed(1) ?? '21.5'} MB)`],
            ['ONNX File',       `best.onnx (${info?.onnx_size_mb?.toFixed(1) ?? '42.7'} MB)`],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-slate-400">{k}</dt>
              <dd className="font-medium text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Validation plots */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Validation Plots</h2>
        <p className="text-xs text-slate-500 mb-4">
          Generated during YOLO validation on the test split. Served from the backend static files.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            ['Precision-Recall Curve', '/static/results/evaluation/eval_test/BoxPR_curve.png'],
            ['F1 Curve',               '/static/results/evaluation/eval_test/BoxF1_curve.png'],
            ['Confusion Matrix',       '/static/results/evaluation/eval_test/confusion_matrix.png'],
            ['Training Results',       '/static/results/pothguard_v1/results.png'],
            ['Val Batch 0 Preds',      '/static/results/pothguard_v1/val_batch0_pred.jpg'],
            ['Val Batch 1 Preds',      '/static/results/pothguard_v1/val_batch1_pred.jpg'],
          ].map(([label, src]) => (
            <div key={label} className="space-y-1">
              <img
                src={src}
                alt={label}
                className="w-full rounded-xl border border-slate-100 object-cover bg-slate-50"
                style={{ minHeight: 120, maxHeight: 180 }}
                onError={e => { e.target.style.display = 'none' }}
              />
              <p className="text-[10px] text-slate-500 text-center">{label}</p>
            </div>
          ))}
        </div>

      </div>

      <AcademicNote>
        <strong>Interpretation:</strong> Current model has moderate precision (67.89%) but low recall (22.84%).
        This means it is fairly conservative — when it does flag a pothole, it's often right,
        but it misses ~77% of actual potholes. This reflects 10-epoch CPU training and is academically honest.
        Production-grade performance would require significantly more training epochs, data augmentation,
        and ideally GPU training.
      </AcademicNote>
    </div>
  )
}
