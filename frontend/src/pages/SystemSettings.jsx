import { useState } from 'react'

const TABS = ['Data Sources', 'Cloud Storage', 'AI Models', 'Processing', 'Integrations']

const defaultConfig = {
  dataSources: {
    primary: { type: 'snowflake', host: 'careintegrity.au-east-1.snowflakecomputing.com', database: 'NDIS_PROD', schema: 'PUBLIC', warehouse: 'COMPUTE_WH', role: 'ANALYST', username: 'svc_careintegrity', status: 'connected', lastSync: '2026-05-02T08:30:00' },
    datalake: { type: 'databricks', host: 'adb-12345.azuredatabricks.net', catalog: 'ndis_lake', schema: 'raw_claims', token: '****-masked-****', status: 'connected', lastSync: '2026-05-02T08:15:00' },
    claims_db: { type: 'postgresql', host: 'ndis-claims-rds.ap-southeast-2.rds.amazonaws.com', port: 5432, database: 'claims_prod', username: 'readonly_user', ssl: true, status: 'connected', lastSync: '2026-05-02T08:45:00' },
    providers_db: { type: 'mssql', host: 'ndis-providers.database.windows.net', database: 'ProviderRegistry', username: 'app_reader', status: 'connected', lastSync: '2026-05-02T07:00:00' },
    participants_api: { type: 'rest_api', endpoint: 'https://api.ndis.gov.au/v2/participants', auth: 'OAuth2', status: 'connected', lastSync: '2026-05-02T09:00:00' },
  },
  cloudStorage: {
    s3_invoices: { provider: 'AWS S3', bucket: 'ndis-invoices-prod', region: 'ap-southeast-2', prefix: 'invoices/', accessKey: 'AKIA****MASKED', status: 'connected', files: 1247832 },
    s3_models: { provider: 'AWS S3', bucket: 'careintegrity-ml-models', region: 'ap-southeast-2', prefix: 'models/prod/', accessKey: 'AKIA****MASKED', status: 'connected', files: 48 },
    azure_blob: { provider: 'Azure Blob', account: 'ndisintegrity', container: 'documents', sasToken: '****masked****', status: 'connected', files: 534219 },
    azure_datalake: { provider: 'Azure Data Lake Gen2', account: 'ndisdatalake', filesystem: 'raw-data', directory: '/claims/2026/', status: 'connected', files: 89432 },
    gcs_archive: { provider: 'Google Cloud Storage', bucket: 'ndis-archive-au', prefix: 'historical/', status: 'disconnected', files: 0 },
  },
  aiModels: {
    fraud_classifier: { name: 'Fraud Likelihood Classifier', type: 'XGBoost', version: 'v3.2.1', endpoint: 'sagemaker:fraud-classifier-prod', status: 'active', accuracy: 94.2, lastTrained: '2026-04-15', features: 35 },
    anomaly_detector: { name: 'Anomaly Detection Engine', type: 'Isolation Forest', version: 'v2.1.0', endpoint: 'sagemaker:anomaly-detector-prod', status: 'active', accuracy: 91.8, lastTrained: '2026-04-20', features: 28 },
    graph_embeddings: { name: 'Provider DNA Embeddings', type: 'Graph Neural Network', version: 'v1.4.0', endpoint: 'local:provider-dna', status: 'active', accuracy: 89.5, lastTrained: '2026-04-25', features: 35 },
    nlp_claims: { name: 'Claims NLP Analyser', type: 'BERT Fine-tuned', version: 'v1.0.2', endpoint: 'sagemaker:claims-nlp-prod', status: 'standby', accuracy: 87.3, lastTrained: '2026-03-10', features: 768 },
    collusion_gnn: { name: 'Collusion Network GNN', type: 'GraphSAGE', version: 'v2.0.0', endpoint: 'local:collusion-gnn', status: 'active', accuracy: 92.1, lastTrained: '2026-04-28', features: 64 },
    risk_scorer: { name: 'Composite Risk Scorer', type: 'Ensemble (RF+GBM+NN)', version: 'v4.0.0', endpoint: 'sagemaker:risk-scorer-prod', status: 'active', accuracy: 95.6, lastTrained: '2026-05-01', features: 120 },
  },
  processing: {
    batch_interval: 10,
    real_time_enabled: true,
    max_concurrent_jobs: 8,
    claim_processing_timeout: 30,
    alert_threshold: 0.6,
    auto_penalty_threshold: 0.85,
    max_claims_per_batch: 50000,
    retention_days: 365,
    parallel_engines: true,
    gpu_acceleration: false,
    cache_ttl: 300,
    webhook_url: 'https://hooks.slack.com/services/T0000/B0000/xxxx',
    email_notifications: true,
    sms_alerts: false,
  },
  integrations: {
    ndia_api: { name: 'NDIA Claims Gateway', type: 'REST API', endpoint: 'https://gateway.ndis.gov.au/v3', auth: 'mTLS + OAuth2', status: 'connected', direction: 'bidirectional' },
    myob: { name: 'MYOB Accounting', type: 'REST API', endpoint: 'https://api.myob.com/v2', auth: 'OAuth2', status: 'connected', direction: 'inbound' },
    xero: { name: 'Xero Accounting', type: 'REST API', endpoint: 'https://api.xero.com/api.xro/2.0', auth: 'OAuth2', status: 'disconnected', direction: 'inbound' },
    slack: { name: 'Slack Notifications', type: 'Webhook', endpoint: 'https://hooks.slack.com/services/...', auth: 'Token', status: 'connected', direction: 'outbound' },
    teams: { name: 'Microsoft Teams', type: 'Webhook', endpoint: 'https://outlook.office.com/webhook/...', auth: 'Token', status: 'connected', direction: 'outbound' },
    smtp: { name: 'Email (SMTP)', type: 'SMTP', endpoint: 'smtp.gov.au:587', auth: 'STARTTLS', status: 'connected', direction: 'outbound' },
    siem: { name: 'SIEM (Splunk)', type: 'Syslog', endpoint: 'siem.ndis-integrity.gov.au:514', auth: 'TLS', status: 'connected', direction: 'outbound' },
    jira: { name: 'Jira Service Desk', type: 'REST API', endpoint: 'https://ndis-integrity.atlassian.net', auth: 'API Key', status: 'connected', direction: 'bidirectional' },
  }
}

const STATUS_COLORS = { connected: '#0d8a5e', active: '#0d8a5e', disconnected: '#c93b3b', standby: '#e07a1e', error: '#c93b3b' }

export default function SystemSettings() {
  const [tab, setTab] = useState('Data Sources')
  const [config, setConfig] = useState(defaultConfig)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const testConnection = (key) => {
    setTestResult({ key, status: 'testing' })
    setTimeout(() => setTestResult({ key, status: 'success', message: 'Connection successful' }), 1500)
  }

  const toggleStatus = (section, key) => {
    setConfig(prev => {
      const updated = { ...prev }
      const item = { ...updated[section][key] }
      item.status = item.status === 'connected' || item.status === 'active' ? 'disconnected' : 'connected'
      updated[section] = { ...updated[section], [key]: item }
      return updated
    })
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>System Settings</h2>
          <p>Configure data sources, cloud storage, AI models, processing parameters, and integrations</p>
        </div>
        <button className="btn primary" onClick={() => { setSaving(true); setTimeout(() => setSaving(false), 1000) }}>
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>

      <div className="tabs">
        {TABS.map(t => <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</div>)}
      </div>

      {/* DATA SOURCES */}
      {tab === 'Data Sources' && (
        <div>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
            {[['Total Sources', Object.keys(config.dataSources).length, 'info'],
              ['Connected', Object.values(config.dataSources).filter(d => d.status === 'connected').length, 'success'],
              ['Disconnected', Object.values(config.dataSources).filter(d => d.status !== 'connected').length, 'critical'],
              ['Last Sync', 'Just now', 'info'],
            ].map(([l,v,c]) => <div key={l} className="stat-card"><div className="stat-label">{l}</div><div className={`stat-value ${c}`} style={{fontSize:22}}>{v}</div></div>)}
          </div>

          {Object.entries(config.dataSources).map(([key, ds]) => (
            <div key={key} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[ds.status], marginTop: 6, boxShadow: ds.status === 'connected' ? '0 0 6px rgba(13,138,94,0.4)' : 'none' }} />
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>{ds.type?.toUpperCase()}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn sm" onClick={() => testConnection(key)}>{testResult?.key === key && testResult.status === 'testing' ? 'Testing...' : 'Test'}</button>
                  <button className="btn sm" onClick={() => toggleStatus('dataSources', key)}>{ds.status === 'connected' ? 'Disconnect' : 'Connect'}</button>
                  <button className="btn sm" onClick={() => setEditing(editing === key ? null : key)}>Configure</button>
                </div>
              </div>
              {testResult?.key === key && testResult.status === 'success' && (
                <div style={{ marginTop: 8, padding: '6px 12px', background: 'rgba(13,138,94,0.06)', borderRadius: 6, fontSize: 12, color: 'var(--accent-green)', fontWeight: 600 }}>Connection successful</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12 }}>
                {ds.host && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Host</div><div style={{ fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>{ds.host}</div></div>}
                {ds.database && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Database</div><div style={{ fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>{ds.database}</div></div>}
                {ds.endpoint && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Endpoint</div><div style={{ fontSize: 12, fontFamily: 'monospace', marginTop: 2, wordBreak: 'break-all' }}>{ds.endpoint}</div></div>}
                {ds.schema && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Schema</div><div style={{ fontSize: 12, marginTop: 2 }}>{ds.schema}</div></div>}
                {ds.warehouse && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Warehouse</div><div style={{ fontSize: 12, marginTop: 2 }}>{ds.warehouse}</div></div>}
                {ds.catalog && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Catalog</div><div style={{ fontSize: 12, marginTop: 2 }}>{ds.catalog}</div></div>}
                {ds.username && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Username</div><div style={{ fontSize: 12, marginTop: 2 }}>{ds.username}</div></div>}
                {ds.lastSync && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Last Sync</div><div style={{ fontSize: 12, marginTop: 2 }}>{ds.lastSync?.slice(0, 16)}</div></div>}
              </div>
              {editing === key && (
                <div className="fade-in" style={{ marginTop: 16, padding: 16, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group"><label className="form-label">Host / Endpoint</label><input className="form-input" defaultValue={ds.host || ds.endpoint || ''} /></div>
                    <div className="form-group"><label className="form-label">Database / Catalog</label><input className="form-input" defaultValue={ds.database || ds.catalog || ''} /></div>
                    <div className="form-group"><label className="form-label">Username / Auth</label><input className="form-input" defaultValue={ds.username || ds.auth || ''} /></div>
                    <div className="form-group"><label className="form-label">Password / Token</label><input className="form-input" type="password" defaultValue="********" /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="btn primary sm" onClick={() => setEditing(null)}>Save</button>
                    <button className="btn sm" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <button className="btn" style={{ marginTop: 8 }}>+ Add Data Source</button>
        </div>
      )}

      {/* CLOUD STORAGE */}
      {tab === 'Cloud Storage' && (
        <div>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
            {[['Storage Providers', Object.keys(config.cloudStorage).length, 'info'],
              ['Connected', Object.values(config.cloudStorage).filter(d => d.status === 'connected').length, 'success'],
              ['Total Files', Object.values(config.cloudStorage).reduce((s, d) => s + (d.files || 0), 0).toLocaleString(), 'purple'],
              ['Providers', [...new Set(Object.values(config.cloudStorage).map(d => d.provider?.split(' ')[0]))].length, 'info'],
            ].map(([l,v,c]) => <div key={l} className="stat-card"><div className="stat-label">{l}</div><div className={`stat-value ${c}`} style={{fontSize:22}}>{v}</div></div>)}
          </div>

          {Object.entries(config.cloudStorage).map(([key, cs]) => (
            <div key={key} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[cs.status] }} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cs.provider}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn sm" onClick={() => testConnection(key)}>Test</button>
                  <button className="btn sm" onClick={() => toggleStatus('cloudStorage', key)}>{cs.status === 'connected' ? 'Disconnect' : 'Connect'}</button>
                  <button className="btn sm" onClick={() => setEditing(editing === key ? null : key)}>Configure</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 12 }}>
                {cs.bucket && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Bucket</div><div style={{ fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>{cs.bucket}</div></div>}
                {cs.account && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Account</div><div style={{ fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>{cs.account}</div></div>}
                {cs.container && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Container</div><div style={{ fontSize: 12, marginTop: 2 }}>{cs.container}</div></div>}
                {cs.region && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Region</div><div style={{ fontSize: 12, marginTop: 2 }}>{cs.region}</div></div>}
                {cs.prefix && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Prefix</div><div style={{ fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>{cs.prefix}</div></div>}
                <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Files</div><div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>{cs.files?.toLocaleString()}</div></div>
              </div>
              {editing === key && (
                <div className="fade-in" style={{ marginTop: 16, padding: 16, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group"><label className="form-label">Bucket / Account</label><input className="form-input" defaultValue={cs.bucket || cs.account || ''} /></div>
                    <div className="form-group"><label className="form-label">Region</label><input className="form-input" defaultValue={cs.region || ''} /></div>
                    <div className="form-group"><label className="form-label">Access Key / SAS Token</label><input className="form-input" type="password" defaultValue="********" /></div>
                    <div className="form-group"><label className="form-label">Secret Key</label><input className="form-input" type="password" defaultValue="********" /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn primary sm" onClick={() => setEditing(null)}>Save</button><button className="btn sm" onClick={() => setEditing(null)}>Cancel</button></div>
                </div>
              )}
            </div>
          ))}
          <button className="btn" style={{ marginTop: 8 }}>+ Add Storage</button>
        </div>
      )}

      {/* AI MODELS */}
      {tab === 'AI Models' && (
        <div>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
            {[['Total Models', Object.keys(config.aiModels).length, 'info'],
              ['Active', Object.values(config.aiModels).filter(m => m.status === 'active').length, 'success'],
              ['Avg Accuracy', (Object.values(config.aiModels).reduce((s, m) => s + m.accuracy, 0) / Object.keys(config.aiModels).length).toFixed(1) + '%', 'purple'],
              ['Standby', Object.values(config.aiModels).filter(m => m.status === 'standby').length, 'warning'],
            ].map(([l,v,c]) => <div key={l} className="stat-card"><div className="stat-label">{l}</div><div className={`stat-value ${c}`} style={{fontSize:22}}>{v}</div></div>)}
          </div>

          <div className="engine-grid">
            {Object.entries(config.aiModels).map(([key, model]) => (
              <div key={key} className="engine-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{model.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{model.type} &middot; {model.version}</div>
                  </div>
                  <span className="engine-status" style={{ background: model.status === 'active' ? 'rgba(13,138,94,0.12)' : 'rgba(224,122,30,0.12)', color: model.status === 'active' ? 'var(--accent-green)' : 'var(--accent-orange)' }}>{model.status}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <div><div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Accuracy</div><div style={{ fontSize: 18, fontWeight: 800, color: model.accuracy > 92 ? 'var(--accent-green)' : 'var(--accent-orange)' }}>{model.accuracy}%</div></div>
                  <div><div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Features</div><div style={{ fontSize: 18, fontWeight: 800 }}>{model.features}</div></div>
                  <div><div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Trained</div><div style={{ fontSize: 12, marginTop: 4 }}>{model.lastTrained}</div></div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 10 }}>{model.endpoint}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn sm" onClick={() => toggleStatus('aiModels', key)}>{model.status === 'active' ? 'Deactivate' : 'Activate'}</button>
                  <button className="btn sm">Retrain</button>
                  <button className="btn sm">View Metrics</button>
                </div>
              </div>
            ))}
          </div>
          <button className="btn" style={{ marginTop: 16 }}>+ Register Model</button>
        </div>
      )}

      {/* PROCESSING */}
      {tab === 'Processing' && (
        <div>
          <div className="grid-2">
            <div className="card">
              <div className="card-title">Real-Time Processing</div>
              <div className="form-group">
                <label className="form-label">Real-Time Processing</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div onClick={() => setConfig(p => ({...p, processing: {...p.processing, real_time_enabled: !p.processing.real_time_enabled}}))}
                    style={{ width: 44, height: 24, borderRadius: 12, cursor: 'pointer', background: config.processing.real_time_enabled ? 'var(--accent-green)' : 'var(--border)', position: 'relative', transition: 'background 0.2s' }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: config.processing.real_time_enabled ? 22 : 2, transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{config.processing.real_time_enabled ? 'Enabled' : 'Disabled'}</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Batch Interval (minutes)</label>
                <select className="form-input" value={config.processing.batch_interval} onChange={e => setConfig(p => ({...p, processing: {...p.processing, batch_interval: Number(e.target.value)}}))}>
                  {[1, 5, 10, 15, 30, 60].map(m => <option key={m} value={m}>{m} min</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Max Concurrent Jobs</label>
                <input className="form-input" type="number" value={config.processing.max_concurrent_jobs} onChange={e => setConfig(p => ({...p, processing: {...p.processing, max_concurrent_jobs: Number(e.target.value)}}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Max Claims Per Batch</label>
                <input className="form-input" type="number" value={config.processing.max_claims_per_batch} onChange={e => setConfig(p => ({...p, processing: {...p.processing, max_claims_per_batch: Number(e.target.value)}}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Claim Processing Timeout (seconds)</label>
                <input className="form-input" type="number" value={config.processing.claim_processing_timeout} onChange={e => setConfig(p => ({...p, processing: {...p.processing, claim_processing_timeout: Number(e.target.value)}}))} />
              </div>
            </div>

            <div className="card">
              <div className="card-title">Detection Thresholds</div>
              <div className="form-group">
                <label className="form-label">Alert Threshold (0-1)</label>
                <input className="form-input" type="number" step="0.05" value={config.processing.alert_threshold} onChange={e => setConfig(p => ({...p, processing: {...p.processing, alert_threshold: Number(e.target.value)}}))} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Claims scoring above this are flagged as alerts</div>
              </div>
              <div className="form-group">
                <label className="form-label">Auto-Penalty Threshold (0-1)</label>
                <input className="form-input" type="number" step="0.05" value={config.processing.auto_penalty_threshold} onChange={e => setConfig(p => ({...p, processing: {...p.processing, auto_penalty_threshold: Number(e.target.value)}}))} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Claims scoring above this trigger automatic penalty issuance</div>
              </div>
              <div className="form-group">
                <label className="form-label">Data Retention (days)</label>
                <input className="form-input" type="number" value={config.processing.retention_days} onChange={e => setConfig(p => ({...p, processing: {...p.processing, retention_days: Number(e.target.value)}}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Cache TTL (seconds)</label>
                <input className="form-input" type="number" value={config.processing.cache_ttl} onChange={e => setConfig(p => ({...p, processing: {...p.processing, cache_ttl: Number(e.target.value)}}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Parallel Engine Execution</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div onClick={() => setConfig(p => ({...p, processing: {...p.processing, parallel_engines: !p.processing.parallel_engines}}))}
                    style={{ width: 44, height: 24, borderRadius: 12, cursor: 'pointer', background: config.processing.parallel_engines ? 'var(--accent-green)' : 'var(--border)', position: 'relative' }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: config.processing.parallel_engines ? 22 : 2, transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: 13 }}>{config.processing.parallel_engines ? 'Enabled' : 'Disabled'}</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">GPU Acceleration</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div onClick={() => setConfig(p => ({...p, processing: {...p.processing, gpu_acceleration: !p.processing.gpu_acceleration}}))}
                    style={{ width: 44, height: 24, borderRadius: 12, cursor: 'pointer', background: config.processing.gpu_acceleration ? 'var(--accent-green)' : 'var(--border)', position: 'relative' }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: config.processing.gpu_acceleration ? 22 : 2, transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: 13 }}>{config.processing.gpu_acceleration ? 'Enabled' : 'Disabled'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">Notification Settings</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div className="form-group"><label className="form-label">Webhook URL</label><input className="form-input" value={config.processing.webhook_url} onChange={e => setConfig(p => ({...p, processing: {...p.processing, webhook_url: e.target.value}}))} /></div>
              <div className="form-group">
                <label className="form-label">Email Notifications</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                  <div onClick={() => setConfig(p => ({...p, processing: {...p.processing, email_notifications: !p.processing.email_notifications}}))}
                    style={{ width: 44, height: 24, borderRadius: 12, cursor: 'pointer', background: config.processing.email_notifications ? 'var(--accent-green)' : 'var(--border)', position: 'relative' }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: config.processing.email_notifications ? 22 : 2, transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: 13 }}>{config.processing.email_notifications ? 'On' : 'Off'}</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">SMS Alerts</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                  <div onClick={() => setConfig(p => ({...p, processing: {...p.processing, sms_alerts: !p.processing.sms_alerts}}))}
                    style={{ width: 44, height: 24, borderRadius: 12, cursor: 'pointer', background: config.processing.sms_alerts ? 'var(--accent-green)' : 'var(--border)', position: 'relative' }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: config.processing.sms_alerts ? 22 : 2, transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: 13 }}>{config.processing.sms_alerts ? 'On' : 'Off'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INTEGRATIONS */}
      {tab === 'Integrations' && (
        <div>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
            {[['Integrations', Object.keys(config.integrations).length, 'info'],
              ['Connected', Object.values(config.integrations).filter(i => i.status === 'connected').length, 'success'],
              ['Inbound', Object.values(config.integrations).filter(i => i.direction?.includes('inbound')).length, 'info'],
              ['Outbound', Object.values(config.integrations).filter(i => i.direction?.includes('outbound')).length, 'purple'],
            ].map(([l,v,c]) => <div key={l} className="stat-card"><div className="stat-label">{l}</div><div className={`stat-value ${c}`} style={{fontSize:22}}>{v}</div></div>)}
          </div>

          {Object.entries(config.integrations).map(([key, intg]) => (
            <div key={key} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[intg.status] }} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{intg.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{intg.type} &middot; {intg.auth} &middot; {intg.direction}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn sm" onClick={() => testConnection(key)}>Test</button>
                  <button className="btn sm" onClick={() => toggleStatus('integrations', key)}>{intg.status === 'connected' ? 'Disconnect' : 'Connect'}</button>
                  <button className="btn sm" onClick={() => setEditing(editing === key ? null : key)}>Configure</button>
                </div>
              </div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: 8 }}>{intg.endpoint}</div>
              {editing === key && (
                <div className="fade-in" style={{ marginTop: 12, padding: 16, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group"><label className="form-label">Endpoint</label><input className="form-input" defaultValue={intg.endpoint} /></div>
                    <div className="form-group"><label className="form-label">Auth Method</label><input className="form-input" defaultValue={intg.auth} /></div>
                    <div className="form-group"><label className="form-label">API Key / Token</label><input className="form-input" type="password" defaultValue="********" /></div>
                    <div className="form-group"><label className="form-label">Direction</label>
                      <select className="form-input" defaultValue={intg.direction}><option>inbound</option><option>outbound</option><option>bidirectional</option></select></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn primary sm" onClick={() => setEditing(null)}>Save</button><button className="btn sm" onClick={() => setEditing(null)}>Cancel</button></div>
                </div>
              )}
            </div>
          ))}
          <button className="btn" style={{ marginTop: 8 }}>+ Add Integration</button>
        </div>
      )}
    </div>
  )
}
