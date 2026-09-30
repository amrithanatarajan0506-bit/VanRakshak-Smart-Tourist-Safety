/**
 * VanRakshak WebSocket Client
 * Connects to the configured backend WebSocket endpoint.
 * Handles reconnection with exponential backoff.
 */

const configuredUrl = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || 'http://localhost:8000'
export const WS_BASE_URL = configuredUrl.replace(/^http/i, 'ws').replace(/\/$/, '')
const MAX_RETRIES = 10
const BASE_DELAY_MS = 1000

let socket = null
let retryCount = 0
let retryTimer = null
const handlers = new Map()  // messageType → Set<handler>

export function connectWS(role = '_all') {
  if (socket && socket.readyState === WebSocket.OPEN) return

  const url = `${WS_BASE_URL}/ws/incidents?role=${role}`
  socket = new WebSocket(url)

  socket.onopen = () => {
    console.log('[VR-WS] Connected')
    retryCount = 0
    _emit('_connected', {})
  }

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      _emit(msg.type, msg)
      _emit('_any', msg)  // wildcard handler
    } catch (e) {
      console.error('[VR-WS] Parse error', e)
    }
  }

  socket.onclose = () => {
    console.warn('[VR-WS] Disconnected — retrying...')
    _emit('_disconnected', {})
    _scheduleRetry(role)
  }

  socket.onerror = (err) => {
    console.error('[VR-WS] Error', err)
  }
}

export function disconnectWS() {
  if (retryTimer) clearTimeout(retryTimer)
  if (socket) { socket.close(); socket = null }
}

export function onWS(messageType, handler) {
  if (!handlers.has(messageType)) handlers.set(messageType, new Set())
  handlers.get(messageType).add(handler)
  return () => handlers.get(messageType)?.delete(handler)  // returns unsubscribe fn
}

export function sendWS(data) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data))
  }
}

function _emit(type, data) {
  handlers.get(type)?.forEach(fn => fn(data))
}

function _scheduleRetry(role) {
  if (retryCount >= MAX_RETRIES) { console.error('[VR-WS] Max retries reached'); return }
  const delay = BASE_DELAY_MS * Math.pow(2, retryCount)
  retryCount++
  retryTimer = setTimeout(() => connectWS(role), delay)
}
