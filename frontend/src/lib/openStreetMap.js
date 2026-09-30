const GEOCODER_URL = 'https://photon.komoot.io/api/'
const WALKING_ROUTER_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving'

export async function geocodeDestination(query, near) {
  const params = new URLSearchParams({ q: query, limit: '5' })
  if (near) {
    params.set('lat', String(near.lat))
    params.set('lon', String(near.lng))
  }

  const response = await fetch(`${GEOCODER_URL}?${params}`)
  if (!response.ok) throw new Error('Destination search is unavailable. Retry in a moment.')

  const data = await response.json()
  return (data.features || []).map(feature => {
    const properties = feature.properties || {}
    const [lng, lat] = feature.geometry.coordinates
    const locality = [properties.city, properties.state, properties.country].filter(Boolean).join(', ')
    return {
      name: properties.name || properties.street || properties.city || 'Destination',
      label: [properties.name || properties.street, locality].filter(Boolean).join(', '),
      lat,
      lng,
    }
  })
}

const ROUTE_WORDS = {
  en: {
    start: 'Start', arrive: 'Arrive', turn: 'Turn', continue: 'Continue', merge: 'Merge',
    roundabout: 'Enter the roundabout', exitRoundabout: 'Exit the roundabout', onto: 'onto',
    left: 'left', right: 'right', straight: 'straight', slightLeft: 'slightly left', slightRight: 'slightly right',
    sharpLeft: 'sharp left', sharpRight: 'sharp right', uturn: 'make a U-turn',
  },
  ta: {
    start: 'தொடங்குங்கள்', arrive: 'வந்துவிட்டீர்கள்', turn: 'திரும்பவும்', continue: 'தொடரவும்', merge: 'இணையும் பாதையில் தொடரவும்',
    roundabout: 'சுற்றுவட்டத்தில் நுழையவும்', exitRoundabout: 'சுற்றுவட்டத்திலிருந்து வெளியேறவும்', onto: '',
    left: 'இடப்புறம்', right: 'வலப்புறம்', straight: 'நேராக', 'slight left': 'சிறிது இடப்புறம்', 'slight right': 'சிறிது வலப்புறம்',
    'sharp left': 'கூர்மையாக இடப்புறம்', 'sharp right': 'கூர்மையாக வலப்புறம்', uturn: 'திரும்பிச் செல்லவும்',
  },
  hi: {
    start: 'शुरू करें', arrive: 'पहुँच गए', turn: 'मुड़ें', continue: 'जारी रखें', merge: 'मिलती सड़क पर आगे बढ़ें',
    roundabout: 'गोल चक्कर में प्रवेश करें', exitRoundabout: 'गोल चक्कर से बाहर निकलें', onto: 'पर',
    left: 'बाएँ', right: 'दाएँ', straight: 'सीधे', 'slight left': 'हल्का बाएँ', 'slight right': 'हल्का दाएँ',
    'sharp left': 'तेज़ बाएँ', 'sharp right': 'तेज़ दाएँ', uturn: 'यू-टर्न लें',
  },
}

const formatInstruction = (step, language) => {
  const maneuver = step.maneuver || {}
  const words = ROUTE_WORDS[language] || ROUTE_WORDS.en
  const action = {
    depart: words.start,
    arrive: words.arrive,
    turn: words.turn,
    continue: words.continue,
    merge: words.merge,
    roundabout: words.roundabout,
    'exit roundabout': words.exitRoundabout,
    'new name': words.continue,
  }[maneuver.type] || words.continue
  const direction = maneuver.modifier
    ? ` ${words[maneuver.modifier] || maneuver.modifier}`
    : ''
  const street = step.name ? ` ${words.onto} ${step.name}` : ''
  return `${action}${direction}${street}`
}

export async function getWalkingRoutes(start, destination, language = 'en') {
  const coordinates = `${start.lng},${start.lat};${destination.lng},${destination.lat}`
  const params = new URLSearchParams({
    alternatives: 'true',
    steps: 'true',
    overview: 'full',
    geometries: 'geojson',
  })
  const response = await fetch(`${WALKING_ROUTER_URL}/${coordinates}?${params}`)
  if (!response.ok) throw new Error('Walking routes are unavailable for this destination.')

  const data = await response.json()
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('No walking route was found for this destination.')
  }

  return data.routes.map(route => ({
    distanceM: route.distance,
    durationSec: route.duration,
    coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    geometry: route.geometry,
    steps: route.legs.flatMap(leg => leg.steps.map(step => ({
      instruction: formatInstruction(step, language),
      distanceM: step.distance,
      location: step.maneuver?.location
        ? [step.maneuver.location[1], step.maneuver.location[0]]
        : null,
    }))),
  }))
}
