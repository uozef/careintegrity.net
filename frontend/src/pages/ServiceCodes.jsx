import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const tooltipStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }

function formatMoney(n) {
  if (!n) return '$0'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

const SVC_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6', '#a855f7', '#84cc16']

export default function ServiceCodes() {
  const { data: codes, loading } = useApi('/service-codes', [])
  const [searchTerm, setSearchTerm] = useState('')

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading service codes...</div>

  const filtered = (codes || []).filter(c =>
    c.service_type.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalAmount = filtered.reduce((s, c) => s + c.total_amount, 0)
  const totalClaims = filtered.reduce((s, c) => s + c.total_claims, 0)
  const totalHours = filtered.reduce((s, c) => s + c.total_hours, 0)

  const chartData = filtered.map((c, i) => ({
    name: c.service_type.length > 18 ? c.service_type.slice(0, 16) + '..' : c.service_type,
    amount: c.total_amount,
    fill: SVC_COLORS[i % SVC_COLORS.length],
  }))

  const rateChartData = filtered.map((c, i) => ({
    name: c.service_type.length > 18 ? c.service_type.slice(0, 16) + '..' : c.service_type,
    avg: c.avg_rate, min: c.min_rate, max: c.max_rate,
    fill: SVC_COLORS[i % SVC_COLORS.length],
  }))

  return (
    <div>
      <div className="page-header">
        <h2>Service Codes</h2>
        <p>NDIS service type analysis — billing volumes, rates, and fraud exposure</p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input className="form-input" placeholder="Search service codes (e.g. SIL, Therapy, Transport...)"
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          style={{ maxWidth: 500, fontSize: 14, padding: '12px 16px' }} />
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Service Types</div>
          <div className="stat-value info">{codes?.length || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Claims</div>
          <div className="stat-value purple">{totalClaims.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Hours</div>
          <div className="stat-value cyan">{totalHours.toLocaleString()}h</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Billed</div>
          <div className="stat-value success">{formatMoney(totalAmount)}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Revenue by Service Type</div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
              <XAxis type="number" stroke="var(--text-muted)" fontSize={11} tickFormatter={v => formatMoney(v)} />
              <YAxis type="category" dataKey="name" stroke="var(--text-muted)" fontSize={11} width={110} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--text-primary)' }} formatter={v => formatMoney(v)} />
              <Bar dataKey="amount" radius={[0, 6, 6, 0]} animationDuration={800}>
                {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-title">Average Hourly Rate by Service</div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={rateChartData} layout="vertical" margin={{ left: 120 }}>
              <XAxis type="number" stroke="var(--text-muted)" fontSize={11} tickFormatter={v => `$${v}`} />
              <YAxis type="category" dataKey="name" stroke="var(--text-muted)" fontSize={11} width={110} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--text-primary)' }} formatter={v => `$${v.toFixed(2)}/h`} />
              <Bar dataKey="avg" radius={[0, 6, 6, 0]} animationDuration={800}>
                {rateChartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Service Code Registry</div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Service Type</th>
                <th>Claims</th>
                <th>Hours</th>
                <th>Total Billed</th>
                <th>Avg Rate</th>
                <th>Rate Range</th>
                <th>Avg Session</th>
                <th>Providers</th>
                <th>Participants</th>
                <th>Workers</th>
                <th>Fraud %</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={c.service_type}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: SVC_COLORS[i % SVC_COLORS.length], flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.service_type}</span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{c.total_claims.toLocaleString()}</td>
                  <td>{c.total_hours.toLocaleString()}h</td>
                  <td style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>{formatMoney(c.total_amount)}</td>
                  <td style={{ fontWeight: 700, color: c.avg_rate > 85 ? 'var(--accent-orange)' : 'var(--text-primary)' }}>${c.avg_rate}/h</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>${c.min_rate} — ${c.max_rate}</td>
                  <td>{c.avg_session_hours}h</td>
                  <td>{c.provider_count}</td>
                  <td>{c.participant_count}</td>
                  <td>{c.worker_count}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="progress-bar" style={{ width: 40 }}>
                        <div className="progress-fill" style={{
                          width: `${c.fraud_claim_pct}%`,
                          background: c.fraud_claim_pct > 40 ? '#ef4444' : c.fraud_claim_pct > 20 ? '#f97316' : '#10b981',
                        }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: c.fraud_claim_pct > 40 ? 'var(--accent-red)' : 'var(--text-muted)' }}>
                        {c.fraud_claim_pct}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
