import { useState, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Circle, useMap } from 'react-leaflet'
import { geocodeDestination, getWalkingRoutes } from '../lib/openStreetMap'
import { useLanguage } from '../lib/languageContext'
import 'leaflet/dist/leaflet.css'

const MODES = [
  { id: 'driving', label: 'route.drive', icon: 'directions_car', osrm: 'driving' },
  { id: 'walking', label: 'route.walk', icon: 'directions_walk', osrm: 'foot' },
  { id: 'cycling', label: 'route.cycle', icon: 'directions_bike', osrm: 'bike' },
  { id: 'transit', label: 'route.transit', icon: 'directions_transit', osrm: null },
]
const MAX_STOPS = 9
const km = (a, b) => { const r = x => x * Math.PI / 180, dLa = r(b[0]-a[0]), dLo = r(b[1]-a[1])
  const h = Math.sin(dLa/2)**2 + Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dLo/2)**2; return 12742*Math.asin(Math.sqrt(h)) }

function Fit({ pts }) { const map = useMap(); if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30] }); return null }

function stepText(s, t) {
  const distance = s.distanceM ?? s.distance
  const suffix = distance ? `, ${t('route.for')} ${Math.round(distance)} ${t('route.metres')}` : ''
  if (s.instruction) return `${s.instruction}${suffix}`
  const maneuver = s.maneuver || {}
  const modifierKeys = { left: 'left', right: 'right', straight: 'straight', 'slight left': 'slightLeft', 'slight right': 'slightRight', 'sharp left': 'sharpLeft', 'sharp right': 'sharpRight', uturn: 'uturn' }
  const actionKeys = { arrive: 'arrive', depart: 'start', turn: 'turn', continue: 'continue', merge: 'merge', roundabout: 'enterRoundabout', 'exit roundabout': 'exitRoundabout', 'new name': 'continue' }
  const action = t(`route.${actionKeys[maneuver.type] || 'continue'}`)
  const direction = maneuver.modifier ? ` ${t(`route.${modifierKeys[maneuver.modifier] || 'straight'}`)}` : ''
  const road = s.name ? `${t('route.onto') ? ` ${t('route.onto')}` : ''} ${s.name}` : ''
  return `${action}${direction}${maneuver.type === 'arrive' ? '' : road}${suffix}`
}

export default function RoutePlanner({ zones = [] }) {
  const { language, locale, t } = useLanguage()
  const [mode, setMode] = useState('walking')
  const [start, setStart] = useState('')
  const [stops, setStops] = useState([''])
  const [voice, setVoice] = useState(true)
  const [route, setRoute] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [idx, setIdx] = useState(0)
  const pts = useRef([])

  const say = text => { if (voice && 'speechSynthesis' in window) { speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = locale; speechSynthesis.speak(utterance) } }
  const setStop = (i, v) => setStops(s => s.map((x, j) => j === i ? v : x))

  const go = async () => {
    setErr(''); setRoute(null); setBusy(true)
    try {
      const names = [start.trim(), ...stops].filter((x, i) => i === 0 ? true : x.trim())
      if (names.length < 2) throw new Error('Add at least one destination.')
      const m = MODES.find(x => x.id === mode)
      let origin
      if (!names[0]) {
        const position = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, () => rej(new Error('Enter a start point or allow GPS.'))))
        origin = { lat: position.coords.latitude, lng: position.coords.longitude, name: 'My location' }
      } else {
        const matches = await geocodeDestination(names[0])
        if (!matches.length) throw new Error(`Place not found: ${names[0]}`)
        origin = matches[0]
      }
      pts.current = [[origin.lat, origin.lng]]
      let previous = origin
      const destinations = []
      for (const name of names.slice(1)) {
        const matches = await geocodeDestination(name, previous)
        if (!matches.length) throw new Error(`Place not found: ${name}`)
        previous = matches[0]
        destinations.push(previous)
        pts.current.push([previous.lat, previous.lng])
      }
      if (mode === 'transit' || mode === 'cycling') {
        window.open(gmaps(mode, pts.current), '_blank', 'noopener,noreferrer')
        return
      }

      let line = []
      let steps = []
      let dist = 0
      let dur = 0
      if (mode === 'walking') {
        let from = origin
        for (const destination of destinations) {
          const segments = await getWalkingRoutes(from, destination, language)
          const segment = segments[0]
          line = line.concat(line.length ? segment.coordinates.slice(1) : segment.coordinates)
          steps = steps.concat(segment.steps)
          dist += segment.distanceM
          dur += segment.durationSec
          from = destination
        }
      } else {
        const coords = pts.current.map(([lat, lng]) => `${lng},${lat}`).join(';')
        const response = await fetch(`https://router.project-osrm.org/route/v1/${m.osrm}/${coords}?overview=full&geometries=geojson&steps=true`)
        const data = await response.json()
        if (!response.ok || data.code !== 'Ok' || !data.routes?.[0]) throw new Error('No driving route was found for these places.')
        const result = data.routes[0]
        line = result.geometry.coordinates.map(([lng, lat]) => [lat, lng])
        steps = result.legs.flatMap(leg => leg.steps)
        dist = result.distance
        dur = result.duration
      }
      const hits = zones.filter(z => { const [lo, la] = z.geometry?.coordinates || []; return la != null && line.some(p => km(p, [la, lo]) * 1000 < (z.properties.radius_m || 250)) })
      setRoute({ line, steps, dist, dur, hits }); setIdx(0)
      say(hits.length ? `${t('route.hazardWarning')}: ${hits.map(hit => hit.properties.name).join(', ')}` : stepText(steps[0], t))
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const gmaps = (md, p) => `https://www.google.com/maps/dir/?api=1&travelmode=${md}&origin=${p[0][0]},${p[0][1]}&destination=${p[p.length-1][0]},${p[p.length-1][1]}${p.length > 2 ? `&waypoints=${p.slice(1,-1).map(point => `${point[0]},${point[1]}`).join('|')}` : ''}`
  const shareLoc = () => navigator.geolocation.getCurrentPosition(p => {
    const url = `https://maps.google.com/?q=${p.coords.latitude},${p.coords.longitude}`
    navigator.share ? navigator.share({ title: 'My live location', url }) : navigator.clipboard.writeText(url).then(() => alert('Location link copied'))
  })

  return (
    <div className="bg-surface hairline-border rounded p-md shadow-sm space-y-sm">
      <h3 className="font-label-caps text-label-caps text-tertiary flex items-center gap-1 hairline-border-b pb-sm">
        <span className="material-symbols-outlined text-sm">navigation</span>{t('route.title')}
      </h3>
      <div className="flex gap-1">
        {MODES.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} className={`flex-1 py-1.5 rounded text-xs font-label-caps flex items-center justify-center gap-1 ${mode === m.id ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
            <span className="material-symbols-outlined text-sm">{m.icon}</span>{t(m.label)}
          </button>))}
      </div>
      <input className="field-input w-full" placeholder={t('route.startGps')} value={start} onChange={e => setStart(e.target.value)} />
      {stops.map((s, i) => (
        <div key={i} className="flex gap-1">
          <input className="field-input flex-1" placeholder={i === stops.length - 1 ? t('map.destination') : `${t('route.stop')} ${i + 1}`} value={s} onChange={e => setStop(i, e.target.value)} />
          {stops.length > 1 && <button onClick={() => setStops(x => x.filter((_, j) => j !== i))} className="px-2 text-error" aria-label={t('route.removeStop')}>✕</button>}
        </div>))}
      <div className="flex gap-2 flex-wrap items-center">
        <button disabled={stops.length >= MAX_STOPS} onClick={() => setStops(s => [...s, ''])} className="btn-ghost text-xs">+ {t('route.addStop')} ({stops.length}/{MAX_STOPS})</button>
        <label className="text-xs font-data-mono flex items-center gap-1"><input type="checkbox" checked={voice} onChange={e => setVoice(e.target.checked)} />{t('route.voice')}</label>
      </div>
      <button onClick={go} disabled={busy} className="btn-primary w-full flex items-center justify-center gap-1">
        <span className="material-symbols-outlined text-sm">route</span>{busy ? t('map.routing') : mode === 'transit' ? t('route.openTransit') : t('route.getDirections')}
      </button>
      {err && <p className="text-error text-xs font-data-mono">{err}</p>}
      {route && (<>
        <div className="font-data-mono text-xs text-on-surface">{(route.dist / 1000).toFixed(1)} km · {Math.round(route.dur / 60)} min</div>
        {route.hits.length > 0 && <div className="p-2 rounded bg-error/10 text-error text-xs font-data-mono">⚠ {t('route.hazardWarning')}: {route.hits.map(h => h.properties.name).join('; ')}</div>}
        <div className="h-56 rounded overflow-hidden hairline-border">
          <MapContainer center={route.line[0]} zoom={12} className="h-full w-full">
            <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
            <Polyline positions={route.line} color="#2e7d32" weight={5} />
            {pts.current.map((p, i) => <Marker key={i} position={p} />)}
            {zones.map(z => z.geometry?.coordinates && <Circle key={z.id} center={[z.geometry.coordinates[1], z.geometry.coordinates[0]]} radius={z.properties.radius_m || 250} pathOptions={{ color: '#ba1a1a' }} />)}
            <Fit pts={route.line} />
          </MapContainer>
        </div>
        <ol className="max-h-40 overflow-auto text-xs font-data-mono space-y-1">
          {route.steps.map((s, i) => (
            <li key={i} onClick={() => { setIdx(i); say(stepText(s, t)) }} className={`cursor-pointer p-1 rounded ${i === idx ? 'bg-primary/15' : ''}`}>{i + 1}. {stepText(s, t)}</li>))}
        </ol>
        <div className="flex gap-2">
          <button className="btn-ghost text-xs flex-1" onClick={() => { const n = Math.min(idx + 1, route.steps.length - 1); setIdx(n); say(stepText(route.steps[n], t)) }}>{t('route.nextStep')} ▶</button>
        </div>
      </>)}
      <div className="flex gap-2 flex-wrap pt-1 hairline-border-t">
        <button onClick={shareLoc} className="btn-ghost text-xs flex items-center gap-1"><span className="material-symbols-outlined text-sm">share_location</span>{t('route.shareLocation')}</button>
        <a target="_blank" rel="noreferrer" href="https://www.google.com/maps" className="btn-ghost text-xs flex items-center gap-1"><span className="material-symbols-outlined text-sm">streetview</span>{t('route.streetView')}</a>
      </div>
    </div>
  )
}
