import { useState, useRef } from 'react'
import {
  UploadCloud, ImageIcon, RefreshCw, AlertTriangle,
  MapPin, CheckCircle, Sliders
} from 'lucide-react'
import { detectImage } from '../services/api'
import { PageHeader, AcademicNote, SeverityBadge, Spinner } from '../components/ui'

const SAMPLE_IMAGES = [
  { name: 'India_000105.jpg', label: 'Sample 1 (Pothole - India D40)', road: 'MG Road, Bengaluru' },
  { name: 'India_000173.jpg', label: 'Sample 2 (Multi-Damage)', road: 'NH 44 Highway' },
  { name: 'India_000402.jpg', label: 'Sample 3 (Severe Hazard)', road: 'Outer Ring Road' },
]

function DropZone({ onFile }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef()

  return (
    <div
      className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
        drag ? 'border-blue-500 bg-blue-50/60' : 'border-blue-200 hover:border-blue-400 bg-white'
      }`}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => {
        e.preventDefault()
        setDrag(false)
        if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0])
      }}
      onClick={() => inputRef.current.click()}
    >
      <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
        <UploadCloud size={24} />
      </div>
      <p className="text-sm font-semibold text-slate-700">Drop a road image or click to browse</p>
      <p className="text-xs text-slate-400 mt-1">Supports JPG, PNG, WebP (RDD2022 trained model)</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]) }}
      />
    </div>
  )
}

export default function ImageDetectionPage() {
  const [file,          setFile]          = useState(null)
  const [preview,       setPreview]       = useState(null)
  const [result,        setResult]        = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState(null)
  const [roadName,      setRoadName]      = useState('')
  const [location,      setLocation]      = useState({ lat: '', lon: '' })
  const [confThreshold, setConfThreshold] = useState(0.15)

  const handleFile = selectedFile => {
    setFile(selectedFile)
    setPreview(URL.createObjectURL(selectedFile))
    setResult(null)
    setError(null)
  }

  const loadSample = async (sample) => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/static/samples/${sample.name}`)
      if (!res.ok) throw new Error('Could not fetch sample image')
      const blob = await res.blob()
      const sampleFile = new File([blob], sample.name, { type: 'image/jpeg' })
      setFile(sampleFile)
      setPreview(URL.createObjectURL(sampleFile))
      setRoadName(sample.road)
      setLocation({ lat: '12.9716', lon: '77.5946' })

      const data = await detectImage(sampleFile, 12.9716, 77.5946, sample.road, confThreshold)
      setResult(data)
    } catch (e) {
      setError(e.message || 'Failed to load sample image')
    } finally {
      setLoading(false)
    }
  }

  const handleDetect = async (overrideConf = null) => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const lat = location.lat ? parseFloat(location.lat) : null
      const lon = location.lon ? parseFloat(location.lon) : null
      const conf = overrideConf ?? confThreshold
      const data = await detectImage(file, lat, lon, roadName || null, conf)
      setResult(data)
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Detection failed. Ensure backend is running.')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    setRoadName('')
    setLocation({ lat: '', lon: '' })
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <PageHeader
        title="Image Detection"
        subtitle="Upload a road image or choose a sample to detect potholes using YOLOv8s"
      >
        {file && (
          <button className="btn-secondary" onClick={reset}>
            <RefreshCw size={14} /> New Image
          </button>
        )}
      </PageHeader>

      <AcademicNote>
        Model: YOLOv8s trained on RDD2022 India D40 (pothole) class.
        Estimated Severity is a bounding-box area proxy (Small &lt; 1%, Medium 1-4%, Large &gt; 4%), not physical depth.
      </AcademicNote>

      {/* Quick Test Sample Buttons */}
      <div className="card py-4 bg-gradient-to-r from-blue-50/50 to-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            Quick Test with RDD2022 Verified Samples:
          </div>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_IMAGES.map((sample, i) => (
              <button
                key={i}
                type="button"
                onClick={() => loadSample(sample)}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-medium bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!file ? (
        <div className="card">
          <DropZone onFile={handleFile} />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Left: image with visual bounding boxes overlay */}
          <div className="space-y-4">
            <div className="card p-0 overflow-hidden relative bg-slate-900 flex items-center justify-center min-h-[300px]">
              <div className="relative inline-block max-w-full">
                <img
                  src={preview}
                  alt="road preview"
                  className="max-w-full max-h-[380px] object-contain block mx-auto"
                />

                {/* Overlaid Bounding Boxes */}
                {result?.detections?.map((d, i) => {
                  const box = d.bbox || [
                    d.bounding_box?.x1 || 0,
                    d.bounding_box?.y1 || 0,
                    d.bounding_box?.x2 || 0,
                    d.bounding_box?.y2 || 0
                  ]
                  const left = `${Math.max(0, box[0] * 100)}%`
                  const top = `${Math.max(0, box[1] * 100)}%`
                  const width = `${Math.max(3, (box[2] - box[0]) * 100)}%`
                  const height = `${Math.max(3, (box[3] - box[1]) * 100)}%`
                  const sev = d.estimated_severity || d.estimated_severity_proxy || 'Small'

                  return (
                    <div
                      key={i}
                      className="absolute border-2 border-red-500 bg-red-500/20 pointer-events-none rounded transition-all"
                      style={{ left, top, width, height }}
                    >
                      <span className="absolute -top-5 left-0 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                        #{i + 1} Pothole {(d.confidence * 100).toFixed(0)}% ({sev})
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Threshold & Metadata Controls */}
            <div className="card space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Sliders size={13} className="text-blue-500" />
                    Confidence Threshold:
                  </label>
                  <span className="text-xs font-bold text-blue-600 font-mono">
                    {(confThreshold * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.50"
                  step="0.01"
                  value={confThreshold}
                  onChange={e => {
                    const val = parseFloat(e.target.value)
                    setConfThreshold(val)
                    if (result) handleDetect(val)
                  }}
                  className="w-full accent-blue-500 cursor-pointer"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Adjust slider to detect fainter or clearer pothole boundaries.
                </p>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">Road Name (Optional)</label>
                <input
                  type="text"
                  value={roadName}
                  onChange={e => setRoadName(e.target.value)}
                  placeholder="e.g. MG Road, Bangalore"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Latitude</label>
                  <input
                    type="number" step="any"
                    value={location.lat}
                    onChange={e => setLocation(p => ({ ...p, lat: e.target.value }))}
                    placeholder="12.9716"
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Longitude</label>
                  <input
                    type="number" step="any"
                    value={location.lon}
                    onChange={e => setLocation(p => ({ ...p, lon: e.target.value }))}
                    placeholder="77.5946"
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>
            </div>

            <button
              className="btn-primary w-full justify-center py-3 text-sm font-semibold"
              onClick={() => handleDetect()}
              disabled={loading}
            >
              {loading ? (
                <><Spinner size={16} /> Detecting Potholes…</>
              ) : (
                <><ImageIcon size={16} /> Run Detection ({ (confThreshold * 100).toFixed(0) }% Conf)</>
              )}
            </button>

            {error && (
              <div className="flex gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Right: results summary & details */}
          <div className="space-y-4">
            {result ? (
              <>
                <div className="card">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center justify-between">
                    <span>Detection Summary</span>
                    <span className="text-xs font-normal text-slate-400">
                      Inference: {result.inference_ms?.toFixed(0) ?? 0} ms
                    </span>
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <dt className="text-slate-500">Potholes Detected</dt>
                      <dd className={`font-bold text-base ${result.pothole_count > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {result.pothole_count}
                      </dd>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <dt className="text-slate-500">Status</dt>
                      <dd className="font-medium">
                        {result.pothole_count > 0 ? (
                          <span className="text-amber-600 flex items-center gap-1">
                            <AlertTriangle size={14} /> Pothole(s) found
                          </span>
                        ) : (
                          <span className="text-emerald-600 flex items-center gap-1">
                            <CheckCircle size={14} /> Road clear
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <dt className="text-slate-500">Est. Severity</dt>
                      <dd><SeverityBadge severity={result.dominant_severity || 'Small'} /></dd>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <dt className="text-slate-500">Avg Confidence</dt>
                      <dd className="font-semibold text-slate-800">
                        {result.avg_confidence ? `${(result.avg_confidence * 100).toFixed(1)}%` : '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <dt className="text-slate-500">Road</dt>
                      <dd className="font-medium text-slate-700">{result.road_name || roadName || 'Surveyed Road'}</dd>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <dt className="text-slate-500">Warehouse Fact ID</dt>
                      <dd className="font-mono text-[11px] text-slate-400 truncate max-w-[180px]">
                        {result.detection_id || 'Recorded'}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Per-pothole table */}
                {result.detections?.length > 0 && (
                  <div className="card overflow-x-auto">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Per-Pothole Details</h3>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-100">
                          <th className="text-left pb-2">#</th>
                          <th className="text-left pb-2">Confidence</th>
                          <th className="text-left pb-2">Est. Severity</th>
                          <th className="text-left pb-2">Normalized BBox</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {result.detections.map((d, i) => {
                          const box = d.bbox || [
                            d.bounding_box?.x1 || 0,
                            d.bounding_box?.y1 || 0,
                            d.bounding_box?.x2 || 0,
                            d.bounding_box?.y2 || 0
                          ]
                          const sev = d.estimated_severity || d.estimated_severity_proxy || 'Small'
                          return (
                            <tr key={i}>
                              <td className="py-2 font-bold text-slate-700">#{i + 1}</td>
                              <td className="py-2 font-semibold text-blue-600">{(d.confidence * 100).toFixed(1)}%</td>
                              <td className="py-2"><SeverityBadge severity={sev} /></td>
                              <td className="py-2 text-slate-400 font-mono text-[11px]">
                                [{box.map(v => typeof v === 'number' ? v.toFixed(3) : v).join(', ')}]
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <p className="text-[10px] text-amber-700 mt-3 bg-amber-50 rounded-lg p-2 border border-amber-100">
                      Estimated Severity = bounding-box area proxy; NOT physical pothole depth.
                    </p>
                  </div>
                )}

                {result.location?.latitude && (
                  <div className="card">
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">GPS Location</h3>
                    <p className="text-sm text-slate-600 flex items-center gap-1 font-mono">
                      <MapPin size={13} className="text-blue-500" />
                      {result.location.latitude.toFixed(4)}, {result.location.longitude.toFixed(4)}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="card flex flex-col items-center justify-center py-20 text-slate-400">
                <ImageIcon size={44} className="mb-3 opacity-30 text-blue-400" />
                <p className="text-sm font-medium">Click "Run Detection" or select a Sample above</p>
                <p className="text-xs text-slate-400 mt-1">YOLOv8s will analyze and highlight detected potholes</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
