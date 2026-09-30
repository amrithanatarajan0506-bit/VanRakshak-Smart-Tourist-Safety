import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, Tooltip, LayerGroup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../../lib/api'
import useAuthStore from '../../store/authStore'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import VoiceEmergencyMonitor from '../../components/VoiceEmergencyMonitor'
import { useLanguage } from '../../lib/languageContext'
import { formatISTTime, formatISTDateTime, useLiveClock } from '../../lib/istTime'

/** Self-ticking clock — only this tiny component re-renders each second, not the whole map. */
function LiveTime() {
  const now = useLiveClock()
  return <>{formatISTTime(now)}</>
}
import { calculateTouristSpeed, calculateBearingDeg, projectDeadReckoningKinematics } from '../../lib/deadReckoning'
import { geocodeDestination, getWalkingRoutes } from '../../lib/openStreetMap'
import { SURVEYED_TRAILS } from '../../lib/trailsData'

// Fix default Leaflet icon paths
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Basemap Providers
const BASEMAPS = {
  topo: {
    name: 'Topographic',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenTopoMap contributors',
    maxZoom: 17,
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri World Imagery',
    maxZoom: 19,
  },
  osm: {
    name: 'Street / OSM',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  },
}

// Custom Marker Icons
const createSvgIcon = (iconName, bgHex, borderHex = '#FFFFFF', size = 34) =>
  L.divIcon({
    className: 'custom-map-icon',
    html: `
      <div style="
        width: ${size}px; height: ${size}px; border-radius: 50%;
        background: ${bgHex}; border: 2px solid ${borderHex};
        box-shadow: 0 4px 10px rgba(0,0,0,0.35);
        display: flex; align-items: center; justify-content: center;
        color: white; font-family: 'Material Symbols Outlined'; font-size: ${Math.round(size * 0.55)}px;
      ">
        ${iconName}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  })

const TOURIST_ICON = createSvgIcon('my_location', '#FF9933', '#FFFFFF', 36)
const DISTRESS_TOURIST_ICON = createSvgIcon('sos', '#BA1A1A', '#FFFFFF', 38)
const RESTRICTED_ZONE_ICON = createSvgIcon('do_not_disturb_on', '#7E22CE', '#FFFFFF', 30)
const DEAD_RECKONING_ICON = createSvgIcon('radar', '#9333EA', '#FFFFFF', 36)
const LAST_FIX_ICON = createSvgIcon('location_off', '#EAB308', '#FFFFFF', 32)
const END_DESTINATION_ICON = createSvgIcon('sports_score', '#000080', '#FF9933', 38)
const START_TRAILHEAD_ICON = createSvgIcon('flag', '#138808', '#FFFFFF', 36)
const DEMO_TOURIST_ICON = createSvgIcon('hiking', '#087E8B', '#FFFFFF', 32)
const TRACKED_TOURIST_ICON = createSvgIcon('person_pin_circle', '#006B5F', '#FFFFFF', 34)

const DEMO_PLACE = {
  id: 'demo-ooty',
  name: 'Ooty Demo Place',
  lat: 11.4102,
  lng: 76.695,
  areas: [
    {
      id: 'low-risk', name: 'Visitor area', zoneLabel: 'LOW RISK', radiusM: 350,
      lat: 11.4102, lng: 76.695, color: '#138808',
    },
    {
      id: 'restricted', name: 'Restricted area', zoneLabel: 'RESTRICTED', radiusM: 300,
      lat: 11.4142, lng: 76.701, color: '#EF8B20',
    },
    {
      id: 'prohibited', name: 'Prohibited area', zoneLabel: 'PROHIBITED', radiusM: 250,
      lat: 11.4057, lng: 76.7025, color: '#BA1A1A',
    },
  ],
}

const RANGER_ICONS = {
  ranger: createSvgIcon('shield_person', '#138808', '#FFFFFF', 34),
  medic:  createSvgIcon('medical_services', '#BA1A1A', '#FFFFFF', 34),
  police: createSvgIcon('local_police', '#000080', '#FFFFFF', 34),
  drone:  createSvgIcon('flight', '#494741', '#FFFFFF', 34),
}

// Distance helper
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function readLastSessionGpsFix() {
  try {
    const fix = JSON.parse(sessionStorage.getItem('vr_last_gps_fix') || 'null')
    if (Number.isFinite(fix?.lat) && Number.isFinite(fix?.lng) && Number.isFinite(fix?.timestampMs)) {
      return fix
    }
  } catch (_) {}
  return null
}

function MapController({ centerPos, bounds, zoomLevel = 15 }) {
  const map = useMap()
  useEffect(() => {
    if (centerPos && Array.isArray(centerPos) && centerPos.length === 2 && !isNaN(centerPos[0])) {
      map.flyTo(centerPos, zoomLevel, { duration: 1.5 })
    } else if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15, duration: 1.2 })
    }
  }, [centerPos, bounds, zoomLevel, map])
  return null
}

export default function LiveSafetyMap() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { language, t } = useLanguage()

  // URL Target Parameters
  const targetLatParam = searchParams.get('lat') ? parseFloat(searchParams.get('lat')) : null
  const targetLngParam = searchParams.get('lng') ? parseFloat(searchParams.get('lng')) : null
  const targetName = searchParams.get('name') || ''
  const targetPhone = searchParams.get('phone') || ''
  const targetType = searchParams.get('type') || ''
  const targetIst = searchParams.get('ist') || ''
  const targetDtidParam = searchParams.get('dtid') || ''
  const targetTouristIdParam = searchParams.get('tourist_id') || ''
  const incidentIdParam = searchParams.get('incident_id') || ''

  // State: Data
  const [rangers, setRangers] = useState([])
  const [activeIncidents, setActiveIncidents] = useState([])
  const [touristLocations, setTouristLocations] = useState([])
  const [touristTrack, setTouristTrack] = useState([])
  const [hazardZones, setHazardZones] = useState([])
  const hazardZonesRef = useRef([])
  const [destinationInput, setDestinationInput] = useState(searchParams.get('destination') || '')
  const [destinationChoices, setDestinationChoices] = useState([])
  const [destination, setDestination] = useState(null)
  const [routeCoordinates, setRouteCoordinates] = useState([])
  const [routeSteps, setRouteSteps] = useState([])
  const [nextRouteStepIndex, setNextRouteStepIndex] = useState(0)
  const [routeDistanceM, setRouteDistanceM] = useState(null)
  const [routeDurationSec, setRouteDurationSec] = useState(null)
  const [routeStatus, setRouteStatus] = useState('')
  const [isRouting, setIsRouting] = useState(false)
  const [networkStatus, setNetworkStatus] = useState('Reading device network…')
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [basemapUnavailable, setBasemapUnavailable] = useState(false)
  const lastRouteRerouteAtRef = useRef(0)
  
  // Real-time Device GPS Position State
  const [touristPos, setTouristPos] = useState(() => {
    const lastFix = readLastSessionGpsFix()
    if (targetLatParam != null && targetLngParam != null) {
      return { lat: targetLatParam, lng: targetLngParam, accuracy: null, isRealGps: false, isLastKnown: false, timestampMs: Date.now() }
    }
    if (lastFix) return { ...lastFix, isRealGps: false, isLastKnown: true }
    return { lat: null, lng: null, accuracy: null, isRealGps: false, isLastKnown: false, timestampMs: Date.now() }
  })
  const lastGpsFixRef = useRef(readLastSessionGpsFix())
  const reportedZoneIdsRef = useRef(new Set())
  const [calculatedWalkSpeed, setCalculatedWalkSpeed] = useState({ speedMs: 0, speedKmh: 0 })
  const [isLocating, setIsLocating] = useState(false)
  const [gpsStatusMsg, setGpsStatusMsg] = useState('')
  const [locationSharingStatus, setLocationSharingStatus] = useState('Waiting for GPS fix')
  const lastLocationSyncAtRef = useRef(0)
  const lastLocationSyncFixRef = useRef(null)

  // ── DEAD RECKONING STATE (Signal Loss & Kinematic Projection) ──
  const [isDeadReckoningActive, setIsDeadReckoningActive] = useState(false)
  const [deadReckoningState, setDeadReckoningState] = useState(null)
  const [drAutoShared, setDrAutoShared] = useState(false)

  // Geofence Breach Alert State
  const [breachAlert, setBreachAlert] = useState(null)

  // Selected Distressed Tourist for Ranger Tracking
  const [trackedTourist, setTrackedTourist] = useState(
    targetLatParam != null && targetLngParam != null ? {
      lat: targetLatParam,
      lng: targetLngParam,
      name: targetName,
      phone: targetPhone,
      type: targetType,
      ist: targetIst,
      dtid: targetDtidParam,
      touristId: targetTouristIdParam,
      id: incidentIdParam,
    } : null
  )

  // Predefined places (Kasauli, Dzukou, Goechala, David Scott) — optional ?trail=<id> deep link
  const trailParam = searchParams.get('trail')
  const [selectedTrail, setSelectedTrail] = useState(
    SURVEYED_TRAILS.find(t => t.id === trailParam || t.slug === trailParam) || null
  )

  // Layers & Basemap
  const [activeBasemap, setActiveBasemap] = useState('osm')
  const [showRestrictedZones, setShowRestrictedZones] = useState(true)
  const [showDemoTourists, setShowDemoTourists] = useState(true)
  const [showRangers, setShowRangers] = useState(true)
  const [showSafeRoute, setShowSafeRoute] = useState(true)

  // Telemetry
  const [battery, setBattery] = useState(null)
  const [flyToTarget, setFlyToTarget] = useState(
    targetLatParam != null && targetLngParam != null
      ? [targetLatParam, targetLngParam]
      : readLastSessionGpsFix()
        ? [readLastSessionGpsFix().lat, readLastSessionGpsFix().lng]
        : null
  )
  const [mapBounds, setMapBounds] = useState([[DEMO_PLACE.lat, DEMO_PLACE.lng]])

  // Select / deselect one of the 4 predefined places
  const handleSelectTrail = (trail) => {
    if (selectedTrail?.id === trail.id) {
      setSelectedTrail(null)
      return
    }
    setSelectedTrail(trail)
    setTrackedTourist(null)
    setFlyToTarget(null)
    setMapBounds(trail.routePath)
  }

  // Fetch API data on load
  const fetchData = useCallback(async () => {
    try {
      const locationsRequest = ['rescue_team', 'control_room'].includes(user?.role)
        ? api.get('/auth/tourists')
        : Promise.resolve({ data: [] })
      const [rRes, iRes, zRes, touristsRes] = await Promise.allSettled([
        api.get('/rangers'),
        api.get('/incidents'),
        api.get('/danger-zones'),
        locationsRequest,
      ])
      
      if (rRes.status === 'fulfilled' && Array.isArray(rRes.value.data)) {
        setRangers(rRes.value.data)
      }
      if (iRes.status === 'fulfilled' && Array.isArray(iRes.value.data)) {
        setActiveIncidents(iRes.value.data.filter(i => i.status !== 'RESOLVED'))
      }
      if (zRes.status === 'fulfilled') {
        setHazardZones(zRes.value.data?.features || [])
      }
      if (touristsRes.status === 'fulfilled' && Array.isArray(touristsRes.value.data)) {
        setTouristLocations(touristsRes.value.data)
      }
    } catch (_) {}
  }, [user?.role])

  useEffect(() => {
    hazardZonesRef.current = hazardZones
  }, [hazardZones])

  useEffect(() => {
    if (!targetDtidParam) return
    const visitor = touristLocations.find(item => (
      (targetTouristIdParam && item.id === targetTouristIdParam)
      || (targetDtidParam && item.dtid_code === targetDtidParam)
    ))
    if (!visitor || !Number.isFinite(visitor.lat) || !Number.isFinite(visitor.lng)) return
    setTrackedTourist(previous => {
      if (previous?.lat === visitor.lat && previous?.lng === visitor.lng) return previous
      return {
        ...previous,
        lat: visitor.lat,
        lng: visitor.lng,
        name: visitor.full_name,
        phone: visitor.phone,
        dtid: visitor.dtid_code,
        touristId: visitor.id,
      }
    })
    setFlyToTarget(previous => (
      previous?.[0] === visitor.lat && previous?.[1] === visitor.lng
        ? previous
        : [visitor.lat, visitor.lng]
    ))
  }, [targetDtidParam, targetTouristIdParam, touristLocations])

  const trackedLocationTarget = touristLocations.find(item => (
    (targetTouristIdParam && item.id === targetTouristIdParam)
    || (targetDtidParam && item.dtid_code === targetDtidParam)
  ))

  useEffect(() => {
    if (!['rescue_team', 'control_room'].includes(user?.role) || !trackedLocationTarget?.id) {
      setTouristTrack([])
      return undefined
    }
    let active = true
    const loadTrack = async () => {
      try {
        const { data } = await api.get(`/auth/tourists/${encodeURIComponent(trackedLocationTarget.id)}/track`)
        if (active) setTouristTrack(Array.isArray(data) ? data : [])
      } catch {
        if (active) setTouristTrack([])
      }
    }
    loadTrack()
    const intervalId = setInterval(loadTrack, 5000)
    return () => {
      active = false
      clearInterval(intervalId)
    }
  }, [trackedLocationTarget?.id, user?.role])

  useEffect(() => {
    if (!touristPos.isRealGps || !routeSteps.length) return
    const reachedIndex = routeSteps.findIndex((step, index) => (
      index >= nextRouteStepIndex && step.location
        && getDistanceMeters(touristPos.lat, touristPos.lng, step.location[0], step.location[1]) <= 25
    ))
    if (reachedIndex >= 0) setNextRouteStepIndex(reachedIndex + 1)
  }, [touristPos.isRealGps, touristPos.lat, touristPos.lng, routeSteps, nextRouteStepIndex])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 10000)
    return () => clearInterval(id)
  }, [fetchData])

  const handleDestinationSearch = async event => {
    event.preventDefault()
    if (!destinationInput.trim()) return
    if (!isOnline) {
      setRouteStatus('Destination search needs internet. Your offline GPS location is still shown on the map.')
      return
    }
    setRouteStatus('Searching OpenStreetMap…')
    setDestinationChoices([])
    try {
      const choices = await geocodeDestination(
        destinationInput.trim(),
        touristPos.isRealGps ? touristPos : null
      )
      setDestinationChoices(choices)
      setRouteStatus(choices.length ? 'Choose the matching destination.' : 'No matching places were found.')
    } catch (error) {
      setRouteStatus(error.message)
    }
  }

  useEffect(() => {
    const query = searchParams.get('destination')
    if (!query) return undefined
    setDestinationInput(query)
    let active = true
    geocodeDestination(query, null)
      .then(choices => {
        if (active) {
          setDestinationChoices(choices)
          setRouteStatus(choices.length ? 'Choose the matching destination.' : 'No matching places were found.')
        }
      })
      .catch(error => {
        if (active) setRouteStatus(error.message)
      })
    return () => { active = false }
  }, [searchParams])

  const handleChooseDestination = useCallback(async place => {
    setDestination(place)
    setDestinationChoices([])
    if (!touristPos.isRealGps) {
      setRouteStatus(isOnline
        ? 'Waiting for a current GPS fix before calculating your route.'
        : 'Route calculation needs internet and a current GPS fix.')
      return
    }
    if (!isOnline) {
      setRouteStatus('Route calculation needs internet. Your saved destination and GPS position remain visible.')
      return
    }
    lastRouteRerouteAtRef.current = Date.now()
    setIsRouting(true)
    setRouteCoordinates([])
    setRouteSteps([])
    setNextRouteStepIndex(0)
    setRouteDistanceM(null)
    setRouteDurationSec(null)
    setRouteStatus('Calculating walking routes…')
    try {
      const candidates = await getWalkingRoutes(touristPos, place, language)
      const checked = await Promise.all(candidates.map(async route => {
        try {
          const { data } = await api.post('/danger-zones/intersect', { route: route.geometry })
          return { ...route, safety: data }
        } catch {
          return { ...route, safety: null }
        }
      }))

      const hasHazardData = checked.some(route => route.safety?.hazard_data_available)
      const selectedRoute = hasHazardData
        ? checked.find(route => route.safety?.hazard_data_available && !route.safety.intersects)
        : checked[0]

      if (!selectedRoute) {
        setRouteStatus('Every available route intersects a configured hazard zone. No safe route is available.')
        return
      }

      setRouteCoordinates(selectedRoute.coordinates)
      setRouteSteps(selectedRoute.steps)
      setNextRouteStepIndex(0)
      setRouteDistanceM(selectedRoute.distanceM)
      setRouteDurationSec(selectedRoute.durationSec)
      setMapBounds(selectedRoute.coordinates)
      setFlyToTarget(null)
      setRouteStatus(hasHazardData
        ? 'Route avoids all configured hazard zones.'
        : 'Route found, but hazard data is unavailable; this route is not safety-verified.')
    } catch (error) {
      setRouteStatus(error.message || 'Could not calculate a walking route.')
    } finally {
      setIsRouting(false)
    }
  }, [isOnline, isRouting, language, touristPos])

  useEffect(() => {
    if (!destination || !touristPos.isRealGps || isRouting) return
    if (routeCoordinates.length < 2) {
      if (Date.now() - lastRouteRerouteAtRef.current < 60000) return
      lastRouteRerouteAtRef.current = Date.now()
      handleChooseDestination(destination)
      return
    }
    const offRouteDistance = Math.min(
      ...routeCoordinates.map(([lat, lng]) => getDistanceMeters(touristPos.lat, touristPos.lng, lat, lng))
    )
    if (offRouteDistance < 80 || Date.now() - lastRouteRerouteAtRef.current < 60000) return
    lastRouteRerouteAtRef.current = Date.now()
    handleChooseDestination(destination)
  }, [destination, handleChooseDestination, isRouting, routeCoordinates, touristPos.isRealGps, touristPos.lat, touristPos.lng])

  // Battery API
  useEffect(() => {
    if ('getBattery' in navigator) {
      navigator.getBattery().then((b) => {
        setBattery(Math.round(b.level * 100))
        b.addEventListener('levelchange', () => setBattery(Math.round(b.level * 100)))
      })
    }
  }, [])

  const updateNetworkStatus = useCallback(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    setIsOnline(navigator.onLine)
    if (!navigator.onLine) {
      setNetworkStatus('Offline')
      return
    }
    setBasemapUnavailable(false)
    if (!connection) {
      setNetworkStatus('Online · network quality not exposed by this browser')
      return
    }
    const details = [
      connection.type,
      connection.effectiveType,
      Number.isFinite(connection.downlink) ? `${connection.downlink} Mbps` : null,
      Number.isFinite(connection.rtt) ? `${connection.rtt} ms RTT` : null,
    ].filter(Boolean)
    setNetworkStatus(details.join(' · ') || 'Online · network quality unavailable')
  }, [])

  const handleBasemapTileError = useCallback(() => {
    setBasemapUnavailable(true)
  }, [])

  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    updateNetworkStatus()
    connection?.addEventListener?.('change', updateNetworkStatus)
    window.addEventListener('online', updateNetworkStatus)
    window.addEventListener('offline', updateNetworkStatus)
    return () => {
      connection?.removeEventListener?.('change', updateNetworkStatus)
      window.removeEventListener('online', updateNetworkStatus)
      window.removeEventListener('offline', updateNetworkStatus)
    }
  }, [updateNetworkStatus])

  // ── DEAD RECKONING REAL-TIME TICKER ──
  useEffect(() => {
    if (!isDeadReckoningActive || !deadReckoningState) return

    const interval = setInterval(() => {
      const lastFix = {
        lat: deadReckoningState.lastKnownLat,
        lng: deadReckoningState.lastKnownLng,
        timestampMs: deadReckoningState.offlineSinceMs,
        accuracyM: deadReckoningState.initialAccuracy || 15,
      }

      const projection = projectDeadReckoningKinematics(
        lastFix,
        deadReckoningState.speedMs,
        deadReckoningState.headingDeg,
        Date.now()
      )

      setDeadReckoningState((prev) => ({
        ...prev,
        ...projection,
      }))
    }, 1000)

    return () => clearInterval(interval)
  }, [isDeadReckoningActive, deadReckoningState?.offlineSinceMs])

  // ── Auto-Share Dead Reckoning to Ranger Station ──
  const autoShareDeadReckoningToRanger = useCallback(async (drData) => {
    if (drAutoShared) return
    setDrAutoShared(true)

    const userName = (user?.full_name || (user?.email ? user.email.split('@')[0].replace('.', ' ') : 'Tourist')).toUpperCase()
    const userPhone = user?.phone || ''
    const istTime = formatISTDateTime(new Date())

    try {
      await api.post('/incidents', {
        incident_type: 'DEAD_RECKONING_SIGNAL_LOSS',
        type: 'DEAD_RECKONING_SIGNAL_LOSS',
        severity: 'critical',
        lat: drData.lastKnownLat,
        lng: drData.lastKnownLng,
        user_name: userName,
        user_phone: userPhone,
        notes: `📡 SIGNAL LOSS ALERT: Tourist ${userName} (${userPhone}) lost cellular/GPS contact at ${istTime}. Pre-loss walking speed: ${drData.speedKmh} km/h. Kinematic search radius: ±${drData.searchRadiusM}m. Projected position: ${drData.estimatedLat.toFixed(5)}°N, ${drData.estimatedLng.toFixed(5)}°E.`,
      })
    } catch (_) {}
  }, [drAutoShared, user])

  // ── Automatic 250m Restricted Geofence Breach Engine ──
  const checkGeofenceBreach = useCallback(async (currentLat, currentLng) => {
    const zones = hazardZonesRef.current
    const insideIds = new Set()
    for (const feature of zones) {
      const [zoneLng, zoneLat] = feature.geometry.coordinates
      const radius = Number(feature.properties.radius_m) || 250
      const distance = getDistanceMeters(currentLat, currentLng, zoneLat, zoneLng)
      if (distance > radius) continue

      const zoneId = feature.id
      insideIds.add(zoneId)
      if (reportedZoneIdsRef.current.has(zoneId)) continue

      reportedZoneIdsRef.current.add(zoneId)
      try {
        const { data } = await api.post('/danger-zones/breach', {
          lat: currentLat,
          lng: currentLng,
          zone_id: zoneId,
          timestamp: new Date().toISOString(),
        })
        setBreachAlert({
          zoneName: data.zone,
          radius: data.radius_m,
          assignedRanger: data.assigned_ranger_station?.ranger_name,
          unit: data.assigned_ranger_station?.unit,
          eta: data.assigned_ranger_station?.eta_minutes,
          distance: Math.round(distance),
          zoneType: feature.properties.zone_type,
        })
      } catch (error) {
        reportedZoneIdsRef.current.delete(zoneId)
        setGpsStatusMsg(error?.response?.data?.detail || 'Geofence alert could not be sent. Check your connection.')
      }
    }
    for (const zoneId of reportedZoneIdsRef.current) {
      if (!insideIds.has(zoneId)) reportedZoneIdsRef.current.delete(zoneId)
    }
  }, [])

  const startDeadReckoningFromLastFix = useCallback(() => {
    const fix = lastGpsFixRef.current
    if (!fix || fix.speedMs < 0.4 || fix.headingDeg == null || isDeadReckoningActive) return

    const startedAt = Date.now()
    const initialFix = {
      lat: fix.lat,
      lng: fix.lng,
      timestampMs: startedAt,
      accuracyM: fix.accuracy,
    }
    const projection = projectDeadReckoningKinematics(initialFix, fix.speedMs, fix.headingDeg, startedAt)
    const state = {
      lastKnownLat: fix.lat,
      lastKnownLng: fix.lng,
      offlineSinceMs: startedAt,
      initialAccuracy: fix.accuracy,
      ...projection,
    }
    setDeadReckoningState(state)
    setIsDeadReckoningActive(true)
    setGpsStatusMsg('GPS lost. Showing an estimated position from your last GPS movement.')
    autoShareDeadReckoningToRanger(state)
  }, [autoShareDeadReckoningToRanger, isDeadReckoningActive])

  const handleGpsFix = useCallback((position) => {
    const { latitude, longitude, accuracy, speed, heading } = position.coords
    const timestampMs = position.timestamp || Date.now()
    const previous = lastGpsFixRef.current
    const measured = previous
      ? calculateTouristSpeed(previous, { lat: latitude, lng: longitude, timestampMs })
      : null
    const speedMs = Number.isFinite(speed) && speed >= 0 ? speed : measured?.speedMs || 0
    const movedMeters = previous ? getDistanceMeters(previous.lat, previous.lng, latitude, longitude) : 0
    const headingDeg = Number.isFinite(heading)
      ? heading
      : previous && movedMeters > 2
        ? calculateBearingDeg(previous.lat, previous.lng, latitude, longitude)
        : previous?.headingDeg ?? null
    const fix = {
      lat: latitude,
      lng: longitude,
      timestampMs,
      accuracy: Math.round(accuracy),
      speedMs,
      headingDeg,
    }

    lastGpsFixRef.current = fix
    const distanceSinceLastSync = lastLocationSyncFixRef.current
      ? getDistanceMeters(
        lastLocationSyncFixRef.current.lat,
        lastLocationSyncFixRef.current.lng,
        latitude,
        longitude
      )
      : Number.POSITIVE_INFINITY
    if (user?.role === 'tourist' && navigator.onLine
      && (distanceSinceLastSync >= 1 || Date.now() - lastLocationSyncAtRef.current >= 15000)) {
      lastLocationSyncAtRef.current = Date.now()
      lastLocationSyncFixRef.current = { lat: latitude, lng: longitude }
      api.post('/auth/location', {
        lat: latitude,
        lng: longitude,
        accuracy_m: accuracy,
        speed_kmh: Math.round(speedMs * 3.6 * 10) / 10,
      }).then(() => {
        setLocationSharingStatus('Latest GPS fix shared with Ranger/Admin')
      }).catch(() => {
        setLocationSharingStatus('Live location could not sync; last fix remains on this device')
      })
    }
    try {
      sessionStorage.setItem('vr_last_gps_fix', JSON.stringify(fix))
    } catch (_) {}
    setCalculatedWalkSpeed({ speedMs, speedKmh: Math.round(speedMs * 3.6 * 10) / 10 })
    setTouristPos({
      lat: latitude,
      lng: longitude,
      accuracy: Math.round(accuracy),
      isRealGps: true,
      isLastKnown: false,
      timestampMs,
    })
    setFlyToTarget([latitude, longitude])
    setMapBounds(null)
    setIsDeadReckoningActive(false)
    setDeadReckoningState(null)
    setDrAutoShared(false)
    setGpsStatusMsg(navigator.onLine
      ? `Live GPS updated (accuracy ±${Math.round(accuracy)}m).`
      : `GPS fix available offline (accuracy ±${Math.round(accuracy)}m). Map tiles and routing need internet.`)
    checkGeofenceBreach(latitude, longitude)
  }, [checkGeofenceBreach, user?.role])

  const handleGpsError = useCallback((error) => {
    const messages = {
      1: 'Location permission is blocked. Allow location access for this site.',
      2: 'Device location is unavailable. Check Windows Location Services.',
      3: 'GPS update timed out. Waiting for another device fix.',
    }
    const message = messages[error.code] || 'Device location is unavailable.'
    const lastFix = lastGpsFixRef.current
    setGpsStatusMsg(lastFix
      ? `Showing last known GPS position from ${formatISTDateTime(new Date(lastFix.timestampMs))}. ${message}`
      : message)
    if (error.code === 2 || error.code === 3) startDeadReckoningFromLastFix()
  }, [startDeadReckoningFromLastFix])

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatusMsg('Geolocation is unavailable in this browser.')
      return undefined
    }
    const watchId = navigator.geolocation.watchPosition(
      handleGpsFix,
      handleGpsError,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [handleGpsError, handleGpsFix])

  // ── GPS "Locate Me" Handler (With Speed Computation) ──
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setGpsStatusMsg('GPS not supported on this browser.')
      return
    }

    setIsLocating(true)
    setGpsStatusMsg('Requesting your device location...')
    navigator.geolocation.getCurrentPosition(
      position => {
        handleGpsFix(position)
        setIsLocating(false)
      },
      error => {
        handleGpsError(error)
        setIsLocating(false)
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  }

  const displayRangers = rangers.filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng))
  const displayTourists = touristLocations.filter(t => Number.isFinite(t.lat) && Number.isFinite(t.lng))
  const displayedPosition = isDeadReckoningActive && deadReckoningState
    ? { lat: deadReckoningState.estimatedLat, lng: deadReckoningState.estimatedLng }
    : touristPos
  const locationStatus = isDeadReckoningActive
    ? 'ESTIMATED · DEAD RECKONING'
    : touristPos.isRealGps
      ? 'CURRENT DEVICE GPS'
      : touristPos.isLastKnown
        ? 'LAST KNOWN GPS FIX'
        : 'NO GPS FIX AVAILABLE'

  return (
    <div className="h-screen w-screen flex flex-col font-body-md text-on-surface bg-surface overflow-hidden">
      
      {/* ── Top Tactical Header ── */}
      <header className="h-14 bg-surface/95 backdrop-blur border-b border-outline/15 px-4 flex items-center justify-between z-[1000] shrink-0">
        <div className="flex items-center gap-3">
          <Link to={user?.role === 'rescue_team' ? '/ranger' : '/home'} className="flex items-center gap-1 text-tertiary hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-2xl" style={{ fontVariationSettings: '"FILL" 1' }}>explore</span>
            <div>
              <h1 className="font-headline-sm text-sm md:text-base font-bold leading-none">
                {trackedTourist ? t('map.intercept') : t('map.title')}
              </h1>
              <p className="font-data-mono text-[10px] text-outline mt-0.5">
                {isDeadReckoningActive
                  ? `⚠️ ${t('map.deadReckoning')}`
                  : t('map.liveDescription')}
              </p>
              {trackedTourist?.dtid && (
                <p className="font-data-mono text-[10px] text-primary mt-0.5">
                  {t('map.tracking')} {trackedTourist.name || 'TOURIST'} · DTID {trackedTourist.dtid}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Status telemetry & Action buttons */}
        <div className="flex items-center gap-2 md:gap-4">
          <LanguageSwitcher />
          <div className="hidden lg:flex items-center gap-2 font-data-mono text-xs text-tertiary px-2.5 py-1 bg-surface-container-low hairline-border rounded">
            <span className="flex items-center gap-1 text-secondary font-bold">
              <span className="material-symbols-outlined text-xs">directions_walk</span>
              {calculatedWalkSpeed.speedKmh} km/h
            </span>
            <span className="text-outline">|</span>
            <span className="text-primary font-semibold">
              {touristPos.isRealGps
                ? `${touristPos.lat.toFixed(4)}°N, ${touristPos.lng.toFixed(4)}°E`
                : t('map.locationUnavailable')}
            </span>
          </div>

          {battery !== null && (
            <div className="flex items-center gap-1 font-data-mono text-xs px-2 py-1 hairline-border rounded text-tertiary">
              <span className="material-symbols-outlined text-sm">battery_full</span>
              {battery}%
            </div>
          )}

          <div className={`flex items-center gap-1.5 font-label-caps text-[10px] px-2.5 py-1 rounded hairline-border ${
            isDeadReckoningActive
              ? 'bg-purple-950/20 text-purple-800 border-purple-400 animate-pulse font-bold'
              : 'bg-secondary/10 text-secondary border-secondary/30'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isDeadReckoningActive ? 'bg-purple-700' : 'bg-secondary'}`} />
            {isDeadReckoningActive ? t('map.deadReckoning') : touristPos.isRealGps ? t('map.liveGps') : t('map.searchingGps')}
          </div>

          {user?.role === 'rescue_team' ? (
            <Link to="/ranger" className="bg-primary text-on-primary font-label-caps text-xs px-3 py-1.5 rounded flex items-center gap-1 shadow hover:bg-primary/90 transition-all">
              <span className="material-symbols-outlined text-sm">shield_person</span>
              {t('map.rangerLog')}
            </Link>
          ) : (
            <Link to="/sos" className="bg-error text-on-error font-label-caps text-xs px-3 py-1.5 rounded flex items-center gap-1 shadow hover:bg-error/90 transition-all">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>sos</span>
              {t('nav.sos')}
            </Link>
          )}
        </div>
      </header>

      {/* ── Controls Strip ── */}
      <div className="h-12 bg-surface-container-low hairline-border-b px-4 flex items-center justify-between gap-3 overflow-x-auto z-[999] shrink-0 text-xs">
        
        {/* Predefined places with geofencing */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-label-caps text-[10px] text-tertiary font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-sm text-primary">conversion_path</span>
            {t('map.places')}
          </span>
          {SURVEYED_TRAILS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleSelectTrail(t)}
              className={`px-3 py-1 rounded font-label-caps text-[11px] transition-all flex items-center gap-1 whitespace-nowrap ${
                selectedTrail?.id === t.id
                  ? 'bg-primary text-on-primary font-bold shadow'
                  : 'bg-surface hairline-border text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {t.name.split('(')[0].trim()}
            </button>
          ))}
        </div>

        <form onSubmit={handleDestinationSearch} className="flex items-center gap-sm shrink-0">
          <label htmlFor="destination-search" className="font-label-caps text-[10px] text-tertiary">{t('map.destination')}</label>
          <input
            id="destination-search"
            value={destinationInput}
            onChange={event => setDestinationInput(event.target.value)}
            placeholder={t('map.typePlace')}
            className="field-input w-48 py-1 text-xs"
          />
          <button type="submit" disabled={isRouting || !destinationInput.trim()} className="btn-primary px-3 py-1 text-[11px] disabled:opacity-50">
            {isRouting ? t('map.routing') : t('map.findRoute')}
          </button>
        </form>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          
          {/* 📍 GPS Locate Current Location Button */}
          <button
            onClick={handleLocateMe}
            disabled={isLocating}
            className={`px-3 py-1 rounded font-label-caps text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-sm ${
              touristPos.isRealGps
                ? 'bg-primary text-on-primary border border-primary'
                : 'bg-surface hairline-border text-primary hover:bg-primary/10'
            }`}
            title="Click to redirect map to your exact device GPS location"
          >
            <span className={`material-symbols-outlined text-sm ${isLocating ? 'animate-spin' : ''}`}>
              {isLocating ? 'progress_activity' : 'my_location'}
            </span>
            <span>{isLocating ? t('map.locating') : t('map.myGps')}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDemoTourists(value => !value)}
            aria-pressed={showDemoTourists}
            className={`px-3 py-1 rounded font-label-caps text-[11px] font-bold flex items-center gap-1.5 hairline-border ${
              showDemoTourists ? 'bg-secondary/10 text-secondary border-secondary/40' : 'bg-surface text-outline'
            }`}
          >
            <span className="material-symbols-outlined text-sm">{showDemoTourists ? 'visibility' : 'visibility_off'}</span>
            {t('map.demoZones')}
          </button>

          {/* Basemap Switcher */}
          <div className="flex items-center gap-1 pl-2 border-l border-outline/15">
            <span className="font-label-caps text-[10px] text-outline mr-1">{t('map.basemap')}</span>
            {Object.entries(BASEMAPS).map(([key]) => (
              <button
                key={key}
                onClick={() => setActiveBasemap(key)}
                className={`px-2 py-0.5 rounded font-label-caps text-[10px] ${
                  activeBasemap === key ? 'bg-secondary text-on-secondary font-bold' : 'bg-surface hairline-border text-outline'
                }`}
              >
                {t(key === 'topo' ? 'map.basemapTopo' : key === 'satellite' ? 'map.basemapSatellite' : 'map.basemapOsm')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Map Canvas Container ── */}
      <div className={`flex-1 relative w-full h-full ${!isOnline || basemapUnavailable ? 'offline-grid-map' : ''}`}>
        
        {/* On-screen GPS Status Notification Banner */}
        {gpsStatusMsg && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1100] bg-surface/95 backdrop-blur hairline-border border-primary px-4 py-1.5 rounded-full shadow-lg text-xs font-data-mono text-primary flex items-center gap-2 animate-fadeIn">
            <span className="material-symbols-outlined text-sm animate-pulse">satellite_alt</span>
            {gpsStatusMsg}
          </div>
        )}

        {routeStatus && (
          <div className="absolute top-3 right-4 z-[1100] bg-surface/95 hairline-border rounded p-sm max-w-sm font-data-mono text-xs shadow-lg">
            <div className="text-primary font-bold">{routeStatus}</div>
          </div>
        )}

        {showDemoTourists && (
          <aside className="absolute top-3 right-4 z-[1050] bg-surface/95 backdrop-blur hairline-border rounded p-sm shadow-lg max-w-xs">
            <h2 className="font-label-caps text-[10px] text-on-surface font-bold mb-xs">PREDEFINED DEMO GEOFENCES</h2>
            <ul className="space-y-xs font-data-mono text-[10px]">
              {DEMO_PLACE.areas.map(area => (
                <li key={area.id} className="flex items-center justify-between gap-md">
                  <span className="flex items-center gap-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: area.color }} />
                    {area.zoneLabel}
                  </span>
                  <span className="font-bold" style={{ color: area.color }}>{area.radiusM}m · {area.name}</span>
                </li>
              ))}
            </ul>
            <p className="font-data-mono text-[9px] text-outline mt-xs border-t border-outline/15 pt-xs">
              Demo only, not official safety or access boundaries. Live alerts use configured zones.
            </p>
          </aside>
        )}

        {destinationChoices.length > 0 && (
          <div className="absolute top-3 left-4 z-[1100] bg-surface/95 hairline-border rounded p-sm shadow-lg max-w-sm w-full max-h-64 overflow-y-auto space-y-xs">
            {destinationChoices.map((place, index) => (
              <button
                key={`${place.lat}-${place.lng}-${index}`}
                type="button"
                onClick={() => handleChooseDestination(place)}
                className="w-full text-left p-sm hover:bg-surface-container hairline-border rounded font-body-md text-sm"
              >
                <span className="material-symbols-outlined text-xs text-primary mr-xs">location_on</span>
                {place.label}
              </button>
            ))}
          </div>
        )}

        {destination && routeCoordinates.length > 1 && (
          <div className="absolute top-14 left-4 z-[950] bg-surface/95 backdrop-blur hairline-border rounded p-md shadow-xl max-w-sm w-full max-h-[55vh] overflow-y-auto space-y-sm">
            <div className="font-label-caps text-label-caps text-secondary">{t('map.walkingDirections')}</div>
            <h2 className="font-headline-sm text-on-surface text-sm">{destination.label}</h2>
            <div className="font-data-mono text-xs text-on-surface-variant">
              {routeDistanceM != null ? `${(routeDistanceM / 1000).toFixed(1)} km` : ''}
              {routeDurationSec != null ? ` · ${Math.round(routeDurationSec / 60)} min` : ''}
            </div>
            {routeSteps[nextRouteStepIndex] && (
              <div className="border-l-2 border-primary pl-sm font-body-md text-sm text-on-surface">
                <div className="font-label-caps text-[10px] text-primary">{t('map.upNext')}</div>
                {routeSteps[nextRouteStepIndex].instruction}
              </div>
            )}
            <ol className="space-y-xs border-t border-outline/15 pt-sm">
              {routeSteps.slice(nextRouteStepIndex, nextRouteStepIndex + 12).map((step, offset) => (
                <li key={`${nextRouteStepIndex + offset}-${step.instruction}`} className="flex gap-sm text-xs text-on-surface">
                  <span className="font-data-mono text-primary">{nextRouteStepIndex + offset + 1}.</span>
                  <span>{step.instruction} · {Math.round(step.distanceM)} m</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* ── 📡 KINEMATIC DEAD RECKONING DASHBOARD (When Signal is Lost / GPS Disabled) ── */}
        {isDeadReckoningActive && deadReckoningState && (
          <div className="absolute top-4 left-4 z-[950] bg-surface/95 backdrop-blur hairline-border rounded-xl p-4 shadow-2xl max-w-sm w-full border-l-4 border-purple-700 space-y-2.5 animate-slideDown">
            <div className="flex items-center justify-between border-b border-outline/10 pb-2">
              <span className="font-label-caps text-[10px] text-purple-700 flex items-center gap-1.5 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-700 animate-ping" />
                DEAD RECKONING KINEMATICS RADAR
              </span>
              <button onClick={() => setIsDeadReckoningActive(false)} className="text-outline hover:text-on-surface">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <div className="p-2.5 bg-purple-950/5 hairline-border border-purple-300 rounded space-y-1.5 font-data-mono text-xs">
              <div className="flex justify-between">
                <span className="text-outline">PRE-LOSS WALK SPEED:</span>
                <strong className="text-secondary font-bold">{deadReckoningState.speedKmh} km/h ({deadReckoningState.speedMs} m/s)</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">OFFLINE DURATION:</span>
                <span className="text-purple-800 font-bold">T + {deadReckoningState.offlineSec}s (Live Timer)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">ESTIMATED DISTANCE:</span>
                <span className="text-primary font-bold">{deadReckoningState.distanceTraveledMeters} meters</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">EXPANDING SEARCH RADIUS:</span>
                <strong className="text-error font-bold">±{deadReckoningState.searchRadiusM} meters</strong>
              </div>
              <div className="flex justify-between border-t border-purple-200 pt-1">
                <span className="text-outline">PROJECTED COORDINATES:</span>
                <span className="text-on-surface font-semibold">{deadReckoningState.estimatedLat.toFixed(5)}°N, {deadReckoningState.estimatedLng.toFixed(5)}°E</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-data-mono text-secondary bg-secondary/10 px-2.5 py-1.5 rounded hairline-border border-secondary/30">
              <span className="material-symbols-outlined text-sm">verified_user</span>
              <span>Telemetry Auto-Shared to Ranger Station</span>
            </div>
          </div>
        )}

        {/* ── 🚫 250M RESTRICTED GEOFENCE BREACH MODAL ── */}
        {breachAlert && (
          <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-surface max-w-lg w-full rounded-xl shadow-2xl hairline-border border-2 border-purple-600 p-6 space-y-4 text-center">
              <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto text-purple-700 animate-pulse border-2 border-purple-500">
                <span className="material-symbols-outlined text-4xl">do_not_disturb_on</span>
              </div>

              <div>
                <span className="font-label-caps text-xs text-purple-700 font-bold bg-purple-100 px-3 py-1 rounded-full inline-block mb-1">
                  CONFIGURED HAZARD GEOFENCE ALERT
                </span>
                <h3 className="font-headline-sm text-lg font-bold text-on-surface mt-2">
                  {breachAlert.zoneName}
                </h3>
                <p className="font-data-mono text-xs text-purple-800 font-semibold mt-1">
                  {breachAlert.zoneType} · configured boundary
                </p>
              </div>

              <div className="bg-surface-container-low hairline-border rounded-lg p-3 text-left space-y-1.5 font-data-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-outline">TOURIST NAME:</span>
                  <strong className="text-on-surface">{breachAlert.touristName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-outline">PHONE NUMBER:</span>
                  <strong className="text-primary">{breachAlert.touristPhone}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-outline">GEOFENCE RADIUS:</span>
                  <span className="text-purple-700 font-bold">{breachAlert.radius} METERS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-outline">AUTO-DISPATCHED RANGER:</span>
                  <strong className="text-secondary">{breachAlert.assignedRanger || 'Ranger location unavailable'}{breachAlert.unit ? ` (${breachAlert.unit})` : ''}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-outline">PATROL ETA:</span>
                  <span className="text-primary font-bold">{breachAlert.eta != null ? `~${breachAlert.eta} MIN` : 'ETA unavailable'}</span>
                </div>
              </div>

              <div className="bg-error/10 hairline-border border-error/30 p-2.5 rounded text-xs text-error font-body-md text-left flex items-start gap-2">
                <span className="material-symbols-outlined text-base mt-0.5">warning</span>
                <span>
                  Your latest GPS fix entered an operator-configured hazard zone. The incident was recorded for the Control Room.
                </span>
              </div>

              <div className="flex gap-3 justify-center pt-2">
                <button
                  onClick={() => setBreachAlert(null)}
                  className="px-4 py-2 bg-purple-700 text-white rounded font-label-caps text-xs font-bold hover:bg-purple-800 transition-colors shadow"
                >
                  ACKNOWLEDGE & RETURN TO PATH
                </button>
                <Link
                  to="/ranger"
                  className="px-4 py-2 bg-surface hairline-border rounded font-label-caps text-xs text-secondary font-bold hover:bg-surface-container transition-colors"
                >
                  VIEW RANGER LOG
                </Link>
              </div>
            </div>
          </div>
        )}

        <MapContainer
          center={trackedTourist
            ? [trackedTourist.lat, trackedTourist.lng]
            : touristPos.isRealGps || touristPos.isLastKnown
              ? [touristPos.lat, touristPos.lng]
              : [20.5938, 78.9629]}
          zoom={touristPos.isRealGps || touristPos.isLastKnown || trackedTourist ? 15 : 5}
          className="w-full h-full"
          zoomControl={false}
        >
          <MapController centerPos={flyToTarget} bounds={mapBounds} />

          {isOnline && !basemapUnavailable && (
            <TileLayer
              url={BASEMAPS[activeBasemap].url}
              attribution={BASEMAPS[activeBasemap].attribution}
              maxZoom={BASEMAPS[activeBasemap].maxZoom}
              eventHandlers={{ tileerror: handleBasemapTileError }}
            />
          )}

          {showSafeRoute && routeCoordinates.length > 1 && (
            <Polyline positions={routeCoordinates} pathOptions={{ color: '#138808', weight: 6, opacity: 0.9 }} />
          )}

          {/* Selected predefined place: surveyed safe route + start / destination */}
          {selectedTrail && (
            <LayerGroup>
              {showSafeRoute && selectedTrail.routePath && (
                <>
                  <Polyline positions={selectedTrail.routePath} pathOptions={{ color: '#FFFFFF', weight: 8, opacity: 0.6 }} />
                  <Polyline positions={selectedTrail.routePath} pathOptions={{ color: '#138808', weight: 5, opacity: 0.95 }} />
                </>
              )}
              <Marker position={[selectedTrail.startPoint.lat, selectedTrail.startPoint.lng]} icon={START_TRAILHEAD_ICON}>
                <Tooltip permanent direction="bottom" className="font-label-caps text-[10px] text-secondary font-bold">
                  START: {selectedTrail.startPoint.name}
                </Tooltip>
              </Marker>
              <Marker position={[selectedTrail.endPoint.lat, selectedTrail.endPoint.lng]} icon={END_DESTINATION_ICON}>
                <Tooltip permanent direction="top" className="font-label-caps text-[10px] text-tertiary font-bold">
                  DESTINATION: {selectedTrail.endPoint.name}
                </Tooltip>
              </Marker>
            </LayerGroup>
          )}

          {destination && (
            <Marker position={[destination.lat, destination.lng]} icon={END_DESTINATION_ICON}>
              <Tooltip permanent direction="top" className="font-label-caps text-[10px] text-tertiary font-bold">
                DESTINATION: {destination.name}
              </Tooltip>
            </Marker>
          )}

          {showRestrictedZones && hazardZones.map(zone => {
            const [lng, lat] = zone.geometry.coordinates
            const properties = zone.properties
            return (
              <LayerGroup key={zone.id}>
                <Circle
                  center={[lat, lng]}
                  radius={Number(properties.radius_m) || 250}
                  pathOptions={{ color: '#BA1A1A', fillColor: '#BA1A1A', fillOpacity: 0.18, weight: 2 }}
                >
                  <Tooltip direction="center" className="font-data-mono text-[10px] font-bold">
                    {properties.name} · {properties.severity?.toUpperCase() || 'HAZARD'}
                  </Tooltip>
                </Circle>
                <Marker position={[lat, lng]} icon={RESTRICTED_ZONE_ICON}>
                  <Popup>
                    <div className="p-1 space-y-1 font-data-mono text-xs">
                      <div className="font-label-caps text-[10px] text-error font-bold">
                        CONFIGURED HAZARD ZONE
                      </div>
                      <h4 className="font-bold text-on-surface text-sm">{properties.name}</h4>
                      <p className="text-on-surface-variant">{properties.description || properties.zone_type}</p>
                      <p className="text-error font-bold">Radius: {properties.radius_m} meters</p>
                    </div>
                  </Popup>
                </Marker>
              </LayerGroup>
            )
          })}

          {showDemoTourists && (
            <LayerGroup key={DEMO_PLACE.id}>
              {DEMO_PLACE.areas.map(area => (
                <Circle
                  key={area.id}
                  center={[area.lat, area.lng]}
                  radius={area.radiusM}
                  pathOptions={{
                    color: area.color,
                    fillColor: area.color,
                    fillOpacity: 0.16,
                    weight: 2,
                    dashArray: '5, 5',
                  }}
                >
                  <Tooltip direction="center" className="font-data-mono text-[10px] font-bold">
                    DEMO {area.zoneLabel} GEOFENCE · {area.radiusM}m
                  </Tooltip>
                </Circle>
              ))}
              <Marker position={[DEMO_PLACE.lat, DEMO_PLACE.lng]} icon={DEMO_TOURIST_ICON}>
                <Popup>
                  <div className="p-1 space-y-1 font-data-mono text-xs">
                    <div className="font-label-caps text-[10px] text-secondary font-bold">DEMO PLACE · NOT A LIVE VISITOR</div>
                    <h4 className="font-bold text-on-surface text-sm">{DEMO_PLACE.name}</h4>
                    {DEMO_PLACE.areas.map(area => (
                      <p key={area.id} className="font-bold" style={{ color: area.color }}>
                        {area.zoneLabel} · {area.radiusM}m
                      </p>
                    ))}
                    <p className="text-outline">Example areas only. Not official boundaries; no live alerts or route checks use these overlays.</p>
                    <button
                      type="button"
                      onClick={() => handleChooseDestination({
                        lat: DEMO_PLACE.lat,
                        lng: DEMO_PLACE.lng,
                        name: 'Ooty',
                        label: 'Ooty Demo Place',
                      })}
                      className="btn-primary mt-xs w-full text-xs"
                    >
                      ROUTE TO OOTY FROM MY GPS
                    </button>
                  </div>
                </Popup>
              </Marker>
            </LayerGroup>
          )}

          {/* ── 📡 DEAD RECKONING: LAST FIX, PROJECTED POSITION & EXPANDING SEARCH RADIUS ── */}
          {isDeadReckoningActive && deadReckoningState && (
            <LayerGroup>
              {/* Expanding Kinematic Search Circle */}
              <Circle
                center={[deadReckoningState.lastKnownLat, deadReckoningState.lastKnownLng]}
                radius={deadReckoningState.searchRadiusM}
                pathOptions={{
                  color: '#9333EA',
                  fillColor: '#9333EA',
                  fillOpacity: 0.22,
                  weight: 2,
                  dashArray: '8, 8',
                }}
              >
                <Tooltip permanent direction="bottom" className="font-data-mono text-[10px] text-purple-900 font-bold bg-white/95 px-2 py-0.5 rounded shadow">
                  📡 KINEMATIC SEARCH PERIMETER: ±{deadReckoningState.searchRadiusM}m (d={deadReckoningState.distanceTraveledMeters}m @ {deadReckoningState.speedKmh} km/h)
                </Tooltip>
              </Circle>

              {/* Direction of Travel Kinematic Vector Line */}
              <Polyline
                positions={[
                  [deadReckoningState.lastKnownLat, deadReckoningState.lastKnownLng],
                  [deadReckoningState.estimatedLat, deadReckoningState.estimatedLng],
                ]}
                pathOptions={{ color: '#9333EA', weight: 4, opacity: 0.95 }}
              />

              {/* Last Known GPS Position Fix Marker */}
              <Marker
                position={[deadReckoningState.lastKnownLat, deadReckoningState.lastKnownLng]}
                icon={LAST_FIX_ICON}
              >
                <Tooltip permanent direction="top" className="font-label-caps text-[10px] text-amber-800 font-bold">
                  📍 LAST KNOWN GPS FIX (SIGNAL LOST)
                </Tooltip>
              </Marker>

              {/* Projected Estimated Location Marker */}
              <Marker
                position={[deadReckoningState.estimatedLat, deadReckoningState.estimatedLng]}
                icon={DEAD_RECKONING_ICON}
              >
                <Tooltip permanent direction="right" offset={[15, 0]} className="font-data-mono text-[10px] text-purple-900 font-bold">
                  🎯 PROJECTED POSITION (T+{deadReckoningState.offlineSec}s)
                </Tooltip>
                <Popup>
                  <div className="p-1 space-y-1 font-data-mono text-xs">
                    <div className="font-label-caps text-[10px] text-purple-700 font-bold">
                      📡 KINEMATIC DEAD RECKONING PROJECTION
                    </div>
                    <p className="text-on-surface font-semibold">
                      Calculated Walk Speed: <strong>{deadReckoningState.speedKmh} km/h</strong>
                    </p>
                    <p className="text-primary font-bold">
                      Estimated Distance: {deadReckoningState.distanceTraveledMeters}m
                    </p>
                    <p className="text-error font-bold">
                      Search Perimeter: ±{deadReckoningState.searchRadiusM}m
                    </p>
                    <p className="text-secondary">
                      Offline Elapsed: {deadReckoningState.offlineSec} seconds
                    </p>
                  </div>
                </Popup>
              </Marker>
            </LayerGroup>
          )}

          {/* ── 📍 LIVE USER CURRENT GPS LOCATION (When Dead Reckoning not active) ── */}
          {!isDeadReckoningActive && (touristPos.isRealGps || touristPos.isLastKnown) && (
            <LayerGroup>
              {touristPos.accuracy > 0 && (
                <Circle
                  center={[touristPos.lat, touristPos.lng]}
                  radius={touristPos.accuracy}
                  pathOptions={{ color: touristPos.isRealGps ? '#FF9933' : '#EAB308', fillOpacity: 0.1, weight: 1 }}
                />
              )}
              <Marker
                position={[touristPos.lat, touristPos.lng]}
                icon={touristPos.isLastKnown ? LAST_FIX_ICON : TOURIST_ICON}
              >
                <Tooltip permanent direction="right" offset={[15, 0]} className="font-data-mono text-[10px] text-primary font-bold">
                  {touristPos.isLastKnown
                    ? `LAST FIX · ${formatISTDateTime(new Date(touristPos.timestampMs))}`
                    : <>YOU ({calculatedWalkSpeed.speedKmh} km/h) · <LiveTime /></>}
                </Tooltip>
              <Popup>
                <div className="p-1 space-y-1 font-data-mono text-xs">
                  <div className={`font-label-caps text-[10px] font-bold ${touristPos.isLastKnown ? 'text-primary' : 'text-secondary'}`}>
                    {touristPos.isLastKnown ? 'LAST KNOWN DEVICE LOCATION' : 'LIVE DEVICE LOCATION'}
                  </div>
                  <p className="text-tertiary font-bold">🕒 Current Time: <LiveTime /> IST</p>
                  <p className="font-bold text-on-surface">{touristPos.isLastKnown ? 'Saved Coordinates:' : 'Your Coordinates:'}</p>
                  <p className="text-primary font-semibold">{touristPos.lat.toFixed(5)}°N, {touristPos.lng.toFixed(5)}°E</p>
                  {!touristPos.isLastKnown && <p className="text-secondary font-semibold">Walk Speed: {calculatedWalkSpeed.speedKmh} km/h ({calculatedWalkSpeed.speedMs} m/s)</p>}
                  {touristPos.accuracy && <p className="text-outline text-[10px]">Precision: ±{touristPos.accuracy} meters</p>}
                  {touristPos.isLastKnown && <p className="text-primary text-[10px]">Fix time: {formatISTDateTime(new Date(touristPos.timestampMs))}</p>}
                  <div className="pt-1">
                    <Link to="/sos" className="btn-primary text-xs w-full justify-center flex items-center gap-1 bg-error">
                      <span className="material-symbols-outlined text-xs">sos</span> SEND SOS WITH THIS GPS
                    </Link>
                  </div>
                </div>
              </Popup>
              </Marker>
            </LayerGroup>
          )}

          {/* Active Ranger Patrol Markers */}
          {showRangers && (
            <LayerGroup>
              {displayRangers.map((r) => (
                <Marker
                  key={r.id || r.unit_id}
                  position={[r.lat, r.lng]}
                  icon={RANGER_ICONS[r.unit_type] || RANGER_ICONS.ranger}
                >
                  <Tooltip direction="bottom" className="font-data-mono text-[10px]">
                    {r.unit_id} ({r.name})
                  </Tooltip>
                </Marker>
              ))}
            </LayerGroup>
          )}

          {['rescue_team', 'control_room'].includes(user?.role) && displayTourists.map(visitor => {
            const updatedAt = visitor.location_updated_at ? new Date(visitor.location_updated_at) : null
            const isFresh = updatedAt && Date.now() - updatedAt.getTime() <= 90000
            const riskColor = visitor.risk_level === 'HIGH'
              ? '#BA1A1A'
              : visitor.risk_level === 'ELEVATED'
                ? '#EF8B20'
                : visitor.risk_level === 'LOW'
                  ? '#138808'
                  : '#686868'
            const currentPoint = trackedLocationTarget?.id === visitor.id && touristTrack.length
              ? touristTrack[touristTrack.length - 1]
              : visitor
            return (
              <LayerGroup key={visitor.id}>
                {trackedLocationTarget?.id === visitor.id && touristTrack.length > 1 && (
                  <Polyline
                    positions={touristTrack.map(point => [point.lat, point.lng])}
                    pathOptions={{ color: '#006B5F', weight: 5, opacity: 0.85 }}
                  >
                    <Tooltip sticky>{visitor.full_name} · LIVE MOVEMENT TRAIL · {touristTrack.length} points</Tooltip>
                  </Polyline>
                )}
                <Marker
                  position={[currentPoint.lat, currentPoint.lng]}
                  icon={TRACKED_TOURIST_ICON}
                >
                  <Tooltip direction="top" className="font-data-mono text-[10px] font-bold">
                    {visitor.full_name} · {visitor.dtid_code || visitor.id.slice(0, 8)} · {isFresh ? 'LIVE' : 'LAST SEEN'}
                  </Tooltip>
                  <Popup>
                    <div className="p-1 space-y-1 font-data-mono text-xs">
                      <div className="font-label-caps text-[10px] text-secondary font-bold">TOURIST LOCATION</div>
                      <h4 className="font-bold text-on-surface text-sm">{visitor.full_name}</h4>
                      <p className="text-primary font-bold">DTID: {visitor.dtid_code || 'Not issued'}</p>
                      <p>{currentPoint.lat.toFixed(5)}°, {currentPoint.lng.toFixed(5)}° · ±{visitor.accuracy_m ?? '—'}m</p>
                      <p>Movement: {visitor.speed_kmh == null ? '—' : `${visitor.speed_kmh.toFixed(1)} km/h`}</p>
                      <p style={{ color: riskColor }} className="font-bold">
                        ZONE PROXIMITY: {visitor.risk_level || 'UNASSESSED'} · {visitor.risk_score ?? '—'}/100
                      </p>
                      <p className="text-on-surface-variant">{visitor.risk_reason || 'No risk explanation available.'}</p>
                      <p className={isFresh ? 'text-secondary' : 'text-primary'}>
                        {isFresh ? 'LIVE LOCATION' : 'LAST KNOWN LOCATION'}
                        {updatedAt ? ` · ${formatISTDateTime(updatedAt)}` : ''}
                      </p>
                      {trackedLocationTarget?.id === visitor.id && (
                        <p className="text-secondary">MOVEMENT TRAIL · {touristTrack.length} points · refreshes every 5 seconds</p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              </LayerGroup>
            )
          })}
        </MapContainer>

        {/* ── Floating Quick GPS Action Button ── */}
        <div className="absolute bottom-6 right-6 z-[900] flex flex-col gap-2">
          <button
            onClick={handleLocateMe}
            className="w-12 h-12 bg-surface hairline-border rounded-full shadow-2xl flex items-center justify-center text-primary hover:bg-primary/10 transition-transform active:scale-90 border-2 border-primary"
            title="Locate and Center on My Real-time GPS Location"
          >
            <span className="material-symbols-outlined text-2xl font-bold">my_location</span>
          </button>
        </div>

        <div className="absolute bottom-6 left-6 z-[900] bg-surface/95 backdrop-blur hairline-border rounded-lg p-3.5 shadow-xl text-xs space-y-1.5 border-l-4 border-secondary animate-fadeIn max-w-xs">
          <div className="font-label-caps text-[10px] text-secondary font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">{isOnline ? 'network_check' : 'location_searching'}</span>
            {isOnline ? 'DEVICE NETWORK · LIVE' : 'OFFLINE LOCATION STATUS'}
          </div>
          <p className="font-data-mono text-[11px] text-on-surface">{networkStatus}</p>
          {!isOnline || basemapUnavailable ? (
            <>
              <p className="font-label-caps text-[10px] text-primary font-bold">{locationStatus}</p>
              {Number.isFinite(displayedPosition.lat) && Number.isFinite(displayedPosition.lng) ? (
                <p className="font-data-mono text-[11px] text-on-surface">
                  {displayedPosition.lat.toFixed(5)}°, {displayedPosition.lng.toFixed(5)}°
                  {!isDeadReckoningActive && touristPos.accuracy ? ` · ±${touristPos.accuracy}m` : ''}
                </p>
              ) : (
                <p className="font-data-mono text-[10px] text-error">No GPS fix is available. Enable device location; GPS hardware or network location may be required.</p>
              )}
              <p className="font-data-mono text-[10px] text-outline">
                {!isOnline ? 'Offline grid shown. Basemap tiles, route lookup, and live zone checks need internet.' : 'Basemap tiles unavailable. Coordinates and GPS markers remain visible.'}
              </p>
            </>
          ) : (
            <p className="font-data-mono text-[10px] text-outline">Browser-reported connection only; no cell-tower coverage feed is configured.</p>
          )}
          {user?.role === 'tourist' && (
            <p className="font-data-mono text-[10px] text-secondary" role="status">
              {isOnline ? locationSharingStatus : 'Location stays on this device offline and syncs when online.'}
            </p>
          )}
        </div>

      </div>
      <VoiceEmergencyMonitor positionClass="bottom-32 right-4" />
    </div>
  )
}
