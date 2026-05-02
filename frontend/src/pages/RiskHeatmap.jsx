import { useRef, useEffect, useState, useCallback } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'

export default function RiskHeatmap() {
  const canvasRef = useRef(null)
  const transformRef = useRef({ x: 0, y: 0, scale: 1 })
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 })
  const pointsRef = useRef([])

  const [selected, setSelected] = useState(null)
  const [hovered, setHovered] = useState(null)
  const [providerDetail, setProviderDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const { data, loading } = useApi('/risk-heatmap', [])

  const selectProvider = useCallback(async (p) => {
    setSelected(p)
    setLoadingDetail(true)
    try {
      const detail = await fetchApi(`/graph/node/${p.id}`)
      setProviderDetail(detail)
    } catch { setProviderDetail(null) }
    setLoadingDetail(false)
  }, [])

  useEffect(() => {
    if (!data?.length || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const rect = canvas.parentElement.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = 520

    const W = canvas.width, H = canvas.height
    const minLat = -34.12, maxLat = -33.62, minLng = 150.5, maxLng = 151.4
    const pad = 50

    function toX(lng) { return pad + ((lng - minLng) / (maxLng - minLng)) * (W - pad * 2) }
    function toY(lat) { return pad + ((maxLat - lat) / (maxLat - minLat)) * (H - pad * 2) }

    // Pre-compute screen positions
    const pts = data.map(p => ({ ...p, sx: toX(p.lng), sy: toY(p.lat) }))
    pointsRef.current = pts

    function draw() {
      const t = transformRef.current
      ctx.clearRect(0, 0, W, H)

      // Background
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      ctx.fillStyle = isDark ? '#0a0c14' : '#f5f3ef'
      ctx.fillRect(0, 0, W, H)

      ctx.save()
      ctx.translate(t.x, t.y)
      ctx.scale(t.scale, t.scale)

      // Grid lines
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'
      ctx.lineWidth = 1 / t.scale
      for (let i = 0; i <= 10; i++) {
        const x = pad + i / 10 * (W - pad * 2)
        ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, H - pad); ctx.stroke()
        const y = pad + i / 10 * (H - pad * 2)
        ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke()
      }

      // Suburb labels
      const suburbs = [
        ['Parramatta', -33.815, 151.001], ['Liverpool', -33.920, 150.924],
        ['Blacktown', -33.769, 150.906], ['Penrith', -33.751, 150.688],
        ['Campbelltown', -34.065, 150.814], ['Bankstown', -33.918, 151.035],
        ['Hornsby', -33.703, 151.099], ['Chatswood', -33.797, 151.183],
        ['Hurstville', -33.967, 151.102], ['Sutherland', -34.031, 151.056],
      ]
      ctx.font = `${10 / t.scale}px sans-serif`
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
      suburbs.forEach(([name, lat, lng]) => {
        ctx.fillText(name, toX(lng), toY(lat))
      })

      // Risk color function: green -> yellow -> orange -> red
      function riskColor(rs) {
        if (rs >= 0.8) return { main: [220,38,38], light: '#f87171', dark: '#dc2626' }     // red
        if (rs >= 0.65) return { main: [239,68,68], light: '#fca5a5', dark: '#ef4444' }     // lighter red
        if (rs >= 0.5) return { main: [249,115,22], light: '#fdba74', dark: '#f97316' }     // orange
        if (rs >= 0.35) return { main: [234,179,8], light: '#fde047', dark: '#eab308' }     // yellow
        if (rs >= 0.2) return { main: [34,197,94], light: '#86efac', dark: '#22c55e' }      // light green
        return { main: [16,185,129], light: '#6ee7b7', dark: '#10b981' }                    // green
      }

      // Heatmap glow (larger, softer)
      for (const p of pts) {
        const r = (15 + p.risk_score * 50) / t.scale * t.scale
        const rc = riskColor(p.risk_score)
        const [cr, cg, cb] = rc.main
        const grad = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r)
        const intensity = 0.15 + p.risk_score * 0.25
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},${intensity})`)
        grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},${intensity * 0.3})`)
        grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2); ctx.fill()
      }

      // Points
      for (const p of pts) {
        const isSelected = selected?.id === p.id
        const isHovered = hovered === p.id
        const baseR = 4 + p.risk_score * 8
        const r = isSelected ? baseR * 1.6 : isHovered ? baseR * 1.3 : baseR

        const rc = riskColor(p.risk_score)
        const color = rc.dark

        // Selection/hover ring
        if (isSelected || isHovered) {
          ctx.beginPath(); ctx.arc(p.sx, p.sy, r + 6 / t.scale, 0, Math.PI * 2)
          ctx.strokeStyle = isSelected ? '#fff' : color
          ctx.lineWidth = 2.5 / t.scale; ctx.stroke()
        }

        // Dot with gradient
        const g = ctx.createRadialGradient(p.sx - r * 0.2, p.sy - r * 0.2, r * 0.1, p.sx, p.sy, r)
        g.addColorStop(0, rc.light)
        g.addColorStop(1, color)
        ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2)
        ctx.fillStyle = g; ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 / t.scale; ctx.stroke()

        // Label — show on hover/select or when zoomed in
        if (isSelected || isHovered || t.scale > 1.3) {
          const label = p.name.length > 18 ? p.name.slice(0, 16) + '..' : p.name
          ctx.font = `bold ${Math.max(9, 11 / t.scale)}px sans-serif`
          const tw = ctx.measureText(label).width
          const lx = p.sx + r + 5 / t.scale, ly = p.sy

          // Background pill
          ctx.fillStyle = isDark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.9)'
          ctx.fillRect(lx - 2 / t.scale, ly - 8 / t.scale, tw + 6 / t.scale, 14 / t.scale)

          ctx.fillStyle = isDark ? '#fff' : '#1a2744'
          ctx.fillText(label, lx + 1 / t.scale, ly + 3 / t.scale)

          // Risk badge
          if (isHovered || isSelected) {
            const riskLabel = `${(p.risk_score * 100).toFixed(0)}%`
            ctx.font = `bold ${9 / t.scale}px sans-serif`
            ctx.fillStyle = color
            ctx.fillText(riskLabel, lx + 1 / t.scale, ly + 15 / t.scale)
          }
        }
      }

      // Axis labels
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'
      ctx.font = `${11 / t.scale}px sans-serif`
      ctx.fillText('Greater Sydney Region', W / 2 - 60 / t.scale, H - 12 / t.scale)

      ctx.restore()
    }

    draw()

    // Interactions
    function getPointAt(mx, my) {
      const t = transformRef.current
      const wx = (mx - t.x) / t.scale, wy = (my - t.y) / t.scale
      let best = null, bestD = Infinity
      for (const p of pts) {
        const dx = wx - p.sx, dy = wy - p.sy
        const d = dx * dx + dy * dy
        const hitR = Math.max(12, 16 / t.scale)
        if (d < hitR * hitR && d < bestD) { best = p; bestD = d }
      }
      return best
    }

    function onMove(e) {
      const r = canvas.getBoundingClientRect()
      const mx = e.clientX - r.left, my = e.clientY - r.top
      if (dragRef.current.dragging) {
        transformRef.current.x += e.clientX - dragRef.current.lastX
        transformRef.current.y += e.clientY - dragRef.current.lastY
        dragRef.current.lastX = e.clientX; dragRef.current.lastY = e.clientY
        draw(); return
      }
      const found = getPointAt(mx, my)
      setHovered(found ? found.id : null)
      canvas.style.cursor = found ? 'pointer' : 'grab'
    }

    function onClick(e) {
      const r = canvas.getBoundingClientRect()
      const found = getPointAt(e.clientX - r.left, e.clientY - r.top)
      if (found) selectProvider(found)
      else { setSelected(null); setProviderDetail(null) }
    }

    function onDown(e) {
      dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY }
      canvas.style.cursor = 'grabbing'
    }
    function onUp() { dragRef.current.dragging = false; canvas.style.cursor = 'grab' }
    function onWheel(e) {
      e.preventDefault()
      const r = canvas.getBoundingClientRect()
      const mx = e.clientX - r.left, my = e.clientY - r.top
      const t = transformRef.current
      const zoom = e.deltaY < 0 ? 1.1 : 0.9
      const newScale = Math.max(0.5, Math.min(5, t.scale * zoom))
      t.x = mx - (mx - t.x) * (newScale / t.scale)
      t.y = my - (my - t.y) * (newScale / t.scale)
      t.scale = newScale
      draw()
    }

    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('click', onClick)
    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('mouseup', onUp)
    canvas.addEventListener('mouseleave', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('mouseup', onUp)
      canvas.removeEventListener('mouseleave', onUp)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [data, selected, hovered])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading heatmap...</div>

  const filteredData = (data || []).filter(p => {
    if (!searchTerm) return true
    return p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.id.toLowerCase().includes(searchTerm.toLowerCase())
  })

  function formatMoney(n) { return n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(0)}K` : `$${n}` }

  return (
    <div>
      <div className="page-header">
        <h2>Geographic Risk Heatmap</h2>
        <p>Click providers to inspect -- scroll to zoom, drag to pan -- {data?.length || 0} providers mapped across Greater Sydney</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          {[['Critical', '#dc2626'], ['High', '#ef4444'], ['Medium', '#f97316'], ['Elevated', '#eab308'], ['Low', '#22c55e'], ['Clean', '#10b981']].map(([l, c]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />{l}
            </div>
          ))}
        </div>
        <button className="btn sm" onClick={() => { transformRef.current = { x: 0, y: 0, scale: 1 } }}>Reset View</button>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden' }}>
          <div style={{ height: 520 }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>

        {selected && (
          <div className="card slide-in" style={{ flex: '0 0 360px', maxHeight: 520, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: selected.risk_score > 0.7 ? 'var(--accent-red)' : 'var(--accent-orange)', marginBottom: 4 }}>
                  {selected.severity} Risk Provider
                </div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{selected.name}</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{selected.id}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{selected.address}</div>
              </div>
              <button className="btn sm" onClick={() => { setSelected(null); setProviderDetail(null) }}>&times;</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              <div style={{ padding: 10, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Risk Score</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: selected.risk_score > 0.7 ? 'var(--accent-red)' : 'var(--accent-orange)' }}>{(selected.risk_score * 100).toFixed(0)}%</div>
              </div>
              <div style={{ padding: 10, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Alerts</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-orange)' }}>{selected.alerts}</div>
              </div>
            </div>

            {loadingDetail ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div> :
              providerDetail && providerDetail.node_type === 'provider' && (
              <div className="fade-in">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {[
                    ['Billed', formatMoney(providerDetail.total_billed), 'var(--accent-blue)'],
                    ['Clients', providerDetail.participant_count, 'var(--accent-purple)'],
                    ['Staff', providerDetail.worker_count, 'var(--accent-green)'],
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
                {providerDetail.services_used?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>SERVICES</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {providerDetail.services_used.map(s => <span key={s} className="alert-tag" style={{ fontSize: 9 }}>{s}</span>)}
                    </div>
                  </div>
                )}
                {providerDetail.alerts?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>ALERTS ({providerDetail.alerts.length})</div>
                    {providerDetail.alerts.slice(0, 5).map((a, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                        <div className={`alert-severity ${a.severity}`} style={{ marginTop: 4 }} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{a.title?.slice(0, 50)}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{a.source_engine}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
              Lat: {selected.lat?.toFixed(4)}, Lng: {selected.lng?.toFixed(4)}
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Risk Hotspots</div>
          <input className="form-input" placeholder="Search providers..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            style={{ width: 250, fontSize: 12, padding: '6px 12px' }} />
        </div>
        <div className="table-container" style={{ maxHeight: 350, overflowY: 'auto' }}>
          <table><thead><tr><th>Provider</th><th>Address</th><th>Risk</th><th>Alerts</th><th>Severity</th></tr></thead>
            <tbody>{filteredData.slice(0, 40).map(p => (
              <tr key={p.id} onClick={() => selectProvider(p)} style={{ cursor: 'pointer', background: selected?.id === p.id ? 'rgba(59,130,246,0.06)' : undefined }}>
                <td><div style={{ fontWeight: 700 }}>{p.name}</div><div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.id}</div></td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.address}</td>
                <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="progress-bar" style={{ width: 40 }}><div className="progress-fill" style={{ width: `${p.risk_score*100}%`, background: p.risk_score>=0.65?'#dc2626':p.risk_score>=0.5?'#f97316':p.risk_score>=0.35?'#eab308':p.risk_score>=0.2?'#22c55e':'#10b981' }} /></div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: p.risk_score>0.7?'var(--accent-red)':'var(--accent-orange)' }}>{(p.risk_score*100).toFixed(0)}%</span>
                </div></td>
                <td style={{ fontWeight: 600 }}>{p.alerts}</td>
                <td><span className={`risk-badge ${p.severity}`}>{p.severity}</span></td>
              </tr>))}</tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
