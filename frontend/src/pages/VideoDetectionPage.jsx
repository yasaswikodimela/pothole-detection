import { useState, useRef } from 'react'
import { Film, Upload, AlertTriangle, RefreshCw, Clock, Sliders, Play, CheckCircle2 } from 'lucide-react'
import { detectVideo } from '../services/api'
import { PageHeader, AcademicNote, SeverityBadge, Spinner } from '../components/ui'

export default function VideoDetectionPage() {
  const [file,          setFile]          = useState(null)
  const [preview,       setPreview]       = useState(null)
  const [result,        setResult]        = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [progress,      setProgress]      = useState(0)
  const [error,         setError]         = useState(null)
  const [confThreshold, setConfThreshold] = useState(0.15)
  const [frameSkip,     setFrameSkip]     = useState(5)
  const [selectedFrame, setSelectedFrame] = useState(null)

  const inputRef = useRef(null)
  const videoRef = useRef(null)

  const handleFile = f => {
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setResult(null); setError(null); setProgress(0); setSelectedFrame(null)
  }

  const loadSampleVideo = async () => {
    try {
      setLoading(true); setError(null)
      const res = await fetch('/sample_road_video.mp4')
      const blob = await res.blob()
      const sampleFile = new File([blob], 'sample_road_video.mp4', { type: 'video/mp4' })
      handleFile(sampleFile)
    } catch (err) {
      setError('Could not load sample video: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDetect = async () => {
    if (!file) return
    setLoading(true); setError(null)
    try {
      const data = await detectVideo(file, confThreshold, frameSkip, e => {
        if (e.total) setProgress(Math.round((e.loaded / e.total) * 100))
      })
      setResult(data)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  const jumpToTime = (timeSec, frameNum) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timeSec
      videoRef.current.play()
    }
    setSelectedFrame(frameNum)
  }

  const reset = () => {
    setFile(null); setPreview(null); setResult(null); setError(null); setProgress(0); setSelectedFrame(null)
  }

  const perFrameList = result?.per_frame_results || result?.frame_results || []
  const framesWithPotholes = perFrameList.filter(f => f.pothole_count > 0)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <PageHeader title="Video Detection" subtitle="Analyse road survey footage for potholes frame-by-frame">
        {result && <button className="btn-secondary" onClick={reset}><RefreshCw size={14}/> New Video</button>}
      </PageHeader>

      <AcademicNote>
        Video is processed frame-by-frame on CPU using YOLOv8s. Each sampled frame is evaluated, and detected pothole events are permanently logged to the Kimball Data Warehouse star schema.
      </AcademicNote>

      {!file ? (
        <div className="space-y-4">
          <div
            className="card border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/20 cursor-pointer p-10 flex flex-col items-center transition-all"
            onClick={() => inputRef.current.click()}
          >
            <div className="w-14 h-14 rounded-2xl bg-blue-100/70 text-blue-600 flex items-center justify-center mb-3">
              <Film size={32} />
            </div>
            <p className="text-sm font-semibold text-slate-700">Drop a road video or click to browse</p>
            <p className="text-xs text-slate-400 mt-1">MP4, AVI, MOV, WEBM supported · max 200 MB</p>
            <input
              ref={inputRef} type="file" accept="video/*" className="hidden"
              onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]) }}
            />
          </div>

          <div className="flex items-center justify-center gap-3">
            <span className="text-xs text-slate-400">or test immediately with:</span>
            <button
              onClick={loadSampleVideo}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-all"
            >
              <Film size={13} /> Load Sample Road Video (RDD2022 India)
            </button>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Left Column: Player & Parameters */}
          <div className="space-y-4">
            <div className="card p-0 overflow-hidden bg-black rounded-2xl relative">
              <video
                ref={videoRef}
                src={preview}
                controls
                className="w-full max-h-72 block mx-auto"
              />
            </div>

            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600">Change</button>
              </div>

              {/* Sensitivity & Sampling Controls */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                      <Sliders size={13} className="text-blue-500" />
                      Confidence Sensitivity:
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
                    onChange={e => setConfThreshold(parseFloat(e.target.value))}
                    disabled={loading}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                      <Clock size={13} className="text-blue-500" />
                      Frame Sampling:
                    </label>
                    <span className="text-xs font-medium text-slate-500">
                      Every {frameSkip}th frame
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[2, 3, 5, 10].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setFrameSkip(val)}
                        disabled={loading}
                        className={`py-1 text-xs font-semibold rounded-lg border transition-all ${
                          frameSkip === val
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        1 in {val}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {loading && (
                <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs text-blue-800 font-medium">
                    <span className="flex items-center gap-1.5"><Spinner size={13} /> Processing video on CPU…</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-blue-200/50 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                className="btn-primary w-full justify-center py-3 text-sm font-semibold shadow-sm"
                onClick={handleDetect}
                disabled={loading}
              >
                {loading ? <><Spinner size={16}/> Analysing Video…</> : <><Film size={16}/> Run Video Detection</>}
              </button>

              {error && (
                <div className="flex gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs">
                  <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" /> {error}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Analysis Results */}
          <div className="space-y-4">
            {result ? (
              <>
                <div className="card space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800">Analysis Summary</h3>
                    <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                      <CheckCircle2 size={11} /> Complete
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-center">
                      <span className="text-[11px] text-slate-500 block">Frames Analysed</span>
                      <span className="text-lg font-bold text-slate-800">
                        {result.frames_analysed ?? result.frames_processed ?? '—'}
                      </span>
                    </div>

                    <div className="p-3 bg-red-50/50 rounded-xl border border-red-100 text-center">
                      <span className="text-[11px] text-slate-500 block">Total Potholes</span>
                      <span className="text-lg font-bold text-red-600">
                        {result.total_potholes}
                      </span>
                    </div>

                    <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-center">
                      <span className="text-[11px] text-slate-500 block">Hazard Frames</span>
                      <span className="text-lg font-bold text-slate-800">
                        {result.frames_with_potholes ?? framesWithPotholes.length}
                      </span>
                    </div>
                  </div>
                </div>

                {perFrameList.length > 0 && (
                  <div className="card space-y-3 max-h-96 overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-800">Timeline / Per-Frame Breakdown</h3>
                      <span className="text-xs text-slate-400">Click a frame to seek video</span>
                    </div>

                    <div className="overflow-y-auto flex-1 pr-1">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-400 border-b border-slate-100 sticky top-0 bg-white">
                            <th className="text-left pb-2 font-medium">Timestamp</th>
                            <th className="text-left pb-2 font-medium">Frame #</th>
                            <th className="text-left pb-2 font-medium">Potholes</th>
                            <th className="text-left pb-2 font-medium">Confidence</th>
                            <th className="text-left pb-2 font-medium">Est. Severity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {perFrameList.map((f, i) => {
                            const hasPothole = f.pothole_count > 0
                            const isSelected = selectedFrame === (f.frame_number ?? f.frame)
                            return (
                              <tr
                                key={i}
                                onClick={() => jumpToTime(f.time_seconds, f.frame_number ?? f.frame)}
                                className={`cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-blue-100/60 font-semibold'
                                    : hasPothole
                                    ? 'hover:bg-red-50/40 bg-red-50/15'
                                    : 'hover:bg-slate-50 opacity-60'
                                }`}
                              >
                                <td className="py-2 flex items-center gap-1 font-mono text-slate-700">
                                  <Play size={10} className="text-blue-500" />
                                  {f.time_seconds}s
                                </td>
                                <td className="py-2 text-slate-500 font-mono">
                                  #{f.frame_number ?? f.frame}
                                </td>
                                <td className="py-2">
                                  <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                                    hasPothole ? 'bg-red-100 text-red-700 border border-red-200' : 'text-slate-400'
                                  }`}>
                                    {f.pothole_count}
                                  </span>
                                </td>
                                <td className="py-2 font-mono text-slate-600">
                                  {f.avg_confidence || f.max_confidence
                                    ? `${((f.avg_confidence || f.max_confidence) * 100).toFixed(1)}%`
                                    : '—'}
                                </td>
                                <td className="py-2">
                                  {hasPothole ? (
                                    <SeverityBadge severity={f.max_severity || f.dominant_severity_proxy || f.severity} />
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="card flex flex-col items-center justify-center py-20 text-slate-400 border border-slate-100 bg-white">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-400 flex items-center justify-center mb-3">
                  <Film size={28} />
                </div>
                <p className="text-sm font-medium text-slate-700">Ready for Analysis</p>
                <p className="text-xs text-slate-400 mt-1">Configure parameters and click "Run Video Detection"</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
