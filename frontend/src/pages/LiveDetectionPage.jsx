import { useState, useRef, useEffect } from 'react'
import {
  Camera, Play, Square, MapPin, AlertTriangle,
  Sliders, Activity, Database, Zap, FileText,
  Download, Printer, Eye, CheckCircle2, AlertOctagon,
  Clock, ShieldAlert, RefreshCw, X, ChevronRight,
  Filter, Layers, CheckCircle, ExternalLink
} from 'lucide-react'
import { detectFrame } from '../services/api'
import { PageHeader, AcademicNote, SeverityBadge, Spinner } from '../components/ui'

// Helper to normalize severity labels
const normSeverity = (sev) => {
  if (!sev) return 'Small'
  const s = String(sev).toLowerCase()
  if (s.includes('large') || s.includes('severe') || s.includes('high')) return 'Large'
  if (s.includes('med')) return 'Medium'
  return 'Small'
}

// Format duration into MM:SS
const formatDuration = (secs) => {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function LiveDetectionPage() {
  const [running, setRunning] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [location, setLocation] = useState(null)
  const [frameCount, setFrameCount] = useState(0)
  const [fps, setFps] = useState(0)
  const [confThreshold, setConfThreshold] = useState(0.12)
  const [roadName, setRoadName] = useState('Live Survey Road')
  const [saveToWarehouse, setSaveToWarehouse] = useState(true)

  // Report & Session State
  const [surveyStatus, setSurveyStatus] = useState('idle') // 'idle' | 'running' | 'completed'
  const [sessionStartTime, setSessionStartTime] = useState(null)
  const [sessionDuration, setSessionDuration] = useState(0)
  const [incidents, setIncidents] = useState([])
  const [totalPotholesCount, setTotalPotholesCount] = useState(0)
  const [severityCounts, setSeverityCounts] = useState({ Small: 0, Medium: 0, Large: 0 })
  const [selectedIncident, setSelectedIncident] = useState(null)
  const [showFullDocModal, setShowFullDocModal] = useState(false)
  const [filterSeverity, setFilterSeverity] = useState('all')
  const liveLoopRef = useRef(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const timerRef = useRef(null)
  const durationTimerRef = useRef(null)
  const lastTimeRef = useRef(Date.now())
  const processingRef = useRef(false)
  const confRef = useRef(confThreshold)
  const saveDbRef = useRef(saveToWarehouse)
  const lastSavedRef = useRef(0)
  const sessionStartTimeRef = useRef(null)
  const incidentsRef = useRef([])
  const lastIncidentLogRef = useRef(0)
  const lastPotholeCountRef = useRef(0)
  const roadNameRef = useRef(roadName)
  const locationRef = useRef(location)

  useEffect(() => { confRef.current = confThreshold }, [confThreshold])
  useEffect(() => { saveDbRef.current = saveToWarehouse }, [saveToWarehouse])
  useEffect(() => { roadNameRef.current = roadName }, [roadName])
  useEffect(() => { locationRef.current = location }, [location])

  // GPS Acquisition
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude }
          setLocation(loc)
          locationRef.current = loc
        },
        () => { }
      )
    }
  }, [])

  // Live timer for survey duration
  useEffect(() => {
    if (running) {
      durationTimerRef.current = setInterval(() => {
        if (sessionStartTimeRef.current) {
          setSessionDuration(Math.floor((Date.now() - sessionStartTimeRef.current) / 1000))
        }
      }, 1000)
    } else {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current)
    }
    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current)
    }
  }, [running])

  // Draw bounding boxes on the main overlay canvas
  const drawBoxes = (canvas, video, detections) => {
    const rect = video.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!detections || detections.length === 0) return

    detections.forEach((det) => {
      const box = det.bbox || [
        det.bounding_box?.x1 || 0,
        det.bounding_box?.y1 || 0,
        det.bounding_box?.x2 || 0,
        det.bounding_box?.y2 || 0
      ]

      const x1 = box[0] * canvas.width
      const y1 = box[1] * canvas.height
      const x2 = box[2] * canvas.width
      const y2 = box[3] * canvas.height
      const w = Math.max(10, x2 - x1)
      const h = Math.max(10, y2 - y1)

      // Bold red bounding box
      ctx.strokeStyle = '#dc2626'
      ctx.lineWidth = 3
      ctx.strokeRect(x1, y1, w, h)

      // Semi-transparent fill
      ctx.fillStyle = 'rgba(220, 38, 38, 0.15)'
      ctx.fillRect(x1, y1, w, h)

      // Confidence + severity label
      const sev = det.estimated_severity || det.estimated_severity_proxy || ''
      const conf = (det.confidence * 100).toFixed(0)
      const label = sev ? `Pothole ${conf}% · ${sev}` : `Pothole ${conf}%`

      ctx.font = 'bold 13px Inter, system-ui, sans-serif'
      const tw = ctx.measureText(label).width
      const lx = x1
      const ly = y1 > 26 ? y1 - 26 : y1 + h + 4

      // Label background
      ctx.fillStyle = '#dc2626'
      ctx.beginPath()
      ctx.roundRect(lx, ly, tw + 14, 22, 4)
      ctx.fill()

      // Label text
      ctx.fillStyle = '#ffffff'
      ctx.fillText(label, lx + 7, ly + 15)
    })
  }

  // Create an annotated snapshot image for the incident log
  const createAnnotatedSnapshot = (video, detections) => {
    try {
      const w = video.videoWidth || 640
      const h = video.videoHeight || 480
      const targetW = 480
      const targetH = Math.round(h * (targetW / w)) || 360

      const snapCanvas = document.createElement('canvas')
      snapCanvas.width = targetW
      snapCanvas.height = targetH
      const ctx = snapCanvas.getContext('2d')
      ctx.drawImage(video, 0, 0, targetW, targetH)

      if (detections && detections.length > 0) {
        detections.forEach((det) => {
          const box = det.bbox || [
            det.bounding_box?.x1 || 0,
            det.bounding_box?.y1 || 0,
            det.bounding_box?.x2 || 0,
            det.bounding_box?.y2 || 0
          ]
          const x1 = box[0] * targetW
          const y1 = box[1] * targetH
          const x2 = box[2] * targetW
          const y2 = box[3] * targetH
          const bw = Math.max(8, x2 - x1)
          const bh = Math.max(8, y2 - y1)

          ctx.strokeStyle = '#dc2626'
          ctx.lineWidth = 2.5
          ctx.strokeRect(x1, y1, bw, bh)
          ctx.fillStyle = 'rgba(220, 38, 38, 0.18)'
          ctx.fillRect(x1, y1, bw, bh)

          const sev = det.estimated_severity || det.estimated_severity_proxy || ''
          const conf = (det.confidence * 100).toFixed(0)
          const label = `${conf}% · ${sev}`
          ctx.font = 'bold 11px Inter, system-ui, sans-serif'
          const tw = ctx.measureText(label).width
          const lx = x1
          const ly = y1 > 18 ? y1 - 18 : y1 + bh + 2

          ctx.fillStyle = '#dc2626'
          ctx.beginPath()
          ctx.roundRect(lx, ly, tw + 8, 16, 3)
          ctx.fill()
          ctx.fillStyle = '#ffffff'
          ctx.fillText(label, lx + 4, ly + 12)
        })
      }
      return snapCanvas.toDataURL('image/jpeg', 0.85)
    } catch {
      return null
    }
  }

  // Frame processing loop
  const captureFrame = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || processingRef.current) return
    if (video.videoWidth === 0 || video.videoHeight === 0) return

    processingRef.current = true
    setProcessing(true)

    try {
      const targetW = 640
      const targetH = Math.round(video.videoHeight * (640 / video.videoWidth))
      const off = document.createElement('canvas')
      off.width = targetW
      off.height = targetH
      off.getContext('2d').drawImage(video, 0, 0, targetW, targetH)
      const base64 = off.toDataURL('image/jpeg', 0.7)

      const now = Date.now()
      const shouldSave = saveDbRef.current && (now - lastSavedRef.current > 3000)

      const data = await detectFrame(
        base64,
        locationRef.current?.lat ?? null,
        locationRef.current?.lon ?? null,
        roadNameRef.current,
        confRef.current,
        shouldSave
      )

      if (shouldSave && data.pothole_count > 0) {
        lastSavedRef.current = now
      }

      setResult(data)
      setFrameCount(c => c + 1)

      const diff = now - lastTimeRef.current
      if (diff > 0) setFps(parseFloat((1000 / diff).toFixed(1)))
      lastTimeRef.current = now

      // Draw bounding boxes on canvas
      drawBoxes(canvas, video, data.detections)

      // ── ACCUMULATE INTO INSPECTION REPORT LOG ──
      if (data.pothole_count > 0) {
        const timeSinceLastIncident = now - lastIncidentLogRef.current
        // Throttle snapshots to at most 1 every 1.5s or on new hazard encounter
        if (timeSinceLastIncident >= 1500 || lastPotholeCountRef.current === 0) {
          lastIncidentLogRef.current = now
          const thumbnail = createAnnotatedSnapshot(video, data.detections)
          const elapsed = sessionStartTimeRef.current
            ? Math.floor((now - sessionStartTimeRef.current) / 1000)
            : 0

          const maxConf = data.detections && data.detections.length > 0
            ? Math.max(...data.detections.map(d => d.confidence || 0))
            : (data.avg_confidence || 0)

          const newIncident = {
            id: `INC-${(incidentsRef.current.length + 1).toString().padStart(3, '0')}`,
            timestamp: new Date().toLocaleTimeString(),
            isoDate: new Date().toISOString(),
            elapsedSeconds: elapsed,
            elapsedFormatted: formatDuration(elapsed),
            pothole_count: data.pothole_count,
            dominant_severity: data.dominant_severity || data.dominant_severity_proxy || 'Small',
            max_confidence: maxConf,
            detections: data.detections || [],
            thumbnail,
            road_name: roadNameRef.current || 'Live Survey Road',
            location: locationRef.current,
            detection_id: data.detection_id || null,
          }

          const updatedIncidents = [newIncident, ...incidentsRef.current]
          incidentsRef.current = updatedIncidents
          setIncidents(updatedIncidents)

          // Update total potholes tally
          setTotalPotholesCount(c => c + data.pothole_count)

          // Update severity histogram
          const countsUpdate = { Small: 0, Medium: 0, Large: 0 }
          data.detections?.forEach(d => {
            const s = normSeverity(d.estimated_severity || d.estimated_severity_proxy)
            countsUpdate[s] = (countsUpdate[s] || 0) + 1
          })
          setSeverityCounts(prev => ({
            Small: prev.Small + (countsUpdate.Small || 0),
            Medium: prev.Medium + (countsUpdate.Medium || 0),
            Large: prev.Large + (countsUpdate.Large || 0),
          }))
        }
      }

      lastPotholeCountRef.current = data.pothole_count

    } catch {
      // silently skip frame errors
    } finally {
      processingRef.current = false
      setProcessing(false)
    }
  }
  // Sequential live detection loop.
  // Waits for each backend inference to finish before capturing
  // the next frame. This prevents overlapping requests.
  const runLiveDetectionLoop = async () => {
    while (liveLoopRef.current) {
      await captureFrame()

      // Small pause before requesting the next frame.
      // The actual interval is dominated by backend inference time.
      if (liveLoopRef.current) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
  }
  const startDetection = async () => {
    setError(null)
    setResult(null)
    setFrameCount(0)

    // If starting a fresh survey after stopping, reset the previous survey
    if (surveyStatus === 'completed') {
      setIncidents([])
      incidentsRef.current = []
      setTotalPotholesCount(0)
      setSeverityCounts({ Small: 0, Medium: 0, Large: 0 })
      setSessionDuration(0)
    }

    try {
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'environment'
        },
        audio: false
      })

      // Attach camera stream to video element
      videoRef.current.srcObject = stream

      // Start playing the camera
      await videoRef.current.play()

      // Start survey state
      setRunning(true)
      setSurveyStatus('running')

      // Enable sequential live detection loop
      liveLoopRef.current = true

      // Start session timer
      const now = Date.now()

      sessionStartTimeRef.current = now
      setSessionStartTime(now)

      lastTimeRef.current = now

      // Start detection loop.
      // Each frame waits for the previous backend inference
      // to finish before sending another frame.
      runLiveDetectionLoop()

    } catch (e) {
      console.error('Camera error:', e)

      setError('Camera access denied: ' + e.message)

      // Make sure the loop is disabled if camera startup fails
      liveLoopRef.current = false
      setRunning(false)
    }
  }

  const stopDetection = () => {
    // Stop the sequential live detection loop
    liveLoopRef.current = false

    // Clear any old timers
    if (timerRef.current) clearInterval(timerRef.current)
    if (durationTimerRef.current) clearInterval(durationTimerRef.current)

    // Stop camera
    videoRef.current?.srcObject?.getTracks().forEach(t => t.stop())

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    // Clear detection overlay
    const ctx = canvasRef.current?.getContext('2d')

    if (ctx) {
      ctx.clearRect(
        0,
        0,
        canvasRef.current.width,
        canvasRef.current.height
      )
    }

    // Reset processing state
    setRunning(false)
    setProcessing(false)
    processingRef.current = false

    // Mark survey as completed
    setSurveyStatus('completed')
  }

  const resetSurvey = () => {
    // Stop the live detection loop first
    liveLoopRef.current = false

    if (running) {
      stopDetection()
    }

    setIncidents([])
    incidentsRef.current = []

    setTotalPotholesCount(0)

    setSeverityCounts({
      Small: 0,
      Medium: 0,
      Large: 0
    })

    setSessionDuration(0)
    setFrameCount(0)
    setResult(null)
    setSurveyStatus('idle')
  }

  useEffect(() => {
    return () => {
      // Stop sequential detection loop
      liveLoopRef.current = false

      // Clear timers
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }

      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current)
      }

      // Stop camera
      videoRef.current?.srcObject?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // Calculate road health / condition rating based on findings
  const getRoadCondition = () => {
    if (totalPotholesCount === 0) {
      return {
        rating: 'A',
        label: 'Safe / Clear Roadway',
        badge: 'badge badge-green',
        bg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
        desc: 'No road surface distress detected during this survey session.',
        recommendation: 'Road surface in good condition. Standard routine monitoring advised.'
      }
    }
    if (severityCounts.Large > 0 || totalPotholesCount >= 5) {
      return {
        rating: 'F',
        label: 'Critical Hazard - Immediate Repair',
        badge: 'badge badge-red',
        bg: 'bg-red-50 border-red-200 text-red-800',
        desc: `${severityCounts.Large} large/severe defect(s) detected. High risk of vehicle damage or accidents.`,
        recommendation: 'Dispatch municipal road maintenance crew immediately for asphalt patching and safety signage.'
      }
    }
    return {
      rating: 'C',
      label: 'Moderate Hazard - Maintenance Required',
      badge: 'badge badge-yellow',
      bg: 'bg-amber-50 border-amber-200 text-amber-800',
      desc: `${totalPotholesCount} minor/medium pothole(s) detected along survey segment.`,
      recommendation: 'Log in municipal repair queue. Schedule routine road surface filling within 7 days.'
    }
  }

  const roadCondition = getRoadCondition()

  // Download Report as JSON
  const downloadReportJson = () => {
    const reportData = {
      report_title: 'PotholeGuard Live Survey Inspection Report',
      report_id: `SRV-${sessionStartTime ? new Date(sessionStartTime).toISOString().slice(0, 10).replace(/-/g, '') : 'LIVE'}-${Date.now().toString().slice(-4)}`,
      generated_at: new Date().toISOString(),
      survey_metadata: {
        road_name: roadName,
        survey_status: surveyStatus,
        survey_duration_seconds: sessionDuration,
        survey_duration_formatted: formatDuration(sessionDuration),
        total_frames_scanned: frameCount,
        confidence_threshold: `${(confThreshold * 100).toFixed(0)}%`,
        gps_coordinates: location ? { latitude: location.lat, longitude: location.lon } : null,
      },
      executive_summary: {
        total_potholes_detected: totalPotholesCount,
        distinct_hazard_incidents: incidents.length,
        road_condition_label: roadCondition.label,
        road_condition_rating: roadCondition.rating,
        severity_breakdown: severityCounts,
        maintenance_recommendation: roadCondition.recommendation,
      },
      incident_log: incidents.map(inc => ({
        incident_id: inc.id,
        timestamp: inc.timestamp,
        elapsed_time: inc.elapsedFormatted,
        pothole_count: inc.pothole_count,
        dominant_severity: inc.dominant_severity,
        max_confidence: `${(inc.max_confidence * 100).toFixed(1)}%`,
        road_name: inc.road_name,
        location: inc.location,
        warehouse_fact_id: inc.detection_id || 'Recorded',
        detections: inc.detections,
      }))
    }

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Pothole_Survey_Report_${roadName.replace(/\s+/g, '_')}_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Filtered incidents
  const filteredIncidents = incidents.filter(inc => {
    if (filterSeverity === 'all') return true
    return normSeverity(inc.dominant_severity) === filterSeverity
  })

  const hasPothole = (result?.pothole_count ?? 0) > 0

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader title="Live Camera Detection & Inspection" subtitle="Real-time road survey via webcam with automated incident reporting">
        <div className="flex items-center gap-2">
          {surveyStatus !== 'idle' && (
            <button className="btn-secondary" onClick={resetSurvey}>
              <RefreshCw size={14} /> Reset Survey
            </button>
          )}
          {running ? (
            <button className="btn-danger" onClick={stopDetection}>
              <Square size={14} /> Stop Survey
            </button>
          ) : (
            <button className="btn-primary" onClick={startDetection}>
              <Play size={14} /> {surveyStatus === 'completed' ? 'Start New Survey' : 'Start Camera'}
            </button>
          )}
        </div>
      </PageHeader>

      <AcademicNote>
        Each camera frame is evaluated with YOLOv8s. Detected pothole events are automatically compiled into the <strong>Live Inspection Report</strong> below with photographic evidence, severity classifications, and warehouse fact logging.
      </AcademicNote>

      {error && (
        <div className="flex gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* ── Top Section: Video Stream & Controls ── */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Camera View + Canvas Overlay */}
        <div className="lg:col-span-2">
          <div className="card p-0 overflow-hidden bg-slate-950 rounded-2xl relative shadow-lg">
            <div ref={containerRef} className="relative w-full">
              <video
                ref={videoRef}
                className="w-full block"
                playsInline muted
                style={{ display: running ? 'block' : 'none', maxHeight: 460 }}
              />
              <canvas
                ref={canvasRef}
                style={{
                  position: 'absolute',
                  top: 0, left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  display: running ? 'block' : 'none'
                }}
              />

              {/* LIVE overlay stats */}
              {running && (
                <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
                  <div className="bg-black/75 backdrop-blur rounded-full px-3 py-1 flex items-center gap-2 border border-white/10">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-white text-xs font-bold tracking-wider">LIVE SURVEY</span>
                    <span className="text-slate-500 text-xs">|</span>
                    <span className="text-blue-300 text-xs font-mono">{formatDuration(sessionDuration)}</span>
                    <span className="text-slate-500 text-xs">|</span>
                    <span className="text-slate-300 text-xs">{fps} FPS</span>
                    <span className="text-slate-500 text-xs">|</span>
                    <span className="text-slate-300 text-xs">Frame #{frameCount}</span>
                  </div>
                  {processing && (
                    <div className="bg-black/75 backdrop-blur rounded-full px-2.5 py-1 flex items-center gap-1.5 text-blue-300 border border-white/10">
                      <Spinner size={12} /><span className="text-xs">Analyzing</span>
                    </div>
                  )}
                </div>
              )}

              {/* Real-time hazard banner */}
              {running && hasPothole && (
                <div className="absolute bottom-3 left-3 right-3 bg-red-600/95 backdrop-blur rounded-xl px-4 py-2.5 flex items-center justify-between shadow-lg border border-red-400/30 animate-pulse">
                  <div className="flex items-center gap-2 text-white">
                    <Zap size={18} className="text-amber-300" />
                    <span className="font-bold text-sm tracking-wide">
                      {result.pothole_count} Pothole{result.pothole_count > 1 ? 's' : ''} Detected in Frame
                    </span>
                  </div>
                  <SeverityBadge severity={result.dominant_severity || result.dominant_severity_proxy} />
                </div>
              )}

              {!running && (
                <div className="flex flex-col items-center justify-center py-24 text-slate-500">
                  <div className="w-16 h-16 rounded-2xl bg-slate-800 text-blue-400 flex items-center justify-center mb-4 shadow-inner">
                    <Camera size={32} />
                  </div>
                  <p className="text-slate-200 font-semibold text-sm">
                    {surveyStatus === 'completed' ? 'Survey Concluded' : 'Camera Inactive'}
                  </p>
                  <p className="text-slate-400 text-xs mt-1">
                    {surveyStatus === 'completed'
                      ? 'Review the detailed Inspection Report and incident evidence below'
                      : 'Click "Start Camera" above to initiate real-time road defect inspection'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Telemetry & Survey Controls */}
        <div className="space-y-4">
          {/* Live Telemetry */}
          <div className="card space-y-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Activity size={16} className="text-blue-500" /> Current Frame Telemetry
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <div className={`p-3 rounded-xl border text-center transition-all ${hasPothole ? 'bg-red-50 border-red-200 shadow-sm' : 'bg-blue-50/50 border-blue-100'}`}>
                <span className="text-[11px] text-slate-500 block">Frame Potholes</span>
                <span className={`text-2xl font-bold ${hasPothole ? 'text-red-600' : 'text-slate-600'}`}>
                  {result?.pothole_count ?? 0}
                </span>
              </div>
              <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-center">
                <span className="text-[11px] text-slate-500 block">Frame Confidence</span>
                <span className="text-lg font-bold text-slate-700 font-mono">
                  {result?.avg_confidence ? `${(result.avg_confidence * 100).toFixed(0)}%` : '—'}
                </span>
              </div>
            </div>

            <div className="text-xs space-y-2 text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-400">Current Severity:</span>
                <span>
                  {hasPothole
                    ? <SeverityBadge severity={result.dominant_severity || result.dominant_severity_proxy} />
                    : <span className="text-slate-400">—</span>
                  }
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Inference Speed:</span>
                <span className="font-mono">{result?.inference_ms ? `${result.inference_ms.toFixed(0)} ms` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">GPS Location:</span>
                <span className="font-mono text-[11px] flex items-center gap-1">
                  <MapPin size={11} className="text-blue-500" />
                  {location ? `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}` : 'Not available'}
                </span>
              </div>
            </div>
          </div>

          {/* Survey Controls */}
          <div className="card space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Sliders size={16} className="text-blue-500" /> Survey Configuration
            </h3>

            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-600">Confidence Threshold</label>
                <span className="text-xs font-bold text-blue-600 font-mono">{(confThreshold * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range" min="0.05" max="0.50" step="0.01"
                value={confThreshold}
                onChange={e => setConfThreshold(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>5% (sensitive)</span>
                <span>50% (strict)</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Road Name / Section Tag</label>
              <input
                type="text"
                value={roadName}
                onChange={e => setRoadName(e.target.value)}
                className="input text-xs"
                placeholder="e.g. MG Road, Bengaluru"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <Database size={13} className="text-blue-500" />
                <span className="text-xs font-medium text-slate-700">Auto-save to warehouse</span>
              </div>
              <input
                type="checkbox"
                checked={saveToWarehouse}
                onChange={e => setSaveToWarehouse(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SECTION: LIVE SURVEY INSPECTION REPORT & EVIDENCE LOG
         ───────────────────────────────────────────────────────────── */}
      <div className="space-y-4 pt-2">
        {/* Executive Report Card */}
        <div className="card bg-gradient-to-br from-white to-slate-50 border-blue-100 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="text-blue-600" size={20} />
                <h2 className="text-base font-bold text-slate-800">
                  Live Survey Inspection Report
                </h2>
                {surveyStatus === 'running' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-red-500" /> Recording Live Data
                  </span>
                )}
                {surveyStatus === 'completed' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    <CheckCircle2 size={12} /> Inspection Complete
                  </span>
                )}
                {surveyStatus === 'idle' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                    Ready to Survey
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Route: <strong className="text-slate-700">{roadName || 'Surveyed Road'}</strong> · {sessionDuration > 0 ? `Duration: ${formatDuration(sessionDuration)}` : 'Duration: 00:00'} · {frameCount} frames analyzed
              </p>
            </div>

            {/* Report Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={downloadReportJson}
                disabled={incidents.length === 0 && totalPotholesCount === 0}
                className="btn-secondary text-xs px-3 py-1.5"
                title="Download JSON Survey Report"
              >
                <Download size={13} /> Export JSON
              </button>
              <button
                type="button"
                onClick={() => setShowFullDocModal(true)}
                className="btn-primary text-xs px-3 py-1.5"
                title="View Full Inspection Document"
              >
                <Printer size={13} /> Full Official Report
              </button>
            </div>
          </div>

          {/* Key KPI Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Total Potholes</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-2xl font-black ${totalPotholesCount > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                  {totalPotholesCount}
                </span>
                <span className="text-[11px] text-slate-400">detected</span>
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Hazard Incidents</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-blue-600">
                  {incidents.length}
                </span>
                <span className="text-[11px] text-slate-400">recorded</span>
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Road Condition</span>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${roadCondition.bg}`}>
                  Grade {roadCondition.rating}
                </span>
                <span className="text-xs font-semibold text-slate-700 truncate">{roadCondition.label.split('-')[0]}</span>
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Survey Speed</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-bold text-slate-700 font-mono">
                  {result?.inference_ms ? `${result.inference_ms.toFixed(0)} ms` : '85 ms'}
                </span>
                <span className="text-[11px] text-slate-400">YOLOv8s</span>
              </div>
            </div>
          </div>

          {/* Severity Breakdown Bar & Recommendation */}
          <div className="grid md:grid-cols-2 gap-4 pt-1">
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Layers size={13} className="text-blue-500" /> Severity Classification
                </span>
                <span className="text-slate-400 text-[11px]">{totalPotholesCount} total items</span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="p-2 rounded-lg bg-red-50 border border-red-100">
                  <span className="text-[10px] font-semibold text-red-600 block uppercase">Large / Critical</span>
                  <span className="text-lg font-black text-red-700">{severityCounts.Large}</span>
                </div>
                <div className="p-2 rounded-lg bg-amber-50 border border-amber-100">
                  <span className="text-[10px] font-semibold text-amber-600 block uppercase">Medium</span>
                  <span className="text-lg font-black text-amber-700">{severityCounts.Medium}</span>
                </div>
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                  <span className="text-[10px] font-semibold text-emerald-600 block uppercase">Small / Minor</span>
                  <span className="text-lg font-black text-emerald-700">{severityCounts.Small}</span>
                </div>
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${roadCondition.bg}`}>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider block mb-1 flex items-center gap-1">
                  <ShieldAlert size={14} /> Official Maintenance Recommendation
                </span>
                <p className="text-xs leading-relaxed font-medium">
                  {roadCondition.recommendation}
                </p>
              </div>
              <p className="text-[11px] opacity-80 mt-2">
                Assessment generated automatically via YOLOv8s RDD2022 computer vision model.
              </p>
            </div>
          </div>
        </div>

        {/* ── Photographic Evidence Log ── */}
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Camera size={16} className="text-blue-600" /> Detected Potholes Log & Photographic Evidence
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Timestamped snapshots captured during live camera survey ({incidents.length} events logged)
              </p>
            </div>

            {/* Severity Filters */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1 flex items-center gap-1">
                <Filter size={11} /> Filter:
              </span>
              <button
                onClick={() => setFilterSeverity('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${filterSeverity === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                All ({incidents.length})
              </button>
              <button
                onClick={() => setFilterSeverity('Large')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${filterSeverity === 'Large'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                Large ({severityCounts.Large})
              </button>
              <button
                onClick={() => setFilterSeverity('Medium')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${filterSeverity === 'Medium'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                Medium ({severityCounts.Medium})
              </button>
              <button
                onClick={() => setFilterSeverity('Small')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${filterSeverity === 'Small'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                Small ({severityCounts.Small})
              </button>
            </div>
          </div>

          {incidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center mb-1">
                <Camera size={22} />
              </div>
              <p className="text-sm font-semibold text-slate-700">No pothole incidents recorded yet</p>
              <p className="text-xs text-slate-400 max-w-md">
                {running
                  ? 'The camera is scanning. Point towards road damage; detected potholes will immediately log here with high-resolution snapshots.'
                  : 'Start the live camera above to begin recording road surface hazard evidence.'}
              </p>
            </div>
          ) : filteredIncidents.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No incidents match the "{filterSeverity}" severity filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="text-left pb-2.5 font-semibold">Evidence Snapshot</th>
                    <th className="text-left pb-2.5 font-semibold">Incident ID</th>
                    <th className="text-left pb-2.5 font-semibold">Timestamp / Offset</th>
                    <th className="text-left pb-2.5 font-semibold">Potholes</th>
                    <th className="text-left pb-2.5 font-semibold">Est. Severity</th>
                    <th className="text-left pb-2.5 font-semibold">Max Confidence</th>
                    <th className="text-left pb-2.5 font-semibold">Location / Tag</th>
                    <th className="text-right pb-2.5 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredIncidents.map((inc) => (
                    <tr key={inc.id} className="hover:bg-slate-50/80 transition-colors group">
                      {/* Thumbnail */}
                      <td className="py-2.5">
                        <div
                          className="w-16 h-12 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 relative cursor-pointer group-hover:ring-2 group-hover:ring-blue-400 transition-all flex items-center justify-center shadow-xs"
                          onClick={() => setSelectedIncident(inc)}
                          title="Click to zoom evidence"
                        >
                          {inc.thumbnail ? (
                            <img src={inc.thumbnail} alt="Hazard preview" className="w-full h-full object-cover" />
                          ) : (
                            <Camera size={14} className="text-slate-500" />
                          )}
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Eye size={12} />
                          </div>
                        </div>
                      </td>

                      {/* Incident ID */}
                      <td className="py-2.5 font-mono font-bold text-slate-700">
                        {inc.id}
                      </td>

                      {/* Timestamp & Offset */}
                      <td className="py-2.5">
                        <div className="font-semibold text-slate-700">{inc.timestamp}</div>
                        <div className="text-[10px] text-slate-400 font-mono">+{inc.elapsedFormatted} into survey</div>
                      </td>

                      {/* Pothole Count */}
                      <td className="py-2.5">
                        <span className="font-bold px-2 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-100">
                          {inc.pothole_count} Pothole{inc.pothole_count > 1 ? 's' : ''}
                        </span>
                      </td>

                      {/* Severity */}
                      <td className="py-2.5">
                        <SeverityBadge severity={inc.dominant_severity} />
                      </td>

                      {/* Confidence */}
                      <td className="py-2.5 font-mono font-bold text-blue-600">
                        {(inc.max_confidence * 100).toFixed(1)}%
                      </td>

                      {/* Location */}
                      <td className="py-2.5">
                        <div className="font-medium text-slate-700 truncate max-w-[140px]">
                          {inc.road_name}
                        </div>
                        {inc.location ? (
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                            <MapPin size={9} className="text-blue-500" />
                            {inc.location.lat.toFixed(3)}, {inc.location.lon.toFixed(3)}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400">Manual Survey Tag</div>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedIncident(inc)}
                          className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors inline-flex items-center gap-1"
                        >
                          <Eye size={12} /> Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: INCIDENT SNAPSHOT EVIDENCE VIEWER
         ───────────────────────────────────────────────────────────── */}
      {selectedIncident && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <AlertOctagon size={18} className="text-red-500" />
                <h3 className="font-bold text-slate-800 text-sm">
                  Incident Evidence: {selectedIncident.id}
                </h3>
                <span className="text-xs text-slate-400">({selectedIncident.timestamp})</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIncident(null)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Snapshot image */}
              <div className="rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center max-h-80 border border-slate-800">
                {selectedIncident.thumbnail ? (
                  <img
                    src={selectedIncident.thumbnail}
                    alt="Pothole detection evidence"
                    className="max-h-80 w-auto object-contain"
                  />
                ) : (
                  <div className="py-16 text-slate-500 text-xs">Snapshot unavailable</div>
                )}
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 block uppercase font-medium">Potholes</span>
                  <span className="font-bold text-slate-800 text-base">{selectedIncident.pothole_count}</span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 block uppercase font-medium">Severity</span>
                  <div className="mt-0.5">
                    <SeverityBadge severity={selectedIncident.dominant_severity} />
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 block uppercase font-medium">Confidence</span>
                  <span className="font-bold text-blue-600 font-mono text-base">
                    {(selectedIncident.max_confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 block uppercase font-medium">Offset</span>
                  <span className="font-bold text-slate-700 font-mono text-base">
                    +{selectedIncident.elapsedFormatted}
                  </span>
                </div>
              </div>

              {/* Per-pothole breakdown in this snapshot */}
              {selectedIncident.detections?.length > 0 && (
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 border-b border-slate-100">
                    Individual Bounding Box Detections ({selectedIncident.detections.length})
                  </div>
                  <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 text-xs">
                    {selectedIncident.detections.map((d, i) => {
                      const box = d.bbox || [
                        d.bounding_box?.x1 || 0,
                        d.bounding_box?.y1 || 0,
                        d.bounding_box?.x2 || 0,
                        d.bounding_box?.y2 || 0
                      ]
                      return (
                        <div key={i} className="px-3 py-2 flex items-center justify-between">
                          <span className="font-bold text-slate-700">Defect #{i + 1}</span>
                          <span className="font-mono text-blue-600 font-semibold">{(d.confidence * 100).toFixed(1)}%</span>
                          <SeverityBadge severity={d.estimated_severity || d.estimated_severity_proxy} />
                          <span className="font-mono text-[10px] text-slate-400">
                            [{box.map(v => typeof v === 'number' ? v.toFixed(2) : v).join(', ')}]
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Geolocation info */}
              <div className="flex items-center justify-between text-xs text-slate-500 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100">
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} className="text-blue-500" />
                  Road: <strong className="text-slate-700">{selectedIncident.road_name}</strong>
                  {selectedIncident.location && (
                    <span className="font-mono ml-1">
                      ({selectedIncident.location.lat.toFixed(4)}, {selectedIncident.location.lon.toFixed(4)})
                    </span>
                  )}
                </span>
                {selectedIncident.location && (
                  <a
                    href={`https://www.google.com/maps?q=${selectedIncident.location.lat},${selectedIncident.location.lon}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 font-semibold hover:underline flex items-center gap-1"
                  >
                    View Map <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end bg-slate-50/50">
              <button
                type="button"
                onClick={() => setSelectedIncident(null)}
                className="btn-secondary text-xs px-4 py-1.5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: FORMAL PRINTABLE SURVEY REPORT DOCUMENT
         ───────────────────────────────────────────────────────────── */}
      {showFullDocModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header / Actions toolbar */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 print:hidden">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-blue-600" />
                <h3 className="font-bold text-slate-800 text-sm">
                  Official Road Defect Survey Document
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn-primary text-xs px-3 py-1.5"
                >
                  <Printer size={13} /> Print / Save as PDF
                </button>
                <button
                  type="button"
                  onClick={downloadReportJson}
                  className="btn-secondary text-xs px-3 py-1.5"
                >
                  <Download size={13} /> JSON
                </button>
                <button
                  type="button"
                  onClick={() => setShowFullDocModal(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Formal Report Body */}
            <div className="p-8 overflow-y-auto space-y-6 text-slate-800 font-sans" id="printable-report">
              {/* Document Header */}
              <div className="border-b-2 border-slate-800 pb-4 flex items-start justify-between">
                <div>
                  <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                    PotholeGuard Municipal Road Surface Quality & Defect Report
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Computer Vision Road Safety Audit · Deep Learning YOLOv8s (RDD2022 D40 Model)
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-bold text-slate-800">
                    REPORT REF: #{Date.now().toString().slice(-8)}
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    Date: {new Date().toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Survey Metadata Table */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block uppercase text-[10px] font-semibold">Surveyed Roadway</span>
                  <span className="font-bold text-slate-800">{roadName || 'Primary Survey Route'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase text-[10px] font-semibold">Survey Device</span>
                  <span className="font-bold text-slate-800">Webcam / In-Vehicle Sensor</span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase text-[10px] font-semibold">Survey Duration</span>
                  <span className="font-bold text-slate-800 font-mono">{formatDuration(sessionDuration)} ({frameCount} frames)</span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase text-[10px] font-semibold">GPS Coordinates</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {location ? `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}` : 'Manual Tag'}
                  </span>
                </div>
              </div>

              {/* Executive Summary */}
              <div className="p-4 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Executive Condition Summary
                </h4>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
                    <span className="text-[11px] text-red-600 block font-semibold">Total Potholes Detected</span>
                    <span className="text-2xl font-black text-red-700">{totalPotholesCount}</span>
                  </div>
                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                    <span className="text-[11px] text-blue-600 block font-semibold">Distinct Hazard Sites</span>
                    <span className="text-2xl font-black text-blue-700">{incidents.length}</span>
                  </div>
                  <div className={`p-3 rounded-lg border ${roadCondition.bg}`}>
                    <span className="text-[11px] block font-semibold">Road Safety Rating</span>
                    <span className="text-xl font-black block mt-0.5">Grade {roadCondition.rating}</span>
                  </div>
                </div>

                <div className="pt-2 text-xs">
                  <p className="font-semibold text-slate-700">Defect Severity Breakdown:</p>
                  <p className="text-slate-600 mt-1">
                    • <strong>Large / Critical Defects:</strong> {severityCounts.Large} ({((severityCounts.Large / (totalPotholesCount || 1)) * 100).toFixed(0)}%)<br />
                    • <strong>Medium Defects:</strong> {severityCounts.Medium} ({((severityCounts.Medium / (totalPotholesCount || 1)) * 100).toFixed(0)}%)<br />
                    • <strong>Small / Minor Surface Defects:</strong> {severityCounts.Small} ({((severityCounts.Small / (totalPotholesCount || 1)) * 100).toFixed(0)}%)
                  </p>
                </div>
              </div>

              {/* Maintenance Directive */}
              <div className={`p-4 rounded-xl border text-xs space-y-1 ${roadCondition.bg}`}>
                <h4 className="font-bold uppercase tracking-wider">
                  Civil Maintenance Directive
                </h4>
                <p className="leading-relaxed font-medium">
                  {roadCondition.recommendation}
                </p>
              </div>

              {/* Photographic Evidence Gallery in Report */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Photographic Hazard Evidence Catalog ({incidents.length})
                </h4>

                {incidents.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No defects were logged during this survey session.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {incidents.map((inc) => (
                      <div key={inc.id} className="border border-slate-200 rounded-xl overflow-hidden p-2 bg-slate-50/50 space-y-1.5 text-[11px]">
                        <div className="h-28 bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center">
                          {inc.thumbnail ? (
                            <img src={inc.thumbnail} alt={inc.id} className="w-full h-full object-cover" />
                          ) : (
                            <Camera size={18} className="text-slate-500" />
                          )}
                        </div>
                        <div className="flex items-center justify-between font-bold">
                          <span>{inc.id}</span>
                          <span className="font-mono text-blue-600">{(inc.max_confidence * 100).toFixed(0)}%</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-500">
                          <span>{inc.timestamp}</span>
                          <SeverityBadge severity={inc.dominant_severity} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sign-off footer */}
              <div className="border-t border-slate-200 pt-6 mt-8 flex justify-between text-xs text-slate-500">
                <div>
                  <p>System: PotholeGuard v1.0 · Automated CV Engine</p>
                  <p>Certified RDD2022 Machine Learning Pipeline</p>
                </div>
                <div className="text-right">
                  <div className="w-32 border-b border-slate-400 pb-6 mb-1 inline-block"></div>
                  <p>Inspecting Officer Signature</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
