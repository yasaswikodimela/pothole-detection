import { useState, useRef } from 'react'
import { Film, Upload, AlertTriangle, RefreshCw, Clock } from 'lucide-react'
import { detectVideo } from '../services/api'
import { PageHeader, AcademicNote, SeverityBadge, Spinner } from '../components/ui'

export default function VideoDetectionPage() {
  const [file,     setFile]     = useState(null)
  const [preview,  setPreview]  = useState(null)
  const [result,   setResult]   = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState(0)
  const [error,    setError]    = useState(null)
  const inputRef = useRef(null)

  const handleFile = f => {
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setResult(null); setError(null); setProgress(0)
  }

  const handleDetect = async () => {
    if (!file) return
    setLoading(true); setError(null)
    try {
      const data = await detectVideo(file, e => {
        if (e.total) setProgress(Math.round((e.loaded / e.total) * 100))
      })
      setResult(data)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => { setFile(null); setPreview(null); setResult(null); setError(null); setProgress(0) }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <PageHeader title="Video Detection" subtitle="Analyse road video for potholes frame-by-frame">
        {result && <button className="btn-secondary" onClick={reset}><RefreshCw size={14}/> New Video</button>}
      </PageHeader>

      <AcademicNote>
        Video is processed frame-by-frame on CPU. Processing time scales with video length and
        frame rate. This may take several minutes for longer clips.
      </AcademicNote>

      {!file ? (
        <div
          className="card border-2 border-dashed border-slate-200 hover:border-brand-300 cursor-pointer p-10 flex flex-col items-center"
          onClick={() => inputRef.current.click()}
        >
          <Film size={36} className="text-slate-400 mb-3" />
          <p className="text-sm font-medium text-slate-700">Drop a video or click to browse</p>
          <p className="text-xs text-slate-400 mt-1">MP4, AVI, MOV supported · max 200 MB</p>
          <input
            ref={inputRef} type="file" accept="video/*" className="hidden"
            onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]) }}
          />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Left */}
          <div className="space-y-4">
            <div className="card p-0 overflow-hidden">
              <video src={preview} controls className="w-full max-h-64" />
            </div>
            <div className="card">
              <p className="text-sm text-slate-700 font-medium">{file.name}</p>
              <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>

            {loading && (
              <div className="card">
                <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                  <Spinner size={15} /> Processing video…
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-brand-500 h-2 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">{progress}% uploaded</p>
              </div>
            )}

            <button className="btn-primary w-full justify-center py-3" onClick={handleDetect} disabled={loading}>
              {loading ? <><Spinner size={16}/> Processing…</> : <><Film size={16}/> Analyse Video</>}
            </button>

            {error && (
              <div className="flex gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" /> {error}
              </div>
            )}
          </div>

          {/* Right */}
          <div className="space-y-4">
            {result ? (
              <>
                <div className="card">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Video Analysis Summary</h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Frames Analysed</dt>
                      <dd className="font-medium">{result.frames_analysed ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Total Potholes</dt>
                      <dd className={`font-bold ${result.total_potholes > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {result.total_potholes}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Frames with Potholes</dt>
                      <dd className="font-medium">{result.frames_with_potholes ?? '—'}</dd>
                    </div>
                  </dl>
                </div>

                {result.per_frame_results?.length > 0 && (
                  <div className="card max-h-72 overflow-y-auto">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Per-Frame Results</h3>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-100">
                          <th className="text-left pb-2 flex items-center gap-1"><Clock size={10}/> Frame</th>
                          <th className="text-left pb-2">Potholes</th>
                          <th className="text-left pb-2">Max Confidence</th>
                          <th className="text-left pb-2">Severity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {result.per_frame_results.filter(f => f.pothole_count > 0).map((f, i) => (
                          <tr key={i}>
                            <td className="py-1.5">{f.frame_number}</td>
                            <td className="py-1.5 font-bold text-red-600">{f.pothole_count}</td>
                            <td className="py-1.5">{f.max_confidence ? `${(f.max_confidence * 100).toFixed(1)}%` : '—'}</td>
                            <td className="py-1.5">
                              <SeverityBadge severity={f.max_severity} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {result.per_frame_results.every(f => f.pothole_count === 0) && (
                      <p className="text-sm text-slate-400 text-center py-4">No potholes detected in any frame.</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="card flex flex-col items-center justify-center py-16 text-slate-400">
                <Film size={36} className="mb-3 opacity-30" />
                <p className="text-sm">Run analysis to see results</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
