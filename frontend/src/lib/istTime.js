import { useEffect, useState } from 'react'

/**
 * Indian Standard Time helpers.
 * Uses the Asia/Kolkata time-zone via Intl, so the result is correct no matter
 * what time-zone the device is set to (no manual +5:30 maths).
 */
const IST_TZ = 'Asia/Kolkata'

const parts = (date) => {
  const p = {}
  new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TZ, hour12: true,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).forEach(x => { p[x.type] = x.value })
  return p
}

/** "02:32:05 PM" */
export const formatISTTime = (date = new Date()) => {
  const p = parts(date)
  return `${p.hour}:${p.minute}:${p.second} ${p.dayPeriod.toUpperCase()}`
}

/** "2026-09-29 02:32:05 PM IST" */
export const formatISTDateTime = (date = new Date()) => {
  const p = parts(date)
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.dayPeriod.toUpperCase()} IST`
}

/** Server timestamps are naive UTC ("2026-09-29T09:00:00") — treat them as UTC. */
export const parseServerDate = (iso) => {
  if (!iso) return null
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)
  return new Date(hasZone ? iso : iso + 'Z')
}

/** Ticks every second and returns the current Date — drives live clocks. */
export function useLiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}
