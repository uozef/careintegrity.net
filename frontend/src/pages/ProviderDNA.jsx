import { useRef, useEffect } from 'react'
import { useApi } from '../hooks/useApi'

export default function ProviderDNA() {
  const canvasRef = useRef(null)
  const { data, loading } = useApi('/embeddings', [])
  const { data: alerts } = useApi('/alerts?limit=50&engine=Provider%20DNA', [])

  useEffect(() => {
    if (!data || !data.points || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const rect = canvas.parentElement.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = 450

    const points = data.points
    const fraudSet = new Set(data.fraud_providers || [])

    if (points.length === 0) return

    const xs = points.map(p => p.x)
    const ys = points.map(p => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1
    const pad = 40

    function toCanvasX(x) { return pad + ((x - minX) / rangeX) * (canvas.width - pad * 2) }
    function toCanvasY(y) { return pad + ((y - minY) / rangeY) * (canvas.height - pad * 2) }

    // Background
    ctx.fillStyle = '#0f1117'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Grid
    ctx.strokeStyle = '#1a1d27'
    ctx.lineWidth = 1
    for (let i = 0; i <= 10; i++) {
      const x = pad + (i / 10) * (canvas.width - pad * 2)
      ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, canvas.height - pad); ctx.stroke()
      const y = pad + (i / 10) * (canvas.height - pad * 2)
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(canvas.width - pad, y); ctx.stroke()
    }

    // Draw points
    for (const p of points) {
      const cx = toCanvasX(p.x)
      const cy = toCanvasY(p.y)
      const isFraud = fraudSet.has(p.provider_id)

      ctx.beginPath()
      ctx.arc(cx, cy, isFraud ? 7 : 5, 0, Math.PI * 2)
      ctx.fillStyle = isFraud ? '#ef4444' : '#3b82f6'
      ctx.globalAlpha = 0.8
      ctx.fill()

      if (isFraud) {
        ctx.globalAlpha = 0.3
        ctx.beginPath()
        ctx.arc(cx, cy, 14, 0, Math.PI * 2)
        ctx.fillStyle = '#ef4444'
        ctx.fill()
      }

      ctx.globalAlpha = 1
      ctx.fillStyle = '#8b8fa3'
      ctx.font = '9px sans-serif'
      ctx.fillText(p.provider_id, cx + 8, cy + 3)
    }

    // Axes labels
    ctx.fillStyle = '#5e6275'
    ctx.font = '11px sans-serif'
    ctx.fillText('PCA Component 1', canvas.width / 2 - 40, canvas.height - 10)
    ctx.save()
    ctx.translate(12, canvas.height / 2 + 40)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('PCA Component 2', 0, 0)
    ctx.restore()

  }, [data])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading provider DNA...</div>

  return (
    <div>
      <div className="page-header">
        <h2>Provider DNA Embedding Space</h2>
        <p>AI representation learning — each provider converted to a behaviour vector, projected to 2D via PCA</p>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8b8fa3' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6' }} />
          Normal Providers
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8b8fa3' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px rgba(239,68,68,0.5)' }} />
          Fraud-flagged Providers
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ height: 450, background: '#0f1117' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title">Behavioural Mutation Alerts</div>
        <div className="alert-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
          {(alerts?.alerts || []).map((a, i) => (
            <div key={i} className="alert-item">
              <div className={`alert-severity ${a.severity}`} />
              <div className="alert-content">
                <div className="alert-title" style={{ fontSize: 12 }}>{a.title}</div>
                <div className="alert-desc" style={{ fontSize: 11 }}>{a.description}</div>
                <div className="alert-meta">
                  <span className="alert-tag">{a.type}</span>
                  <span className="alert-confidence">Confidence: {(a.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
