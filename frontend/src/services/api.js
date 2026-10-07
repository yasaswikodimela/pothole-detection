import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 60000,
})


// ── Health ────────────────────────────────────────────────
export const fetchHealth = () => api.get('/health').then(r => r.data)

// ── Dashboard ─────────────────────────────────────────────
export const fetchDashboardSummary = () =>
  api.get('/dashboard/summary').then(r => r.data)

// ── Detections ────────────────────────────────────────────
export const fetchDetections = (page = 1, pageSize = 20) =>
  api.get('/detections', { params: { page, page_size: pageSize } }).then(r => r.data)

// ── Detection: image ──────────────────────────────────────
export const detectImage = (file, latitude = null, longitude = null, roadName = null, confThreshold = 0.15) => {
  const fd = new FormData()
  fd.append('file', file)
  if (latitude !== null) fd.append('latitude', latitude)
  if (longitude !== null) fd.append('longitude', longitude)
  if (roadName) fd.append('road_name', roadName)
  fd.append('conf_threshold', confThreshold)
  return api.post('/detect/image', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

// ── Detection: webcam frame ───────────────────────────────
export const detectFrame = (
  base64jpeg,
  latitude = null,
  longitude = null,
  roadName = null,
  confThreshold = 0.15,
  saveToDb = false,
  signal = null
) => {
  const cleanBase64 = base64jpeg.includes(',') ? base64jpeg.split(',')[1] : base64jpeg
  return api.post(
    '/detect/frame',
    {
      image_base64: cleanBase64,
      latitude: latitude,
      longitude: longitude,
      road_name: roadName,
      conf_threshold: confThreshold,
      device: 'webcam',
      save_to_db: saveToDb,
    },
    {
      timeout: 45000, // explicit reasonable timeout for live frame inference
      signal: signal || undefined,
    }
  ).then(r => r.data)
}

// ── Detection: video ──────────────────────────────────────
export const detectVideo = (file, confThreshold = 0.15, frameSkip = 5, onUploadProgress = null) => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('conf_threshold', confThreshold)
  fd.append('frame_skip', frameSkip)
  return api.post('/detect/video', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
    timeout: 600000, // 10 min safe timeout for video inference
  }).then(r => r.data)
}

// ── Model ─────────────────────────────────────────────────
export const fetchModelMetrics = () =>
  api.get('/model/metrics').then(r => r.data)

export const fetchModelInfo = () =>
  api.get('/model/info').then(r => r.data)

// ── OLAP ──────────────────────────────────────────────────
export const fetchOlapRollup = () =>
  api.get('/analytics/olap/rollup/monthly').then(r => r.data)

export const fetchOlapDrilldown = (year, month = null) =>
  api.get('/analytics/olap/drilldown', { params: { year, month } }).then(r => r.data)

export const fetchOlapSlice = (roadName) =>
  api.get('/analytics/olap/slice', { params: { road_name: roadName } }).then(r => r.data)

export const fetchOlapDice = (params = {}) =>
  api.get('/analytics/olap/dice', { params }).then(r => r.data)

// ── K-Means ───────────────────────────────────────────────
export const fetchClusters = (k = 3) =>
  api.get('/analytics/clusters', { params: { k } }).then(r => r.data)

export default api
