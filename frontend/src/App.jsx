import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import {
  Home, Camera, Image, Film, Clock, BarChart2,
  Cpu, Info, AlertTriangle, Menu, X, Shield
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { fetchHealth } from './services/api'

import HomePage            from './pages/HomePage'
import LiveDetectionPage   from './pages/LiveDetectionPage'
import ImageDetectionPage  from './pages/ImageDetectionPage'
import VideoDetectionPage  from './pages/VideoDetectionPage'
import HistoryPage         from './pages/HistoryPage'
import AnalyticsPage       from './pages/AnalyticsPage'
import ModelEvalPage       from './pages/ModelEvalPage'
import AboutPage           from './pages/AboutPage'

const NAV = [
  { to: '/',          label: 'Home',           icon: Home     },
  { to: '/live',      label: 'Live Detection', icon: Camera   },
  { to: '/image',     label: 'Image Detection',icon: Image    },
  { to: '/video',     label: 'Video Detection',icon: Film     },
  { to: '/history',   label: 'Detection History', icon: Clock },
  { to: '/analytics', label: 'DMDW Analytics', icon: BarChart2},
  { to: '/model',     label: 'Model Evaluation',icon: Cpu     },
  { to: '/about',     label: 'About',          icon: Info     },
]

function Sidebar({ open, onClose }) {
  const location = useLocation()

  return (
    <>
      {/* Backdrop (mobile) */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-100 z-30
          flex flex-col
          transform transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
          <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm leading-tight">PotholeGuard</p>
            <p className="text-xs text-slate-400 leading-tight">Spot it. Map it. Fix it.</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded-lg hover:bg-slate-100 lg:hidden"
          >
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            DMDW College Project<br />
            RDD2022 India · YOLOv8s<br />
            D40 Pothole Class
          </p>
        </div>
      </aside>
    </>
  )
}

function BackendStatus() {
  const [status, setStatus] = useState(null) // null | 'ok' | 'error'

  useEffect(() => {
    fetchHealth()
      .then(() => setStatus('ok'))
      .catch(() => setStatus('error'))
  }, [])

  if (status === null) return null
  if (status === 'ok') return null

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-100 text-red-700 text-xs">
      <AlertTriangle size={13} />
      Backend offline — start FastAPI server on port 8000
    </div>
  )
}

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile hamburger) */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl hover:bg-slate-100"
          >
            <Menu size={20} className="text-slate-600" />
          </button>
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-brand-600" />
            <span className="font-bold text-slate-900 text-sm">PotholeGuard</span>
          </div>
        </header>

        <BackendStatus />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/"          element={<HomePage />} />
            <Route path="/live"      element={<LiveDetectionPage />} />
            <Route path="/image"     element={<ImageDetectionPage />} />
            <Route path="/video"     element={<VideoDetectionPage />} />
            <Route path="/history"   element={<HistoryPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/model"     element={<ModelEvalPage />} />
            <Route path="/about"     element={<AboutPage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
