import { useApi } from '../hooks/useApi'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function InvoicePressure() {
  const { data: flagged, loading } = useApi('/invoices/flagged?limit=100', [])
  const { data: distribution } = useApi('/invoices/distribution', [])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading invoice analysis...</div>

  const invoices = flagged?.invoices || []

  return (
    <div>
      <div className="page-header">
        <h2>Invoice Pressure Testing</h2>
        <p>Every invoice scored: Fraud likelihood = deviation x network risk x behavioural drift</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Flagged Invoices</div>
          <div className="stat-value critical">{flagged?.total?.toLocaleString() || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Highest Score</div>
          <div className="stat-value high">
            {invoices.length > 0 ? `${(invoices[0].fraud_likelihood * 100).toFixed(0)}%` : '0%'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Score</div>
          <div className="stat-value warning">
            {invoices.length > 0
              ? `${(invoices.reduce((s, i) => s + i.fraud_likelihood, 0) / invoices.length * 100).toFixed(0)}%`
              : '0%'}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Fraud Score Distribution</div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={distribution || []}>
            <XAxis dataKey="score" stroke="var(--text-muted)" fontSize={11} />
            <YAxis stroke="var(--text-muted)" fontSize={11} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}
              itemStyle={{ color: 'var(--text-primary)' }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} fill={(entry) => {
              return '#8b5cf6'
            }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div className="card-title">Top Flagged Invoices</div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Claim ID</th>
                <th>Provider</th>
                <th>Participant</th>
                <th>Fraud Score</th>
                <th>Deviation</th>
                <th>Network Risk</th>
                <th>Drift</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {invoices.slice(0, 50).map(inv => (
                <tr key={inv.claim_id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{inv.claim_id}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{inv.provider_id}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{inv.participant_id}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="progress-bar" style={{ width: 50 }}>
                        <div className="progress-fill" style={{
                          width: `${inv.fraud_likelihood * 100}%`,
                          background: inv.fraud_likelihood >= 0.7 ? '#ef4444' : inv.fraud_likelihood >= 0.5 ? '#f97316' : '#f59e0b',
                        }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: inv.fraud_likelihood >= 0.7 ? '#ef4444' : '#f97316' }}>
                        {(inv.fraud_likelihood * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: '#8b8fa3' }}>{(inv.deviation_score * 100).toFixed(0)}%</td>
                  <td style={{ fontSize: 12, color: inv.network_risk > 0.5 ? '#ef4444' : '#8b8fa3' }}>
                    {(inv.network_risk * 100).toFixed(0)}%
                  </td>
                  <td style={{ fontSize: 12, color: inv.behavioural_drift > 0.5 ? '#f97316' : '#8b8fa3' }}>
                    {(inv.behavioural_drift * 100).toFixed(0)}%
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(inv.flags || []).slice(0, 2).map((f, i) => (
                        <span key={i} style={{ fontSize: 10, padding: '1px 6px', background: 'rgba(239,68,68,0.1)', borderRadius: 3, color: '#ef8888' }}>
                          {f.length > 30 ? f.slice(0, 30) + '...' : f}
                        </span>
                      ))}
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
