import { useState, useEffect } from 'react'
import { useApi } from '../hooks/useApi'

export default function SystemHealth() {
  const { data, loading } = useApi('/system-health', [])
  const [time, setTime] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t) }, [])

  if (loading || !data) return <div className="loading"><div className="loading-spinner" />Loading system health...</div>

  return (
    <div>
      <div className="page-header"><h2>System Health</h2>
        <p>CareIntegrity.AI operational status &middot; {time.toLocaleTimeString()}</p></div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', background: 'rgba(16,185,129,0.06)', borderRadius: 12, border: '1px solid rgba(16,185,129,0.2)', marginBottom: 20 }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#10b981', animation: 'pulse-dot 2s infinite' }} />
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-green)' }}>All Systems Operational</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>Uptime: {data.uptime_hours}h &middot; v{data.api_version} &middot; Python {data.python_version}</div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: 24 }}>
        {[['Claims Processed', data.data_stats?.claims_processed?.toLocaleString(), 'info'],
          ['Alerts Generated', data.data_stats?.alerts_generated, 'warning'],
          ['Providers', data.data_stats?.providers_monitored, 'info'],
          ['Participants', data.data_stats?.participants_protected, 'purple'],
          ['Workers', data.data_stats?.workers_tracked, 'success'],
        ].map(([l,v,c]) => <div key={l} className="stat-card"><div className="stat-label">{l}</div><div className={`stat-value ${c}`} style={{fontSize:22}}>{v}</div></div>)}
      </div>

      <div className="card"><div className="card-title">Detection Engines ({data.engines?.length})</div>
        <div className="engine-grid">
          {data.engines?.map((e, i) => (
            <div key={i} className="engine-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{e.name}</div>
                <span className="engine-status">{e.status}</span>
              </div>
              <div className="progress-bar" style={{ height: 6, marginBottom: 6 }}>
                <div className="progress-fill" style={{ width: `${e.health}%`, background: '#10b981' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                <span>Health: {e.health}%</span>
                <span>Last: {e.last_run?.slice(11, 19)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
