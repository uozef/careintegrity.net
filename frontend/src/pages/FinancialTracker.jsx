import { useApi } from '../hooks/useApi'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, Legend } from 'recharts'

const tooltipStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }

const CATEGORY_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4']

function formatMoney(n) {
  if (!n) return '$0'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

export default function FinancialTracker() {
  const { data: summary, loading: l1 } = useApi('/financial/summary', [])
  const { data: byCategory, loading: l2 } = useApi('/financial/by-category', [])
  const { data: timeline, loading: l3 } = useApi('/financial/timeline', [])
  const { data: byProvider, loading: l4 } = useApi('/financial/by-provider', [])

  if (l1 || l2 || l3 || l4) return <div className="loading"><div className="loading-spinner" />Loading financial data...</div>

  const categoryData = Object.entries(byCategory || {}).map(([k, v], i) => ({
    name: k,
    amount: v.total_amount,
    paid: v.paid,
    pending: v.pending,
    count: v.count,
    fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }))

  const pieData = [
    { name: 'Paid', value: summary?.total_penalties_paid || 0, fill: '#10b981' },
    { name: 'Pending', value: summary?.total_penalties_pending || 0, fill: '#f59e0b' },
    { name: 'Disputed', value: summary?.total_penalties_disputed || 0, fill: '#ef4444' },
    { name: 'Overdue', value: summary?.total_penalties_overdue || 0, fill: '#f97316' },
  ].filter(d => d.value > 0)

  return (
    <div>
      <div className="page-header">
        <h2>Financial Tracker</h2>
        <p>Track fraud value detected, penalties issued, collections, and recovery rates</p>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--accent-red)' }}>
          <div className="stat-label">Fraud Detected</div>
          <div className="stat-value critical count-up">{formatMoney(summary?.total_fraud_detected_value)}</div>
          <div className="stat-sub">Total suspicious claim value</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--accent-orange)' }}>
          <div className="stat-label">Penalties Issued</div>
          <div className="stat-value high count-up">{formatMoney(summary?.total_penalties_issued)}</div>
          <div className="stat-sub">{summary?.penalty_count || 0} penalties total</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--accent-green)' }}>
          <div className="stat-label">Collected</div>
          <div className="stat-value success count-up">{formatMoney(summary?.total_penalties_paid)}</div>
          <div className="stat-sub">{summary?.penalties_paid_count || 0} paid</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--accent-yellow)' }}>
          <div className="stat-label">Pending</div>
          <div className="stat-value warning count-up">{formatMoney(summary?.total_penalties_pending)}</div>
          <div className="stat-sub">{summary?.penalties_pending_count || 0} awaiting</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--accent-red)' }}>
          <div className="stat-label">Disputed</div>
          <div className="stat-value critical count-up">{formatMoney(summary?.total_penalties_disputed)}</div>
          <div className="stat-sub">{summary?.penalties_disputed_count || 0} disputes</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--accent-cyan)' }}>
          <div className="stat-label">Collection Rate</div>
          <div className="stat-value cyan count-up">{summary?.collection_rate || 0}%</div>
          <div className="stat-sub">Of total issued</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--accent-green)' }}>
          <div className="stat-label">Total Savings</div>
          <div className="stat-value success count-up">{formatMoney(summary?.total_savings_recovered)}</div>
          <div className="stat-sub">Recovered + prevented</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--accent-purple)' }}>
          <div className="stat-label">Overdue</div>
          <div className="stat-value critical count-up">{formatMoney(summary?.total_penalties_overdue)}</div>
          <div className="stat-sub">Past due date</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Penalty Status Breakdown</div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" animationDuration={1000}>
                {pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--text-primary)' }}
                formatter={(val) => formatMoney(val)} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            {pieData.map(d => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.fill }} />
                {d.name}: {formatMoney(d.value)}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Penalties by Fraud Category</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 100 }}>
              <XAxis type="number" stroke="var(--text-muted)" fontSize={11} tickFormatter={v => formatMoney(v)} />
              <YAxis type="category" dataKey="name" stroke="var(--text-muted)" fontSize={11} width={90} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--text-primary)' }}
                formatter={(val) => formatMoney(val)} />
              <Bar dataKey="amount" radius={[0, 6, 6, 0]} animationDuration={1000}>
                {categoryData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {timeline && timeline.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title">Penalty Issuance Timeline</div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={timeline}>
              <defs>
                <linearGradient id="amountGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="paidGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={11} />
              <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={v => formatMoney(v)} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--text-primary)' }}
                formatter={(val) => formatMoney(val)} />
              <Legend />
              <Area type="monotone" dataKey="amount" name="Issued" stroke="#f97316" fill="url(#amountGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="paid" name="Collected" stroke="#10b981" fill="url(#paidGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card">
        <div className="card-title">Provider Penalty Leaderboard</div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Provider</th>
                <th>Penalties</th>
                <th>Total Fined</th>
                <th>Paid</th>
                <th>Outstanding</th>
                <th>Recovery</th>
              </tr>
            </thead>
            <tbody>
              {(byProvider || []).slice(0, 30).map((p, i) => (
                <tr key={p.provider_id}>
                  <td style={{ fontWeight: 700, color: i < 3 ? 'var(--accent-red)' : 'var(--text-muted)', fontSize: 14 }}>#{i + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{p.provider_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.provider_id}</div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{p.penalty_count}</td>
                  <td style={{ fontWeight: 700, color: 'var(--accent-red)', fontSize: 14 }}>${p.total_amount?.toLocaleString()}</td>
                  <td style={{ color: 'var(--accent-green)', fontWeight: 600 }}>${p.paid_amount?.toLocaleString()}</td>
                  <td style={{ color: p.outstanding > 0 ? 'var(--accent-orange)' : 'var(--accent-green)', fontWeight: 600 }}>
                    ${p.outstanding?.toLocaleString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="progress-bar" style={{ width: 60 }}>
                        <div className="progress-fill" style={{
                          width: `${p.total_amount > 0 ? (p.paid_amount / p.total_amount * 100) : 0}%`,
                          background: p.paid_amount >= p.total_amount ? 'var(--accent-green)' : 'var(--accent-yellow)',
                        }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {p.total_amount > 0 ? Math.round(p.paid_amount / p.total_amount * 100) : 0}%
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
