import { useRef, useEffect, useState, useCallback } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'
import ForceGraph3D from '3d-force-graph'

export default function CollusionMap() {
  const containerRef = useRef(null)
  const graphRef = useRef(null)
  const rotateRef = useRef(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [nodeDetail, setNodeDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const { data, loading } = useApi('/collusion', [])

  const fetchDetail = useCallback(async (nodeId) => {
    setLoadingDetail(true)
    try {
      const detail = await fetchApi(`/providers/${nodeId}`)
      const rawEdges = data?.network?.edges || []
      const partners = rawEdges
        .filter(e => e.source === nodeId || e.target === nodeId)
        .map(e => ({
          partner: e.source === nodeId ? e.target : e.source,
          weight: e.weight, shared_staff: e.shared_staff,
          shared_participants: e.shared_participants, shared_locations: e.shared_locations,
        }))
        .sort((a, b) => b.weight - a.weight)
      setNodeDetail({ ...detail, collusionPartners: partners })
    } catch { setNodeDetail(null) }
    setLoadingDetail(false)
  }, [data])

  useEffect(() => {
    if (!data?.network || !containerRef.current) return
    const { nodes, edges } = data.network
    if (!nodes?.length) return

    const el = containerRef.current
    const maxDegree = Math.max(...nodes.map(n => n.weighted_degree || 1))
    const maxWeight = Math.max(...edges.map(e => e.weight || 1), 1)

    const graphData = {
      nodes: nodes.map(n => {
        const dr = (n.weighted_degree || 1) / maxDegree
        return {
          id: n.id, name: n.name || n.id, weighted_degree: n.weighted_degree || 0,
          color: dr > 0.5 ? '#ef4444' : dr > 0.3 ? '#f97316' : '#3b82f6',
          size: 3 + dr * 18,
        }
      }),
      links: edges.map(e => ({
        source: e.source, target: e.target, weight: e.weight || 1,
        shared_staff: e.shared_staff || 0, shared_participants: e.shared_participants || 0,
        shared_locations: e.shared_locations || 0,
        color: e.shared_staff > 0 && e.shared_staff >= e.shared_participants ? 'rgba(239,68,68,0.4)'
          : e.shared_locations > 0 ? 'rgba(245,158,11,0.4)' : 'rgba(59,130,246,0.2)',
      })),
    }

    // Clean up previous instance
    if (graphRef.current) {
      try { graphRef.current.pauseAnimation() } catch {}
      graphRef.current = null
    }
    el.innerHTML = ''

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

    try {
      const Graph = ForceGraph3D()(el)
        .graphData(graphData)
        .backgroundColor(isDark ? '#0a0c14' : '#f0f2f8')
        .width(el.offsetWidth || 800)
        .height(560)
        .nodeVal(n => n.size * n.size)
        .nodeLabel(n => `<div style="background:rgba(0,0,0,0.8);color:#fff;padding:8px 12px;border-radius:8px;font-size:12px;font-family:sans-serif"><b>${n.name}</b><br/>${n.id}<br/>Connections: ${n.weighted_degree}</div>`)
        .nodeColor(n => n.color)
        .nodeOpacity(0.9)
        .nodeResolution(12)
        .linkWidth(l => 0.5 + (l.weight / maxWeight) * 3)
        .linkColor(l => l.color)
        .linkOpacity(0.5)
        .linkDirectionalParticles(l => l.shared_staff > 0 ? 2 : 0)
        .linkDirectionalParticleWidth(1.5)
        .linkDirectionalParticleSpeed(0.005)
        .linkDirectionalParticleColor(() => '#ef4444')
        .onNodeClick(node => {
          if (!node) return
          setSelectedNode(prev => {
            const newSel = prev === node.id ? null : node.id
            if (newSel) {
              fetchDetail(node.id)
              try {
                const dist = 200
                const hp = Math.hypot(node.x || 0, node.y || 0, node.z || 0) || 1
                const ratio = 1 + dist / hp
                Graph.cameraPosition(
                  { x: (node.x || 0) * ratio, y: (node.y || 0) * ratio, z: (node.z || 0) * ratio },
                  { x: node.x || 0, y: node.y || 0, z: node.z || 0 },
                  1200
                )
              } catch {}
            } else {
              setNodeDetail(null)
            }
            return newSel
          })
        })
        .onNodeHover(node => { el.style.cursor = node ? 'pointer' : 'grab' })

      // Configure forces
      try {
        Graph.d3Force('charge').strength(-100)
        Graph.d3Force('link').distance(l => 50 + (1 - (l.weight || 0) / maxWeight) * 80)
      } catch {}

      graphRef.current = Graph

      // Gentle auto-rotation
      let angle = 0
      let rotating = true
      rotateRef.current = setInterval(() => {
        if (!rotating || !graphRef.current) return
        try {
          angle += 0.003
          graphRef.current.cameraPosition({ x: 350 * Math.sin(angle), z: 350 * Math.cos(angle) })
        } catch {}
      }, 40)

      const stopRotation = () => { rotating = false }
      el.addEventListener('mousedown', stopRotation)
      el.addEventListener('touchstart', stopRotation)

    } catch (err) {
      console.error('3D graph init error:', err)
      el.innerHTML = '<div style="padding:40px;text-align:center;color:#888">3D graph failed to load. Try refreshing.</div>'
    }

    return () => {
      if (rotateRef.current) clearInterval(rotateRef.current)
      if (graphRef.current) {
        try { graphRef.current.pauseAnimation() } catch {}
        graphRef.current = null
      }
    }
  }, [data])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading collusion map...</div>

  const cartels = data?.cartels || []
  const referralLoops = data?.referral_loops || []
  const detail = nodeDetail

  return (
    <div>
      <div className="page-header">
        <h2>3D Collusion Detection Map</h2>
        <p>WebGL 3D graph -- drag to orbit, scroll to zoom, click nodes to inspect collusion links</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          {[['Shared Staff', '#ef4444'], ['Shared Locations', '#f59e0b'], ['Shared Participants', '#3b82f6']].map(([l, c]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <div style={{ width: 16, height: 3, background: c, borderRadius: 2 }} />{l}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />High Risk
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6' }} />Low Risk
          </div>
        </div>
        {selectedNode && <button className="btn sm" onClick={() => { setSelectedNode(null); setNodeDetail(null) }}>Deselect</button>}
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden', flex: detail ? '1 1 58%' : '1 1 100%', transition: 'flex 0.3s', borderRadius: 12 }}>
          <div ref={containerRef} style={{ height: 560, background: 'var(--canvas-bg)' }} />
        </div>

        {detail && !detail.error && (
          <div className="card slide-in" style={{ flex: '0 0 380px', maxHeight: 560, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--accent-orange)', marginBottom: 4 }}>Collusion Analysis</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{detail.provider?.name}</div>
                <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: 2 }}>{selectedNode}</div>
              </div>
              <button className="btn sm" onClick={() => { setSelectedNode(null); setNodeDetail(null) }}>&times;</button>
            </div>
            {loadingDetail ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Analysing...</div> : (
              <div className="fade-in">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                  {[
                    ['Risk', `${((detail.risk_profile?.risk_score || 0) * 100).toFixed(0)}%`, detail.risk_profile?.risk_score > 0.5 ? 'var(--accent-red)' : 'var(--accent-green)'],
                    ['Partners', detail.collusionPartners?.length || 0, 'var(--accent-orange)'],
                    ['Alerts', detail.risk_profile?.alerts || 0, 'var(--accent-yellow)'],
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ padding: 10, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: c, marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {detail.collusionPartners?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
                      Collusion Partners ({detail.collusionPartners.length})
                    </div>
                    {detail.collusionPartners.slice(0, 12).map((p, i) => (
                      <div key={i} onClick={() => { setSelectedNode(p.partner); fetchDetail(p.partner) }}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', marginBottom: 4,
                          background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                        <div>
                          <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{p.partner}</div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            {p.shared_staff > 0 && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>{p.shared_staff} staff</span>}
                            {p.shared_participants > 0 && <span style={{ fontSize: 10, color: '#3b82f6', fontWeight: 600 }}>{p.shared_participants} pts</span>}
                            {p.shared_locations > 0 && <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>{p.shared_locations} loc</span>}
                          </div>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: p.weight > 10 ? 'var(--accent-red)' : 'var(--accent-orange)' }}>{p.weight}</div>
                      </div>
                    ))}
                  </div>
                )}
                {detail.alerts?.filter(a => a.source_engine === 'Collusion Detection' || a.source_engine === 'Network Graph').length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Alerts</div>
                    {detail.alerts.filter(a => a.source_engine === 'Collusion Detection' || a.source_engine === 'Network Graph').slice(0, 5).map((a, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                        <div className={`alert-severity ${a.severity}`} style={{ marginTop: 4 }} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{a.title?.slice(0, 60)}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{a.type} -- {(a.confidence * 100).toFixed(0)}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid-2" style={{ marginTop: 20 }}>
        <div className="card">
          <div className="card-title">Provider Cartel Clusters ({cartels.length})</div>
          <div className="alert-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
            {cartels.map((c, i) => (
              <div key={i} className="alert-item" onClick={() => { const pid = c.entities?.[0]; if (pid) { setSelectedNode(pid); fetchDetail(pid) } }}>
                <div className={`alert-severity ${c.severity}`} />
                <div className="alert-content">
                  <div className="alert-title" style={{ fontSize: 12 }}>{c.title}</div>
                  <div className="alert-desc" style={{ fontSize: 11 }}>{c.description}</div>
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>Density: {c.density} | Staff: {c.shared_staff} | Pts: {c.shared_participants}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Referral Loops ({referralLoops.length})</div>
          <div className="alert-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
            {referralLoops.map((r, i) => (
              <div key={i} className="alert-item" onClick={() => { const pid = r.entities?.find(e => e.startsWith('PRV')); if (pid) { setSelectedNode(pid); fetchDetail(pid) } }}>
                <div className={`alert-severity ${r.severity}`} />
                <div className="alert-content">
                  <div className="alert-title" style={{ fontSize: 12 }}>{r.title}</div>
                  <div className="alert-desc" style={{ fontSize: 11 }}>{r.description}</div>
                </div>
              </div>
            ))}
            {referralLoops.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>No referral loops detected</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
