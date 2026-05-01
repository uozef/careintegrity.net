import { useRef, useEffect, useState } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'

export default function RiskHeatmap() {
  const canvasRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const { data, loading } = useApi('/risk-heatmap', [])

  useEffect(() => {
    if (!data?.length || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const rect = canvas.parentElement.getBoundingClientRect()
    canvas.width = rect.width; canvas.height = 500

    // Sydney bounding box
    const minLat = -34.1, maxLat = -33.65, minLng = 150.55, maxLng = 151.35
    const W = canvas.width, H = canvas.height, pad = 40

    function toX(lng) { return pad + ((lng - minLng) / (maxLng - minLng)) * (W - pad * 2) }
    function toY(lat) { return pad + ((maxLat - lat) / (maxLat - minLat)) * (H - pad * 2) }

    const bg = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() || '#0a0c14'
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

    // Grid
    ctx.strokeStyle = 'var(--chart-grid, #1e2238)'; ctx.lineWidth = 0.5; ctx.globalAlpha = 0.3
    for (let i = 0; i <= 8; i++) {
      const x = pad + i / 8 * (W - pad * 2); ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, H - pad); ctx.stroke()
      const y = pad + i / 8 * (H - pad * 2); ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Heatmap blobs
    for (const p of data) {
      const x = toX(p.lng), y = toY(p.lat)
      const r = 15 + p.risk_score * 30
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      if (p.risk_score > 0.7) {
        grad.addColorStop(0, 'rgba(239,68,68,0.6)'); grad.addColorStop(1, 'rgba(239,68,68,0)')
      } else if (p.risk_score > 0.4) {
        grad.addColorStop(0, 'rgba(249,115,22,0.5)'); grad.addColorStop(1, 'rgba(249,115,22,0)')
      } else {
        grad.addColorStop(0, 'rgba(245,158,11,0.4)'); grad.addColorStop(1, 'rgba(245,158,11,0)')
      }
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }

    // Points
    for (const p of data) {
      const x = toX(p.lng), y = toY(p.lat)
      const r = 4 + p.risk_score * 6
      const color = p.risk_score > 0.7 ? '#ef4444' : p.risk_score > 0.4 ? '#f97316' : '#f59e0b'
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke()
      if (p.risk_score > 0.5) {
        ctx.fillStyle = '#fff'; ctx.font = '9px sans-serif'
        ctx.fillText(p.name.slice(0, 15), x + r + 3, y + 3)
      }
    }

    // Labels
    ctx.fillStyle = 'var(--text-muted, #555)'; ctx.font = '10px sans-serif'
    ctx.fillText('Greater Sydney Region', W / 2 - 50, H - 10)

    function onClick(e) {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      for (const p of data) {
        const x = toX(p.lng), y = toY(p.lat)
        if ((mx-x)**2 + (my-y)**2 < 400) { setSelected(p); return }
      }
      setSelected(null)
    }
    canvas.addEventListener('click', onClick)
    return () => canvas.removeEventListener('click', onClick)
  }, [data])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading heatmap...</div>

  return (
    <div>
      <div className="page-header"><h2>Geographic Risk Heatmap</h2><p>Provider fraud risk by location — Greater Sydney Region &middot; {data?.length || 0} providers mapped</p></div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        {[['Critical Risk','#ef4444'],['High Risk','#f97316'],['Medium Risk','#f59e0b']].map(([l,c]) => (
          <div key={l} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--text-secondary)'}}>
            <div style={{width:12,height:12,borderRadius:'50%',background:c}}/>{l}
          </div>))}
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden' }}>
          <div style={{ height: 500, background: 'var(--canvas-bg)' }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>

        {selected && (
          <div className="card slide-in" style={{ flex: '0 0 320px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: selected.risk_score > 0.7 ? 'var(--accent-red)' : 'var(--accent-orange)', marginBottom: 4 }}>
              {selected.severity} risk
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{selected.name}</div>
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{selected.id}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{selected.address}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
              <div style={{padding:8,background:'var(--bg-secondary)',borderRadius:8,border:'1px solid var(--border)'}}>
                <div style={{fontSize:9,color:'var(--text-muted)',textTransform:'uppercase',fontWeight:700}}>Risk Score</div>
                <div style={{fontSize:22,fontWeight:800,color:selected.risk_score>0.7?'var(--accent-red)':'var(--accent-orange)'}}>{(selected.risk_score*100).toFixed(0)}%</div>
              </div>
              <div style={{padding:8,background:'var(--bg-secondary)',borderRadius:8,border:'1px solid var(--border)'}}>
                <div style={{fontSize:9,color:'var(--text-muted)',textTransform:'uppercase',fontWeight:700}}>Alerts</div>
                <div style={{fontSize:22,fontWeight:800,color:'var(--accent-orange)'}}>{selected.alerts}</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
              Lat: {selected.lat?.toFixed(4)}, Lng: {selected.lng?.toFixed(4)}
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title">Risk Hotspots by Location</div>
        <div className="table-container" style={{ maxHeight: 300, overflowY: 'auto' }}>
          <table><thead><tr><th>Provider</th><th>Address</th><th>Risk</th><th>Alerts</th><th>Severity</th></tr></thead>
            <tbody>{(data || []).slice(0, 30).map(p => (
              <tr key={p.id} onClick={() => setSelected(p)} style={{ cursor: 'pointer' }}>
                <td><div style={{fontWeight:700}}>{p.name}</div><div style={{fontSize:10,fontFamily:'monospace',color:'var(--text-muted)'}}>{p.id}</div></td>
                <td style={{fontSize:12,color:'var(--text-secondary)'}}>{p.address?.slice(0,40)}</td>
                <td style={{fontWeight:700,color:p.risk_score>0.7?'var(--accent-red)':'var(--accent-orange)'}}>{(p.risk_score*100).toFixed(0)}%</td>
                <td style={{fontWeight:600}}>{p.alerts}</td>
                <td><span className={`risk-badge ${p.severity}`}>{p.severity}</span></td>
              </tr>))}</tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
