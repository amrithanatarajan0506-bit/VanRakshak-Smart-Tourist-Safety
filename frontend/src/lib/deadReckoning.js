/**
 * Dead-Reckoning & Kinematic Speed Engine — VanRakshak
 * ─────────────────────────────────────────────────────────────────────────────
 * Calculates tourist walking speed prior to signal loss, projects dead-reckoning
 * coordinates along trail heading, dynamically expands search radius based on
 * elapsed offline time, and formats telemetry for automated ranger dispatch.
 */

const EARTH_RADIUS_M = 6_371_000

/**
 * Calculates Great-Circle Haversine distance between two coordinates in meters.
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(deltaPhi / 2.0) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2.0) ** 2
  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a))
  return EARTH_RADIUS_M * c
}

/**
 * Calculates mathematical forward azimuth / bearing in degrees (0 = North).
 */
export function calculateBearingDeg(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180

  const y = Math.sin(deltaLambda) * Math.cos(phi2)
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda)
  const thetaRad = Math.atan2(y, x)
  return ((thetaRad * 180) / Math.PI + 360) % 360
}

/**
 * Calculates mathematical walking speed from two timestamped GPS positions.
 * @param {object} p1 - { lat, lng, timestampMs }
 * @param {object} p2 - { lat, lng, timestampMs }
 * @returns {object} { speedMs, speedKmh, distanceMeters, timeDeltaSec }
 */
export function calculateTouristSpeed(p1, p2) {
  if (!p1 || !p2 || !Number.isFinite(p1.lat) || !Number.isFinite(p2.lat)
    || !Number.isFinite(p1.lng) || !Number.isFinite(p2.lng)) {
    return { speedMs: 0, speedKmh: 0, distanceMeters: 0, timeDeltaSec: 0 }
  }

  const distanceMeters = haversineDistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng)
  const timeDeltaSec = Math.max(1, ((p2.timestampMs || Date.now()) - (p1.timestampMs || (Date.now() - 5000))) / 1000)
  
  const speedMs = Math.max(0, Math.min(2.8, distanceMeters / timeDeltaSec))
  const speedKmh = Math.round(speedMs * 3.6 * 10) / 10

  return {
    speedMs: Math.round(speedMs * 100) / 100,
    speedKmh,
    distanceMeters: Math.round(distanceMeters * 10) / 10,
    timeDeltaSec,
  }
}

/**
 * Projects current estimated coordinates and expanding search radius based
 * on elapsed offline duration and pre-loss average walk speed.
 * 
 * Mathematical Formulation:
 *   d = v_walk * t_offline
 *   R_search = base_accuracy + (v_walk * t_offline * 1.15)
 * 
 * @param {object} lastKnownFix - { lat, lng, timestampMs, accuracyM }
 * @param {number} speedMs - walking speed in meters/second
 * @param {number} headingDeg - direction of travel in degrees
 * @param {number} currentTimestampMs - current timestamp in ms
 * @returns {object} DeadReckoningProjection
 */
export function projectDeadReckoningKinematics(lastKnownFix, speedMs = 1.25, headingDeg = 45, currentTimestampMs = Date.now()) {
  const offlineSec = Math.max(0, (currentTimestampMs - (lastKnownFix.timestampMs || currentTimestampMs)) / 1000)
  const distanceTraveledMeters = speedMs * offlineSec

  const headingRad = (headingDeg * Math.PI) / 180
  const dLat = (distanceTraveledMeters * Math.cos(headingRad)) / 111_320
  const dLng =
    (distanceTraveledMeters * Math.sin(headingRad)) /
    (111_320 * Math.cos((lastKnownFix.lat * Math.PI) / 180))

  const estimatedLat = lastKnownFix.lat + dLat
  const estimatedLng = lastKnownFix.lng + dLng

  const baseAccuracy = lastKnownFix.accuracyM || 15
  const searchRadiusM = Math.round(baseAccuracy + distanceTraveledMeters * 1.2)

  return {
    lastKnownLat: lastKnownFix.lat,
    lastKnownLng: lastKnownFix.lng,
    estimatedLat: Math.round(estimatedLat * 100000) / 100000,
    estimatedLng: Math.round(estimatedLng * 100000) / 100000,
    distanceTraveledMeters: Math.round(distanceTraveledMeters * 10) / 10,
    searchRadiusM: Math.min(3000, Math.max(30, searchRadiusM)),
    speedKmh: Math.round(speedMs * 3.6 * 10) / 10,
    speedMs,
    headingDeg,
    offlineSec: Math.round(offlineSec),
  }
}

/**
 * ── Legacy / Scenario Runner Compatibility Helpers ──
 */
export function initDeadReckoning(lastLat, lastLng) {
  return {
    estimatedLat: lastLat,
    estimatedLng: lastLng,
    radiusM: 10,
    speedMs: 1.25,
    headingDeg: 45,
    offlineSince: Date.now(),
    stepCount: 0,
  }
}

export function updateWithAccelerometer(state, ax, ay, az, dtMs) {
  const dtSec = dtMs / 1000
  const horizontalAcc = Math.sqrt(ax * ax + ay * ay)
  const speed = Math.min(horizontalAcc * dtSec, 3)
  const headingRad = Math.atan2(ay, ax)
  const headingDeg = ((headingRad * (180 / Math.PI)) + 360) % 360

  const dLat = (speed * Math.cos(headingRad)) / 111_320
  const dLng = (speed * Math.sin(headingRad)) / (111_320 * Math.cos((state.estimatedLat * Math.PI) / 180))
  const offlineSecs = (Date.now() - state.offlineSince) / 1000
  const radiusM = 10 + offlineSecs * 2

  return {
    ...state,
    estimatedLat: state.estimatedLat + dLat,
    estimatedLng: state.estimatedLng + dLng,
    radiusM: Math.round(radiusM * 10) / 10,
    speedMs: Math.round(speed * 100) / 100,
    headingDeg: Math.round(headingDeg),
    stepCount: state.stepCount + 1,
  }
}

export function simulateStep(state, speedMs = 1.2, headingDeg = 45, dtMs = 1000) {
  const headingRad = (headingDeg * Math.PI) / 180
  const dtSec = dtMs / 1000
  const dLat = (speedMs * dtSec * Math.cos(headingRad)) / 111_320
  const dLng = (speedMs * dtSec * Math.sin(headingRad)) / (111_320 * Math.cos((state.estimatedLat * Math.PI) / 180))
  const offlineSecs = (Date.now() - state.offlineSince) / 1000

  return {
    ...state,
    estimatedLat: state.estimatedLat + dLat,
    estimatedLng: state.estimatedLng + dLng,
    radiusM: 10 + offlineSecs * 2,
    speedMs,
    headingDeg,
    stepCount: state.stepCount + 1,
  }
}

export function radiusToCircleGeoJSON(lat, lng, radiusM, points = 32) {
  const coords = []
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI
    const dLat = (radiusM * Math.cos(angle)) / 111_320
    const dLng = (radiusM * Math.sin(angle)) / (111_320 * Math.cos((lat * Math.PI) / 180))
    coords.push([lng + dLng, lat + dLat])
  }
  return { type: 'Polygon', coordinates: [coords] }
}
