import { create } from 'zustand'
import api from '../lib/api'

const savedToken = localStorage.getItem('vr_access_token')
const savedRole  = localStorage.getItem('vr_role')

// Profile (name / email / phone) saved at login so it survives a page refresh
let savedProfile = {}
try { savedProfile = JSON.parse(localStorage.getItem('vr_user') || '{}') } catch { savedProfile = {} }
const saveProfile = (u) => {
  try { localStorage.setItem('vr_user', JSON.stringify(u)) } catch { /* ignore */ }
}

const profileFrom = (data) => {
  const u = {
    id: data.user_id,
    role: data.role,
    full_name: data.full_name || null,
    email: data.email || null,
    phone: data.phone || null,
    tourist_type: data.tourist_type || null,
    verification_status: data.verification_status || null,
    dtid_code: data.dtid_code || null,
  }
  saveProfile(u)
  return u
}

const useAuthStore = create((set, get) => ({
  user: savedToken ? { ...savedProfile, role: savedRole } : null,
  token: savedToken,
  role: savedRole,
  isAuthenticated: !!savedToken,
  loading: false,
  error: null,

  setAuth: (token, user) => {
    localStorage.setItem('vr_access_token', token)
    if (user?.role) localStorage.setItem('vr_role', user.role)
    set({
      token,
      role: user?.role || 'tourist',
      user,
      isAuthenticated: true,
    })
  },

  login: async (identifier, password) => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.post('/auth/login', { identifier, password })
      localStorage.setItem('vr_access_token', data.access_token)
      localStorage.setItem('vr_refresh_token', data.refresh_token)
      if (data.role) localStorage.setItem('vr_role', data.role)
      if (data.ranger_id) {
        localStorage.setItem('vr_ranger_id', data.ranger_id)
      }
      set({
        token: data.access_token,
        role: data.role,
        isAuthenticated: true,
        loading: false,
        user: profileFrom(data),
      })
      return data
    } catch (err) {
      set({ error: err.response?.data?.detail || 'Login failed', loading: false })
      throw err
    }
  },

  /** Ranger / Admin — shared username + password, console chosen on the login screen. */
  staffLogin: async (username, password, role) => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.post('/auth/staff-login', { username, password, role })
      get()._startSession(data)
      return data
    } catch (err) {
      set({ error: err.response?.data?.detail || 'Login failed', loading: false })
      throw err
    }
  },

  /** Tourist entry with typed identity details; the server stores only a salted hash. */
  touristEnter: async (form) => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.post('/auth/tourist-entry', form)
      get()._startSession(data)
      return data
    } catch (err) {
      set({ error: err.response?.data?.detail || 'Could not continue', loading: false })
      throw err
    }
  },

  _startSession: (data) => {
    localStorage.setItem('vr_access_token', data.access_token)
    localStorage.setItem('vr_refresh_token', data.refresh_token)
    if (data.role) localStorage.setItem('vr_role', data.role)
    if (data.ranger_id) localStorage.setItem('vr_ranger_id', data.ranger_id)
    set({
      token: data.access_token,
      role: data.role,
      isAuthenticated: true,
      loading: false,
      user: profileFrom(data),
    })
  },

  register: async (payload) => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.post('/auth/register', payload)
      set({ loading: false })
      return data
    } catch (err) {
      set({ error: err.response?.data?.detail || 'Registration failed', loading: false })
      throw err
    }
  },

  verifyOTP: async (identifier, otp) => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.post('/auth/verify-otp', { identifier, otp })
      localStorage.setItem('vr_access_token', data.access_token)
      localStorage.setItem('vr_refresh_token', data.refresh_token)
      if (data.role) localStorage.setItem('vr_role', data.role)
      if (data.ranger_id) {
        localStorage.setItem('vr_ranger_id', data.ranger_id)
      }
      set({
        token: data.access_token,
        role: data.role,
        isAuthenticated: true,
        loading: false,
        user: profileFrom(data),
      })
      return data
    } catch (err) {
      set({ error: err.response?.data?.detail || 'OTP verification failed', loading: false })
      throw err
    }
  },

  fetchMe: async () => {
    try {
      const { data } = await api.get('/auth/me')
      if (data.role) localStorage.setItem('vr_role', data.role)
      saveProfile({
        id: data.id,
        role: data.role,
        full_name: data.full_name,
        email: data.email,
        phone: data.phone,
        dtid_code: data.dtid_code || null,
      })
      set({ user: data, role: data.role, isAuthenticated: true })
    } catch (err) {
      if (err.response?.status === 401) get().logout()
    }
  },

  logout: () => {
    localStorage.removeItem('vr_access_token')
    localStorage.removeItem('vr_refresh_token')
    localStorage.removeItem('vr_ranger_id')
    localStorage.removeItem('vr_role')
    localStorage.removeItem('vr_user')
    set({ user: null, token: null, role: null, isAuthenticated: false })
  },

  clearError: () => set({ error: null }),
}))

export default useAuthStore
