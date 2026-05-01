import { useState, useEffect } from 'react'

const BASE = '/api'

function getToken() {
  return localStorage.getItem('ndis_token')
}

function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function useApi(endpoint, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`${BASE}${endpoint}`, { headers: authHeaders() })
      .then(res => {
        if (res.status === 401) {
          localStorage.removeItem('ndis_token')
          window.location.reload()
          return null
        }
        return res.json()
      })
      .then(d => {
        if (!cancelled && d) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(e => {
        if (!cancelled) {
          setError(e.message)
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, deps)

  return { data, loading, error }
}

export async function fetchApi(endpoint, options = {}) {
  const res = await fetch(`${BASE}${endpoint}`, {
    ...options,
    headers: { ...authHeaders(), 'Content-Type': 'application/json', ...options.headers },
  })
  if (res.status === 401) {
    localStorage.removeItem('ndis_token')
    window.location.reload()
    return null
  }
  return res.json()
}

export async function login(username, password) {
  const formData = new URLSearchParams()
  formData.append('username', username)
  formData.append('password', password)
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Login failed')
  }
  const data = await res.json()
  localStorage.setItem('ndis_token', data.access_token)
  return data
}

export function logout() {
  localStorage.removeItem('ndis_token')
  window.location.reload()
}

export function isLoggedIn() {
  return !!localStorage.getItem('ndis_token')
}
