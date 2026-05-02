import { useState, useEffect, useCallback } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, AreaChart, Area } from 'recharts'

const ts = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }
function fm(n) { return !n ? '$0' : n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(0)}K` : `$${n.toFixed(0)}` }
function riskColor(rs) {
  if (rs >= 0.8) return '#dc2626'
  if (rs >= 0.65) return '#ef4444'
  if (rs >= 0.5) return '#f97316'
  if (rs >= 0.35) return '#eab308'
  if (rs >= 0.2) return '#22c55e'
  return '#10b981'
}

export default function RiskHeatmap() {
  const { data, loading } = useApi('/risk-heatmap', [])
  const { data: dashData } = useApi('/dashboard', [])
  const [selected, setSelected] = useState(null)
  const [providerDetail, setProviderDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [tickerIndex, setTickerIndex] = useState(0)
  const [sortBy, setSortBy] = useState('risk')

  // Live ticker animation
  useEffect(() => {
    if (!data?.length) return
    const highRisk = data.filter(d => d.risk_score > 0.5)
    if (!highRisk.length) return
    const timer = setInterval(() => setTickerIndex(i => (i + 1) % highRisk.length), 3000)
    return () => clearInterval(timer)
  }, [data])

  const selectProvider = useCallback(async (p) => {
    setSelected(p)
    setLoadingDetail(true)
    try { setProviderDetail(await fetchApi(`/graph/node/${p.id}`)) } catch { setProviderDetail(null) }
    setLoadingDetail(false)
  }, [])

  if (loading || !data) return <div className="loading"><div className="loading-spinner" />Loading risk intelligence...</div>

  const highRisk = data.filter(d => d.risk_score > 0.5)
  const tickerItem = highRisk[tickerIndex % Math.max(highRisk.length, 1)]

  // Risk distribution buckets
  const distBuckets = [
    { range: '0-20%', label: 'Clean', count: data.filter(d => d.risk_score < 0.2).length, color: '#10b981' },
    { range: '20-35%', label: 'Low', count: data.filter(d => d.risk_score >= 0.2 && d.risk_score < 0.35).length, color: '#22c55e' },
    { range: '35-50%', label: 'Elevated', count: data.filter(d => d.risk_score >= 0.35 && d.risk_score < 0.5).length, color: '#eab308' },
    { range: '50-65%', label: 'High', count: data.filter(d => d.risk_score >= 0.5 && d.risk_score < 0.65).length, color: '#f97316' },
    { range: '65-80%', label: 'Critical', count: data.filter(d => d.risk_score >= 0.65 && d.risk_score < 0.8).length, color: '#ef4444' },
    { range: '80%+', label: 'Severe', count: data.filter(d => d.risk_score >= 0.8).length, color: '#dc2626' },
  ]

  // Severity pie
  const sevPie = [
    { name: 'Critical', value: data.filter(d => d.severity === 'critical').length, fill: '#ef4444' },
    { name: 'High', value: data.filter(d => d.severity === 'high').length, fill: '#f97316' },
    { name: 'Medium', value: data.filter(d => d.severity === 'medium').length, fill: '#eab308' },
    { name: 'Low', value: data.filter(d => d.severity === 'low').length, fill: '#22c55e' },
    { name: 'None', value: data.filter(d => d.severity === 'none').length, fill: '#10b981' },
  ].filter(d => d.value > 0)

  // Radar data (alert categories from dashboard)
  const radarData = dashData?.alerts_by_engine ? Object.entries(dashData.alerts_by_engine).map(([k, v]) => ({
    engine: k.replace('Detection', '').replace('Analysis', '').trim().slice(0, 12), alerts: v, fullMark: Math.max(...Object.values(dashData.alerts_by_engine)) * 1.2,
  })) : []

  // Top risk providers for treemap-style view
  const topRisk = data.filter(d => d.risk_score > 0).slice(0, 30)

  // Sorted + filtered table data
  const filteredData = data.filter(p => {
    if (!searchTerm) return true
    return p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.id.toLowerCase().includes(searchTerm.toLowerCase())
  }).sort((a, b) => sortBy === 'risk' ? b.risk_score - a.risk_score : sortBy === 'alerts' ? b.alerts - a.alerts : a.name.localeCompare(b.name))

  return (
    <div>
      <div className="page-header">
        <h2>Risk Intelligence Dashboard</h2>
        <p>Real-time risk landscape across {data.length} providers -- {highRisk.length} flagged high-risk</p>
      </div>

      {/* Live Ticker */}
      {tickerItem && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: `${riskColor(tickerItem.risk_score)}08`, border: `1px solid ${riskColor(tickerItem.risk_score)}20`, borderRadius: 10, marginBottom: 20, transition: 'all 0.5s' }}
          onClick={() => selectProvider(tickerItem)}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: riskColor(tickerItem.risk_score), animation: 'pulse-dot 2s infinite', flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 13 }}>
            <span style={{ fontWeight: 700 }}>{tickerItem.name}</span>
            <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>--</span>
            <span style={{ color: riskColor(tickerItem.risk_score), fontWeight: 700 }}>{(tickerItem.risk_score * 100).toFixed(0)}% risk</span>
            <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>--</span>
            <span>{tickerItem.alerts} alerts</span>
            <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>--</span>
            <span style={{ color: 'var(--text-muted)' }}>{tickerItem.address?.slice(0, 40)}</span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Click to inspect</span>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-label">Total Providers</div><div className="stat-value info">{data.length}</div></div>
        <div className="stat-card"><div className="stat-label">High Risk (50%+)</div><div className="stat-value critical">{highRisk.length}</div></div>
        <div className="stat-card"><div className="stat-label">Clean (&lt;20%)</div><div className="stat-value success">{data.filter(d => d.risk_score < 0.2).length}</div></div>
        <div className="stat-card"><div className="stat-label">Avg Risk Score</div><div className="stat-value warning">{(data.reduce((s, d) => s + d.risk_score, 0) / data.length * 100).toFixed(0)}%</div></div>
      </div>

      {/* Charts Row */}
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">Risk Distribution</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={distBuckets}>
              <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={11} />
              <YAxis stroke="var(--text-muted)" fontSize={11} />
              <Tooltip contentStyle={ts} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} animationDuration={800}>
                {distBuckets.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-title">Severity Breakdown</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={sevPie} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value" animationDuration={800}>
                {sevPie.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip contentStyle={ts} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            {sevPie.map(d => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: d.fill }} />{d.name}: {d.value}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Detection Engine Coverage</div>
          {radarData.length > 0 && (
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={70}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="engine" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                <PolarRadiusAxis tick={false} axisLine={false} />
                <Radar dataKey="alerts" stroke="var(--accent-blue)" fill="var(--accent-blue)" fillOpacity={0.15} strokeWidth={2} animationDuration={1000} />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Risk Treemap — visual blocks sized by risk */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Provider Risk Landscape</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 0' }}>
          {topRisk.map(p => {
            const size = 40 + p.risk_score * 60
            const isSelected = selected?.id === p.id
            return (
              <div key={p.id} onClick={() => selectProvider(p)}
                style={{
                  width: size, height: size, borderRadius: 8, cursor: 'pointer',
                  background: riskColor(p.risk_score), opacity: 0.7 + p.risk_score * 0.3,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                  transition: 'all 0.2s', border: isSelected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                  boxShadow: isSelected ? `0 0 12px ${riskColor(p.risk_score)}` : 'none',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.zIndex = 10 }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.zIndex = 1 }}
                title={`${p.name} (${p.id}) — ${(p.risk_score * 100).toFixed(0)}% risk — ${p.alerts} alerts`}
              >
                {size > 55 && <div style={{ fontSize: 9, color: '#fff', fontWeight: 700, textAlign: 'center', lineHeight: 1.2, padding: '0 4px', overflow: 'hidden' }}>{p.name.slice(0, 12)}</div>}
                {size > 45 && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.9)', fontWeight: 800 }}>{(p.risk_score * 100).toFixed(0)}%</div>}
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Block size = risk level. Hover to enlarge. Click to inspect.</div>
      </div>

      {/* Provider Table + Detail */}
      <div style={{ display: 'flex', gap: 20 }}>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>All Providers ({filteredData.length})</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['risk', 'Risk'], ['alerts', 'Alerts'], ['name', 'Name']].map(([k, l]) => (
                <button key={k} className={`filter-btn ${sortBy === k ? 'active' : ''}`} onClick={() => setSortBy(k)} style={{ fontSize: 11, padding: '4px 10px' }}>{l}</button>
              ))}
            </div>
          </div>
          <input className="form-input" placeholder="Search providers..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            style={{ marginBottom: 12, fontSize: 12, padding: '8px 12px' }} />
          <div className="table-container" style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Provider</th><th>Risk</th><th>Alerts</th><th>Severity</th><th>Location</th></tr></thead>
              <tbody>
                {filteredData.slice(0, 40).map(p => (
                  <tr key={p.id} onClick={() => selectProvider(p)} style={{ cursor: 'pointer', background: selected?.id === p.id ? 'rgba(59,130,246,0.06)' : undefined }}>
                    <td><div style={{ fontWeight: 700 }}>{p.name}</div><div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.id}</div></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: riskColor(p.risk_score) }} />
                        <span style={{ fontWeight: 700, color: riskColor(p.risk_score) }}>{(p.risk_score * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{p.alerts}</td>
                    <td><span className={`risk-badge ${p.severity === 'none' ? 'low' : p.severity}`}>{p.severity}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.address?.slice(0, 35)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <div className="card slide-in" style={{ flex: '0 0 340px', maxHeight: 600, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: riskColor(selected.risk_score), marginBottom: 4 }}>{selected.severity} Risk</div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{selected.name}</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{selected.id}</div>
              </div>
              <button className="btn sm" onClick={() => { setSelected(null); setProviderDetail(null) }}>&times;</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div style={{ padding: 10, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Risk</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: riskColor(selected.risk_score) }}>{(selected.risk_score * 100).toFixed(0)}%</div>
              </div>
              <div style={{ padding: 10, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Alerts</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-orange)' }}>{selected.alerts}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>{selected.address}</div>

            {loadingDetail ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div> :
              providerDetail?.node_type === 'provider' && (
              <div className="fade-in">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
                  {[['Billed', fm(providerDetail.total_billed), 'var(--accent-blue)'],
                    ['Clients', providerDetail.participant_count, 'var(--accent-purple)'],
                    ['Staff', providerDetail.worker_count, 'var(--accent-green)']
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
                {providerDetail.services_used?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>SERVICES</div>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {providerDetail.services_used.map(s => <span key={s} className="alert-tag" style={{ fontSize: 9 }}>{s}</span>)}
                    </div>
                  </div>
                )}
                {providerDetail.alerts?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>ALERTS ({providerDetail.alerts.length})</div>
                    {providerDetail.alerts.slice(0, 5).map((a, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                        <div className={`alert-severity ${a.severity}`} style={{ marginTop: 3 }} />
                        <div><div style={{ fontWeight: 600 }}>{a.title?.slice(0, 45)}</div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{a.source_engine}</div></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
