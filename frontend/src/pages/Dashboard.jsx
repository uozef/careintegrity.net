import { useApi } from '../hooks/useApi'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts'

const SEVERITY_COLORS = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#3b82f6' }

const tooltipStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }

function formatMoney(n) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
  return `$${n?.toFixed(0) || 0}`
}

export default function Dashboard({ onNavigate }) {
  const { data, loading } = useApi('/dashboard', [])

  if (loading || !data) return <div className="loading"><div className="loading-spinner" />Loading dashboard...</div>

  const { summary, financial, alerts_by_severity, alerts_by_engine, invoice_distribution } = data

  const severityData = Object.entries(alerts_by_severity).map(([k, v]) => ({ name: k, value: v }))
  const engineData = Object.entries(alerts_by_engine || {}).map(([k, v]) => ({ name: k, count: v }))

  return (
    <div>
      <div className="page-header">
        <h2>CareIntegrity.AI Dashboard</h2>
        <p>NDIS Network Integrity Graph + Behavioural Drift Engine &mdash; Real-time fraud intelligence</p>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Providers Monitored</div>
          <div className="stat-value info count-up">{summary.total_providers}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Participants Protected</div>
          <div className="stat-value purple count-up">{summary.total_participants}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Claims Analysed</div>
          <div className="stat-value cyan count-up">{summary.total_claims?.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Alerts</div>
          <div className="stat-value warning count-up">{summary.total_alerts}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Critical Alerts</div>
          <div className="stat-value critical count-up">{summary.critical_alerts}</div>
          <div className="stat-sub">Requires immediate action</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Fraud Detected</div>
          <div className="stat-value money count-up">{formatMoney(financial?.total_fraud_detected_value || 0)}</div>
          <div className="stat-sub">Total suspicious claim value</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Penalties Issued</div>
          <div className="stat-value high count-up">{formatMoney(financial?.total_penalties_issued || 0)}</div>
          <div className="stat-sub">{financial?.penalty_count || 0} penalties</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Collection Rate</div>
          <div className="stat-value success count-up">{financial?.collection_rate || 0}%</div>
          <div className="stat-sub">{formatMoney(financial?.total_penalties_paid || 0)} recovered</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Alerts by Severity</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={severityData} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={4} dataKey="value" animationBegin={0} animationDuration={800}>
                {severityData.map(e => <Cell key={e.name} fill={SEVERITY_COLORS[e.name] || '#666'} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--text-primary)' }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4 }}>
            {severityData.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}
                onClick={() => onNavigate('alerts')}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEVERITY_COLORS[s.name] }} />
                {s.name}: {s.value}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Alerts by Detection Engine</div>
          <ResponsiveContainer width="100%" height={290}>
            <BarChart data={engineData} layout="vertical" margin={{ left: 120 }}>
              <XAxis type="number" stroke="var(--text-muted)" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="var(--text-muted)" fontSize={11} width={110} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--text-primary)' }} cursor={{ fill: 'var(--bg-hover)' }} />
              <Bar dataKey="count" fill="var(--accent-blue)" radius={[0, 6, 6, 0]} animationDuration={1000} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Invoice Fraud Score Distribution</div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={invoice_distribution || []}>
              <defs>
                <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-purple)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent-purple)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="score" stroke="var(--text-muted)" fontSize={11} />
              <YAxis stroke="var(--text-muted)" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--text-primary)' }} />
              <Area type="monotone" dataKey="count" stroke="var(--accent-purple)" fill="url(#scoreGradient)" strokeWidth={2} animationDuration={1200} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-title">Financial Overview</div>
          <div style={{ padding: '8px 0' }}>
            {[
              ['Fraud Detected Value', formatMoney(financial?.total_fraud_detected_value || 0), 'var(--accent-red)'],
              ['Penalties Issued', formatMoney(financial?.total_penalties_issued || 0), 'var(--accent-orange)'],
              ['Penalties Paid', formatMoney(financial?.total_penalties_paid || 0), 'var(--accent-green)'],
              ['Penalties Pending', formatMoney(financial?.total_penalties_pending || 0), 'var(--accent-yellow)'],
              ['Penalties Disputed', formatMoney(financial?.total_penalties_disputed || 0), 'var(--accent-red)'],
              ['Savings Recovered', formatMoney(financial?.total_savings_recovered || 0), 'var(--accent-cyan)'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ color, fontWeight: 700 }}>{val}</span>
              </div>
            ))}
          </div>
          <button className="btn" style={{ marginTop: 14, width: '100%' }} onClick={() => onNavigate('financial')}>
            View Financial Tracker &rarr;
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Network Graph Summary</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, padding: '8px 0' }}>
          {data.graph_stats && Object.entries(data.graph_stats).map(([key, val]) => (
            <div key={key} style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                {key.replace(/_/g, ' ')}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
                {typeof val === 'object' ? Object.values(val).reduce((a, b) => a + b, 0) : typeof val === 'number' ? val.toLocaleString() : String(val)}
              </div>
            </div>
          ))}
        </div>
        <button className="btn" style={{ marginTop: 14 }} onClick={() => onNavigate('network')}>
          Explore Network Graph &rarr;
        </button>
      </div>
    </div>
  )
}
