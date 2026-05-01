import { useRef, useEffect } from 'react'
import { useApi } from '../hooks/useApi'

export default function CollusionMap() {
  const canvasRef = useRef(null)
  const { data, loading } = useApi('/collusion', [])

  useEffect(() => {
    if (!data || !data.network || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const rect = canvas.parentElement.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = 450

    const { nodes, edges } = data.network
    if (!nodes || nodes.length === 0) return

    const width = canvas.width
    const height = canvas.height

    // Position nodes in circle
    const positions = {}
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2
      const r = Math.min(width, height) * 0.35
      positions[n.id] = {
        x: width / 2 + Math.cos(angle) * r,
        y: height / 2 + Math.sin(angle) * r,
      }
    })

    // Simple force iterations
    for (let iter = 0; iter < 100; iter++) {
      const alpha = 0.3 * (1 - iter / 100)

      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = positions[nodes[i].id]
          const b = positions[nodes[j].id]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = -5000 * alpha / (dist * dist)
          a.x += dx / dist * force
          a.y += dy / dist * force
          b.x -= dx / dist * force
          b.y -= dy / dist * force
        }
      }

      // Attraction
      for (const edge of edges) {
        const a = positions[edge.source]
        const b = positions[edge.target]
        if (!a || !b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = dist * 0.01 * alpha * Math.min(edge.weight, 10)
        a.x += dx / dist * force
        a.y += dy / dist * force
        b.x -= dx / dist * force
        b.y -= dy / dist * force
      }

      // Center
      for (const n of nodes) {
        const p = positions[n.id]
        p.x += (width / 2 - p.x) * 0.01
        p.y += (height / 2 - p.y) * 0.01
        p.x = Math.max(30, Math.min(width - 30, p.x))
        p.y = Math.max(30, Math.min(height - 30, p.y))
      }
    }

    // Background
    ctx.fillStyle = '#0f1117'
    ctx.fillRect(0, 0, width, height)

    // Draw edges
    const maxWeight = Math.max(...edges.map(e => e.weight), 1)
    for (const edge of edges) {
      const a = positions[edge.source]
      const b = positions[edge.target]
      if (!a || !b) continue

      const intensity = Math.min(edge.weight / maxWeight, 1)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = edge.shared_staff > 0 ? `rgba(239,68,68,${0.2 + intensity * 0.6})` :
                        edge.shared_locations > 0 ? `rgba(245,158,11,${0.2 + intensity * 0.6})` :
                        `rgba(59,130,246,${0.1 + intensity * 0.3})`
      ctx.lineWidth = 1 + intensity * 3
      ctx.stroke()
    }

    // Draw nodes
    const maxDegree = Math.max(...nodes.map(n => n.weighted_degree || 1))
    for (const n of nodes) {
      const p = positions[n.id]
      const r = 5 + ((n.weighted_degree || 1) / maxDegree) * 15

      // Glow for high-degree
      if (n.weighted_degree > maxDegree * 0.3) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(239,68,68,0.15)'
        ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      const hue = n.weighted_degree > maxDegree * 0.5 ? '#ef4444' :
                  n.weighted_degree > maxDegree * 0.3 ? '#f97316' : '#3b82f6'
      ctx.fillStyle = hue
      ctx.fill()

      // Label
      ctx.fillStyle = '#e4e6f0'
      ctx.font = '10px sans-serif'
      ctx.fillText(n.id, p.x + r + 4, p.y + 3)
    }

  }, [data])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading collusion map...</div>

  const cartels = data?.cartels || []
  const referralLoops = data?.referral_loops || []

  return (
    <div>
      <div className="page-header">
        <h2>Collusion Detection Map</h2>
        <p>Multi-provider clustering — shared staff, shared participants, common addresses, referral loops</p>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8b8fa3' }}>
          <div style={{ width: 16, height: 3, background: '#ef4444', borderRadius: 2 }} /> Shared Staff
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8b8fa3' }}>
          <div style={{ width: 16, height: 3, background: '#f59e0b', borderRadius: 2 }} /> Shared Locations
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8b8fa3' }}>
          <div style={{ width: 16, height: 3, background: '#3b82f6', borderRadius: 2 }} /> Shared Participants
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ height: 450, background: '#0f1117' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 20 }}>
        <div className="card">
          <div className="card-title">Provider Cartel Clusters ({cartels.length})</div>
          <div className="alert-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
            {cartels.map((c, i) => (
              <div key={i} className="alert-item">
                <div className={`alert-severity ${c.severity}`} />
                <div className="alert-content">
                  <div className="alert-title" style={{ fontSize: 12 }}>{c.title}</div>
                  <div className="alert-desc" style={{ fontSize: 11 }}>{c.description}</div>
                  <div style={{ marginTop: 6, fontSize: 11, color: '#8b8fa3' }}>
                    Density: {c.density} | Staff: {c.shared_staff} | Participants: {c.shared_participants} | Locations: {c.shared_locations}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Referral Loops ({referralLoops.length})</div>
          <div className="alert-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
            {referralLoops.map((r, i) => (
              <div key={i} className="alert-item">
                <div className={`alert-severity ${r.severity}`} />
                <div className="alert-content">
                  <div className="alert-title" style={{ fontSize: 12 }}>{r.title}</div>
                  <div className="alert-desc" style={{ fontSize: 11 }}>{r.description}</div>
                </div>
              </div>
            ))}
            {referralLoops.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: '#5e6275' }}>No referral loops detected</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
