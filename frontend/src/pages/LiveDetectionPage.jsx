import { useState, useRef, useEffect } from 'react'
import {
  Camera, Play, Square, MapPin, AlertTriangle,
  Sliders, ShieldCheck, Activity
} from 'lucide-react'
import { detectFrame } from '../services/api'
import { PageHeader, AcademicNote, SeverityBadge, Spinner } from '../components/ui'

export default function LiveDetectionPage() {
  const [running,       setRunning]       = useState(false)
  const [processing,    setProcessing]    = useState(false)
  const [result,        setResult]        = useState(null)
  const [error,         setError]         = useState(null)
  const [location,      setLocation]      = useState(null)
  const [frameCount,    setFrameCount]    = useState(0)
  const [fps,           setFps]           = useState(0)
  const [confThreshold, setConfThreshold] = useState(0.15)
  const [roadName,      setRoadName]      = useState('Live Survey Road')

  const videoRef      = useRef(null)
  const canvasRef     = useRef(null)
  const timerRef      = useRef(null)
  const lastTimeRef   = useRef(Date.now())
  const processingRef = useRef(false)
  const confRef       = useRef(confThreshold)

  useEffect(() => {
    confRef.current = confThreshold
  }, [confThreshold])

  // Get GPS geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => console.log('Geolocation not granted or unavailable')
      )
    }
  }, [])

  const captureFrame = async () => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || processingRef.current) return
    if (video.videoWidth === 0 || video.videoHeight === 0) return

    processingRef.current = true
    setProcessing(true)

    try {
      // 1. Offscreen capture
      const offscreen = document.createElement('canvas')
      offscreen.width = video.videoWidth
      offscreen.height = video.videoHeight
      const offCtx = offscreen.getContext('2d')
      offCtx.drawImage(video, 0, 0, offscreen.width, offscreen.height)

      const base64 = offscreen.toDataURL('image/jpeg', 0.7)

      // 2. Call backend
      const data = await detectFrame(
        base64,
        location?.lat ?? null,
        location?.lon ?? null,
        roadName,
        confRef.current
      )

      setResult(data)
      setFrameCount(c => c + 1)

      // Calculate instantaneous FPS
      const now = Date.now()
      const diff = now - lastTimeRef.current
      if (diff > 0) {
        setFps(parseFloat((1000 / diff).toFixed(1)))
      }
      lastTimeRef.current = now

      // 3. Draw bounding boxes on the overlay canvas
      const ctx = canvas.getContext('2d')
      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (data.detections && data.detections.length > 0) {
        data.detections.forEach((det, idx) => {
          const box = det.bbox || [
            det.bounding_box?.x1 || 0,
            det.bounding_box?.y1 || 0,
            det.bounding_box?.x2 || 0,
            det.bounding_box?.y2 || 0
          ]

          // Scale from normalized [0..1] to canvas pixels
          const x1 = box[0] <= 1.0 ? box[0] * canvas.width : box[0]
          const y1 = box[1] <= 1.0 ? box[1] * canvas.height : box[1]
          const x2 = box[2] <= 1.0 ? box[2] * canvas.width : box[2]
          const y2 = box[3] <= 1.0 ? box[3] * canvas.height : box[3]
          const w = Math.max(4, x2 - x1)
          const h = Math.max(4, y2 - y1)

          // Red bounding box
          ctx.strokeStyle = '#ef4444'
          ctx.lineWidth   = 3.5
          ctx.strokeRect(x1, y1, w, h)

          // Background box fill
          ctx.fillStyle = 'rgba(239, 68, 68, 0.15)'
          ctx.fillRect(x1, y1, w, h)

          // Pill label
          const sev = det.estimated_severity || det.estimated_severity_proxy || 'Est'
          const label = `#${idx + 1} Pothole ${(det.confidence * 100).toFixed(0)}% (${sev})`
          ctx.font = 'bold 13px Inter, sans-serif'
          const textWidth = ctx.measureText(label).width
          const labelY = y1 > 24 ? y1 - 24 : y1

          ctx.fillStyle = 'rgba(239, 68, 68, 0.95)'
          ctx.fillRect(x1, labelY, textWidth + 12, 22)
          ctx.fillStyle = '#ffffff'
          ctx.fillText(label, x1 + 6, labelY + 16)
        })
      }
    } catch (err) {
      // Ignore individual frame timeouts
    } finally {
      processingRef.current = false
      setProcessing(false)
    }
  }

  const startDetection = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setRunning(true)
      setFrameCount(0)
      lastTimeRef.current = Date.now()

      // Poll every 350 ms for responsive CPU inference
      timerRef.current = setInterval(captureFrame, 350)
    } catch (e) {
      setError('Camera access denied or unavailable: ' + e.message)
    }
  }

  const stopDetection = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    const stream = videoRef.current?.srcObject
    stream?.getTracks().forEach(t => t.stop())
    if (videoRef.current) videoRef.current.srcObject = null

    // Clear overlay canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    }

    setRunning(false)
    setProcessing(false)
    processingRef.current = false
  }

  useEffect(() => {
    return () => stopDetection()
  }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <PageHeader
        title="Live Camera Detection"
        subtitle="Real-time webcam pothole detection using YOLOv8s"
      >
        {location && (
          <span className="flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100 font-mono">
            <MapPin size={12} className="text-blue-500" /> {location.lat.toFixed(4)}, {location.lon.toFixed(4)}
          </span>
        )}
      </PageHeader>

      <AcademicNote>
        Webcam frames are sent to the YOLOv8s backend and stored into the SQLite star-schema data warehouse upon detection.
        Inference latency on CPU is ~350 ms/frame.
      </AcademicNote>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Camera feed + overlay */}
        <div className="lg:col-span-2 card p-0 overflow-hidden relative bg-slate-900 min-h-[380px] flex items-center justify-center">
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Native Video Feed */}
            <video
              ref={videoRef}
              className="w-full max-h-[460px] object-contain block mx-auto"
              playsInline
              muted
              style={{ display: running ? 'block' : 'none' }}
            />

            {/* Bounding Box Canvas Overlay (pointer-events none so it never blocks video) */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none object-contain"
              style={{ display: running ? 'block' : 'none' }}
            />

            {!running && (
              <div className="flex flex-col items-center justify-center h-80 text-slate-400">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 text-blue-400 flex items-center justify-center mb-4">
                  <Camera size={32} />
                </div>
                <p className="text-sm font-medium text-slate-300">Camera Feed Inactive</p>
                <p className="text-xs text-slate-500 mt-1">Click "Start Webcam Detection" below to begin</p>
              </div>
            )}

            {running && (
              <>
                <div className="absolute top-3 left-3 bg-black/70 backdrop-blur rounded-full px-3 py-1 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  <span className="text-white text-xs font-semibold">Frame #{frameCount}</span>
                  <span className="text-slate-400 text-xs">|</span>
                  <span className="text-blue-300 text-xs font-mono">{fps} FPS</span>
                </div>

                {processing && (
                  <div className="absolute top-3 right-3 bg-black/70 backdrop-blur rounded-full px-3 py-1 flex items-center gap-1.5 text-xs text-blue-200">
                    <Spinner size={12} />
                    <span>Inference…</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Live HUD & Controls */}
        <div className="space-y-4">
          <div className="card space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Activity size={16} className="text-blue-500" />
              Live Telemetry
            </h3>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                <span className="text-xs text-slate-500 block">Potholes</span>
                <span className={`text-xl font-bold ${result?.pothole_count ? 'text-red-600' : 'text-slate-700'}`}>
                  {result?.pothole_count ?? 0}
                </span>
              </div>
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                <span className="text-xs text-slate-500 block">Est. Severity</span>
                <span className="text-xs font-semibold text-slate-700 block mt-1">
                  {result?.dominant_severity ? <SeverityBadge severity={result.dominant_severity} /> : '—'}
                </span>
              </div>
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                <span className="text-xs text-slate-500 block">Avg Conf</span>
                <span className="text-sm font-bold text-slate-700 block mt-1">
                  {result?.avg_confidence ? `${(result.avg_confidence * 100).toFixed(0)}%` : '—'}
                </span>
              </div>
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                <span className="text-xs text-slate-500 block">Latency</span>
                <span className="text-sm font-bold text-slate-700 block mt-1">
                  {result?.inference_ms ? `${result.inference_ms.toFixed(0)} ms` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="card space-y-3">
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
                max="0.45"
                step="0.01"
                value={confThreshold}
                onChange={e => setConfThreshold(parseFloat(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-1">Road Name</label>
              <input
                type="text"
                value={roadName}
                onChange={e => setRoadName(e.target.value)}
                placeholder="e.g. Ring Road Survey"
                className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {!running ? (
              <button
                className="btn-primary w-full justify-center py-3 text-sm font-semibold"
                onClick={startDetection}
              >
                <Play size={16} /> Start Webcam Detection
              </button>
            ) : (
              <button
                className="btn-danger w-full justify-center py-3 text-sm font-semibold"
                onClick={stopDetection}
              >
                <Square size={16} /> Stop Detection
              </button>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs flex gap-2">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
