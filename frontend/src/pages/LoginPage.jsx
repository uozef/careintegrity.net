import { useState } from 'react'
import { login } from '../hooks/useApi'
import { useTheme } from '../App'

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { theme, toggleTheme } = useTheme()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      onLogin()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg-grid" />
      <div className="login-card">
        <div className="login-logo">
          <div style={{ fontSize: 40, marginBottom: 8 }}>&#x1F6E1;</div>
          <h1>CareIntegrity.AI</h1>
          <p>NDIS Network Integrity & Fraud Intelligence Platform</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              className="form-input"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="login-hint">
          Default credentials: admin / NDISAdmin2025!
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="theme-toggle" onClick={toggleTheme} style={{ margin: '0 auto' }}>
            {theme === 'dark' ? '\u2600 Light Mode' : '\u263D Dark Mode'}
          </button>
        </div>
      </div>
    </div>
  )
}
