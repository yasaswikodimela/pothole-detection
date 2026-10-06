import { Shield, Github, Database, Cpu, BarChart2, ExternalLink } from 'lucide-react'
import { AcademicNote } from '../components/ui'

function Tech({ icon: Icon, name, purpose }) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-2 bg-brand-50 rounded-xl flex-shrink-0">
        <Icon size={16} className="text-brand-600" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-800">{name}</p>
        <p className="text-xs text-slate-500">{purpose}</p>
      </div>
    </div>
  )
}

export default function AboutPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Hero */}
      <div className="card bg-gradient-to-br from-brand-600 to-brand-800 text-white text-center py-10">
        <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Shield size={28} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold">PotholeGuard</h1>
        <p className="text-brand-200 text-sm mt-1 mb-4">Spot it. Map it. Fix it.</p>
        <p className="text-white/80 text-sm max-w-md mx-auto">
          Real-Time Pothole Detection Using RDD2022 and Data Mining &amp; Data Warehousing
        </p>
      </div>

      {/* Project overview */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Project Overview</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          PotholeGuard is a college DMDW (Data Mining and Data Warehousing) project that demonstrates
          the end-to-end pipeline from raw road-damage data to actionable infrastructure insights.
        </p>
        <p className="text-sm text-slate-600 leading-relaxed mt-2">
          The system integrates <strong>computer vision</strong> (YOLOv8s object detection) with
          <strong> data engineering</strong> (star schema, ETL, OLAP) and <strong>data mining</strong>
          (K-Means clustering) to identify, store, and analyse road potholes.
        </p>
      </div>

      {/* Architecture */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">System Architecture</h2>
        <div className="bg-slate-50 rounded-xl p-4 font-mono text-xs text-slate-700 leading-loose">
          RDD2022 India D40 (Pothole Dataset)<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;↓<br/>
          YOLOv8s Object Detection<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;↓<br/>
          Detection Records (confidence, bbox, location, timestamp)<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;↓<br/>
          ETL Service<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;↓<br/>
          Star Schema Data Warehouse (SQLite)<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;├── Date_Dim · Time_Dim · Location_Dim<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;├── Road_Dim · Severity_Dim<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;└── Pothole_Detection_Fact<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;↓<br/>
          OLAP (Roll-Up / Drill-Down / Slice / Dice)<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;↓<br/>
          K-Means Road Hazard Clustering<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;↓<br/>
          FastAPI REST API → React Dashboard
        </div>
      </div>

      {/* Tech stack */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Technology Stack</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Tech icon={Cpu}      name="YOLOv8s (Ultralytics)" purpose="Object detection — pothole localisation" />
          <Tech icon={Database} name="SQLite + Star Schema"  purpose="Data warehouse storage" />
          <Tech icon={BarChart2} name="FastAPI (Python)"     purpose="REST API backend" />
          <Tech icon={Shield}   name="React + Vite"          purpose="Frontend web application" />
          <Tech icon={BarChart2} name="Recharts + Leaflet"   purpose="Charts and map visualisations" />
          <Tech icon={Cpu}      name="scikit-learn K-Means"  purpose="Road hazard clustering (DMDW)" />
        </div>
      </div>

      {/* Dataset */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Dataset: RDD2022 India</h2>
        <dl className="space-y-2 text-sm">
          {[
            ['Source',       'Road Damage Detection 2022 (Arya et al.)'],
            ['Subset used',  'India — D40 (pothole) class only'],
            ['Images',       '1,530 total (train 1,224 · val 153 · test 153)'],
            ['Annotations',  '3,187 pothole bounding boxes'],
            ['Format',       'Pascal VOC XML → converted to YOLO TXT'],
            ['Split seed',   '42 (reproducible)'],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <dt className="text-slate-400 w-28 flex-shrink-0">{k}</dt>
              <dd className="font-medium text-slate-700">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Academic constraints */}
      <AcademicNote>
        <strong>Important Academic Constraints:</strong><br/>
        • Severity labels are <em>bounding-box area proxies</em> and do NOT indicate physical pothole depth.<br/>
        • Precision (67.89%) ≠ overall accuracy. Recall (22.84%) is honestly reported as low.<br/>
        • K-Means clusters roads — it does NOT detect potholes. YOLO is the detector.<br/>
        • No synthetic, fabricated, or hardcoded detection data is used.
      </AcademicNote>

      {/* Footer */}
      <div className="text-center text-xs text-slate-400 py-2">
        PotholeGuard · DMDW College Project · RDD2022 India · YOLOv8s D40
      </div>
    </div>
  )
}
