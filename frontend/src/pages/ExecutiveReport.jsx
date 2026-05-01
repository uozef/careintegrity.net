import { useApi } from '../hooks/useApi'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const ts = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }
const SEV_C = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#3b82f6' }
const fm = n => !n ? '$0' : n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(0)}K` : `$${n.toFixed(0)}`

export default function ExecutiveReport() {
  const { data, loading } = useApi('/executive-report', [])
  if (loading || !data) return <div className="loading"><div className="loading-spinner" />Generating executive report...</div>
  const { overview: o, alerts: a, risk_distribution: rd, financial: f, compliance: c, top_risk_providers: trp, recommendations: rec } = data

  const riskData = Object.entries(rd).filter(([,v]) => v > 0).map(([k,v]) => ({ name: k, value: v }))
  const riskColors = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#3b82f6', clean: '#10b981' }
  const engineData = Object.entries(a.by_engine || {}).map(([k,v]) => ({ name: k, count: v }))
  const sevData = Object.entries(a.by_severity || {}).map(([k,v]) => ({ name: k, value: v }))

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div><h2>Executive Report</h2><p>Generated {new Date(data.report_date).toLocaleDateString()} &middot; Period: {data.period}</p></div>
        <button className="btn primary" onClick={() => window.print()}>Export / Print</button>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
        {[['Providers', o.total_providers, 'info'], ['Participants', o.total_participants, 'purple'], ['Claims', o.total_claims?.toLocaleString(), 'info'],
          ['Total Billed', fm(o.total_billed), 'success'], ['Fraud Detected', fm(o.fraud_detected_value), 'critical'], ['Fraud %', `${o.fraud_percentage}%`, 'high'],
          ['Penalties Issued', fm(f.total_penalties_issued), 'high'], ['Collection Rate', `${f.collection_rate}%`, 'success']
        ].map(([l,v,c]) => (
          <div className="stat-card" key={l}><div className="stat-label">{l}</div><div className={`stat-value ${c}`} style={{fontSize:24}}>{v}</div></div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card"><div className="card-title">Provider Risk Distribution</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart><Pie data={riskData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value">
              {riskData.map(e => <Cell key={e.name} fill={riskColors[e.name]} />)}</Pie>
              <Tooltip contentStyle={ts} /></PieChart>
          </ResponsiveContainer>
          <div style={{display:'flex',justifyContent:'center',gap:12,flexWrap:'wrap'}}>
            {riskData.map(d=><div key={d.name} style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'var(--text-secondary)'}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:riskColors[d.name]}}/>{d.name}: {d.value}</div>)}
          </div>
        </div>
        <div className="card"><div className="card-title">Alerts by Engine</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={engineData} layout="vertical" margin={{left:120}}>
              <XAxis type="number" stroke="var(--text-muted)" fontSize={11}/><YAxis type="category" dataKey="name" stroke="var(--text-muted)" fontSize={11} width={110}/>
              <Tooltip contentStyle={ts}/><Bar dataKey="count" fill="var(--accent-blue)" radius={[0,6,6,0]}/>
            </BarChart></ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2">
        <div className="card"><div className="card-title">Compliance Score: {c.overall_score}%</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
            {[['Passing',c.passing,'var(--accent-green)'],['Warning',c.warning,'var(--accent-yellow)'],['Failing',c.failing,'var(--accent-red)']].map(([l,v,cl])=>(
              <div key={l} style={{padding:10,background:'var(--bg-secondary)',borderRadius:8,border:'1px solid var(--border)',textAlign:'center'}}>
                <div style={{fontSize:9,color:'var(--text-muted)',textTransform:'uppercase',fontWeight:700}}>{l}</div>
                <div style={{fontSize:22,fontWeight:800,color:cl}}>{v}</div>
              </div>))}
          </div>
          {Object.entries(c.by_category||{}).map(([cat,info])=>(
            <div key={cat} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
              <span>{cat}</span><span style={{fontWeight:700,color:info.avg_score>=90?'var(--accent-green)':info.avg_score>=70?'var(--accent-yellow)':'var(--accent-red)'}}>{info.avg_score}%</span>
            </div>))}
        </div>
        <div className="card"><div className="card-title">Financial Summary</div>
          {[['Fraud Detected',fm(f.total_fraud_detected_value),'var(--accent-red)'],['Penalties Issued',fm(f.total_penalties_issued),'var(--accent-orange)'],
            ['Collected',fm(f.total_penalties_paid),'var(--accent-green)'],['Pending',fm(f.total_penalties_pending),'var(--accent-yellow)'],
            ['Disputed',fm(f.total_penalties_disputed),'var(--accent-red)'],['Savings',fm(f.total_savings_recovered),'var(--accent-cyan)']
          ].map(([l,v,c])=>(
            <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
              <span style={{color:'var(--text-secondary)'}}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span></div>))}
        </div>
      </div>

      <div className="card" style={{marginBottom:20}}>
        <div className="card-title">Recommendations</div>
        {rec?.map((r,i)=>(
          <div key={i} style={{display:'flex',gap:10,padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
            <div className={`alert-severity ${r.priority}`} style={{marginTop:5}}/>
            <div><div style={{fontWeight:700,fontSize:13}}>{r.title}</div>
              <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:2,lineHeight:1.5}}>{r.detail}</div></div>
          </div>))}
      </div>

      <div className="card"><div className="card-title">Top Risk Providers</div>
        <div className="table-container"><table><thead><tr><th>Provider</th><th>Risk</th><th>Alerts</th></tr></thead><tbody>
          {trp?.slice(0,15).map(p=>(
            <tr key={p.id}><td><div style={{fontWeight:700}}>{p.name}</div><div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'monospace'}}>{p.id}</div></td>
              <td style={{fontWeight:700,color:p.risk>0.7?'var(--accent-red)':'var(--accent-orange)'}}>{(p.risk*100).toFixed(0)}%</td>
              <td style={{fontWeight:600}}>{p.alerts}</td></tr>))}
        </tbody></table></div>
      </div>
    </div>
  )
}
