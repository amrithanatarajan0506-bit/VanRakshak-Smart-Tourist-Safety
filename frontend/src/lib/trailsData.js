// Centralized Surveyed Trails & Safe Route Geodatabase for VanRakshak

export const SURVEYED_TRAILS = [
  {
    id: 'kasauli',
    slug: 'kasauli',
    name: 'Kasauli Pine Ridge Trail (KD-1)',
    region: 'Himachal Pradesh',
    state: 'Himachal Pradesh',
    difficulty: 'Moderate',
    season: 'Year-round',
    status: 'open',
    permit: 'NOT REQUIRED',
    distanceKm: 4.2,
    elevationGainM: 132,
    estDuration: '1h 15m',
    safetyRating: '100% Verified Safe',
    hazardBypass: 'Bypasses NH10 Northern Debris Zone',
    description: 'Scenic ridge walk through dense pine forests. Full VHF coverage and marked safe shelter waypoints.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCYTNsT9xxclbhQYcHJ6l68g5gJN2C61RhIVmIAyYdoLrLI_2aj1PWQimMU5068bzddhejHMUkmI1eqzMPxOhksg3vVD5JX8OdOX87o7nmD3icBJ5v6pPZ4rWQ5YSBB_nBGPsOGbAXoJLjZpFqJyum71JQbs4SMC5Xz80u1eWEFoiKWSBDTnjLOWczvIgpgwInma1MbLoC5GnHQMr68OkHFXTF2Pf981wdaKaabWfV-4q7ELa-ZJSB5',
    startPoint: {
      name: 'Upper Mall Road Trailhead (Start)',
      lat: 30.8950,
      lng: 76.9380,
      alt: '1,795m',
      desc: 'Registered trail entry point with ranger checkpoint & water station.',
    },
    endPoint: {
      name: 'Sunset Point Overlook (Destination)',
      lat: 30.9080,
      lng: 76.9530,
      alt: '1,927m',
      desc: 'Safe summit destination with emergency solar beacon & helipad access.',
    },
    waypoints: [
      { name: 'Gilbert Nature Trail Junction', lat: 30.8985, lng: 76.9410, alt: '1,820m', type: 'rest', desc: 'Rest shelter & first aid box' },
      { name: 'Pine Crest Ranger Post (RANGER-02)', lat: 30.9015, lng: 76.9445, alt: '1,860m', type: 'ranger', desc: 'Active ranger post & LoRa relay node' },
      { name: 'Monkey Point Bypass Junction', lat: 30.9050, lng: 76.9490, alt: '1,910m', type: 'safe_turn', desc: 'Safe turn: Bypasses unstable northern rockface' },
    ],
    routePath: [
      [30.8950, 76.9380], // Start
      [30.8968, 76.9395],
      [30.8985, 76.9410], // WP1
      [30.9000, 76.9428],
      [30.9015, 76.9445], // WP2 (Ranger Post)
      [30.9035, 76.9468],
      [30.9050, 76.9490], // WP3
      [30.9065, 76.9510],
      [30.9080, 76.9530], // End
    ],
  },
  {
    id: 'dzukou',
    slug: 'dzukou',
    name: 'Dzukou Valley Safe Sanctuary Trail',
    region: 'Nagaland',
    state: 'Nagaland',
    difficulty: 'Moderate',
    season: 'May - Sept',
    status: 'open',
    permit: 'ILP REQUIRED',
    distanceKm: 8.6,
    elevationGainM: 602,
    estDuration: '3h 45m',
    safetyRating: '100% Verified Safe',
    hazardBypass: 'Bypasses Southern Fog Sink & Flash Flood Ravine',
    description: 'Rolling emerald hills and endemic lily sanctuary. Monitored with automated weather beacons and high-ridge safe bypass.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA7LJPjj39mUfoyyS7_RGn8AFh5kcvBh5sZnGN7Y4yiGc97wV0Z1zbSesafH1W3rvlZ_6AADgLU4rQegEsZiwHAG1-35vv-Jbc1F_P-oXlRNbUwzPleMZE2vjQxRGGrW2gs82RfsSUKB_6TouE9KsnRdl3iq10uHmaYwPStce-w_Yc75Nf9ShCeCq1Bc6LnLg1kcMfFX6enrGWwvaDUDM52Z8tCzpNlifXWDVjVo-I5OQZnB4pLLwGo',
    startPoint: {
      name: 'Viswema Village Trailhead Gate (Start)',
      lat: 25.5450,
      lng: 94.1350,
      alt: '1,850m',
      desc: 'Vehicle drop-off point with Inner Line Permit (ILP) verification kiosk.',
    },
    endPoint: {
      name: 'Dzukou Valley Base Camp (Destination)',
      lat: 25.5850,
      lng: 94.1120,
      alt: '2,452m',
      desc: 'Safe camping sanctuary with natural fresh spring and satellite communication unit.',
    },
    waypoints: [
      { name: 'Mossy Ascent Rest Point', lat: 25.5580, lng: 94.1280, alt: '2,100m', type: 'rest', desc: 'Rest benches and mountain spring water' },
      { name: 'Dzukou Ridge Crest (Lookout)', lat: 25.5700, lng: 94.1200, alt: '2,380m', type: 'ranger', desc: 'Forest department emergency radio post' },
      { name: 'Lily Meadow Boardwalk', lat: 25.5780, lng: 94.1150, alt: '2,410m', type: 'safe_turn', desc: 'Reinforced anti-erosion timber path' },
    ],
    routePath: [
      [25.5450, 94.1350], // Start
      [25.5520, 94.1310],
      [25.5580, 94.1280], // WP1
      [25.5640, 94.1240],
      [25.5700, 94.1200], // WP2
      [25.5750, 94.1170],
      [25.5780, 94.1150], // WP3
      [25.5820, 94.1130],
      [25.5850, 94.1120], // End
    ],
  },
  {
    id: 'goechala',
    slug: 'goechala',
    name: 'Goechala Himalayan Ridge Route',
    region: 'Sikkim',
    state: 'Sikkim',
    difficulty: 'Difficult',
    season: 'Oct - Nov',
    status: 'warning',
    permit: 'PAP REQUIRED',
    distanceKm: 14.2,
    elevationGainM: 1420,
    estDuration: '5h 30m',
    safetyRating: 'High Altitude Monitored',
    hazardBypass: 'Bypasses Unstable Prek Chu Moraine Path',
    description: 'High-altitude Himalayan route with majestic view of Mt. Kanchenjunga. Equipped with oxygen checkpoints and rapid evac waypoints.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAtZw4vDoswIYCmT7-DnAAaCp1bvQ_DXSATqab8WLPrkNVUkmp7biGfzHeYV_p3aNIYMwbXgP0PEk72efg7eYy-njc3xkZz5RmmTPcx3O2as_N13bI1F0hAwJpZH6SZb-qJUflzkPE0-03DA-H5_JCiVpMn6RhV5JnfuYDrn2jC7amhctdPyWWtXqMhWe8VOPKWFcywsjdNttXTQq-MH9A2qAZF11iO8Q9hBv891Q17YJnVJhK_ZblH',
    startPoint: {
      name: 'Yuksom Base Camp Gate (Start)',
      lat: 27.3710,
      lng: 88.2230,
      alt: '1,780m',
      desc: 'Historic capital trailhead with forest biometric check-in.',
    },
    endPoint: {
      name: 'Dzongri High Viewpoint (Destination)',
      lat: 27.4250,
      lng: 88.1850,
      alt: '4,030m',
      desc: 'Panoramic Kanchenjunga viewpoint with mountain rescue medical shelter.',
    },
    waypoints: [
      { name: 'Bakhim Forest Medic Station', lat: 27.3920, lng: 88.2100, alt: '2,650m', type: 'medic', desc: 'Permanent medic on duty with oxygen concentrator' },
      { name: 'Tshoka Alpine Settlement', lat: 27.4080, lng: 88.1980, alt: '3,050m', type: 'ranger', desc: 'Acclimatization halt & satellite phone hub' },
      { name: 'Phedang Ridge Shelter', lat: 27.4180, lng: 88.1910, alt: '3,680m', type: 'safe_turn', desc: 'Emergency windproof storm pod' },
    ],
    routePath: [
      [27.3710, 88.2230], // Start
      [27.3820, 88.2160],
      [27.3920, 88.2100], // WP1
      [27.4000, 88.2040],
      [27.4080, 88.1980], // WP2
      [27.4140, 88.1940],
      [27.4180, 88.1910], // WP3
      [27.4220, 88.1880],
      [27.4250, 88.1850], // End
    ],
  },
  {
    id: 'david-scott',
    slug: 'david-scott',
    name: 'David Scott Heritage River Trail',
    region: 'Meghalaya',
    state: 'Meghalaya',
    difficulty: 'Easy',
    season: 'Year-round',
    status: 'open',
    permit: 'NOT REQUIRED',
    distanceKm: 16.0,
    elevationGainM: 180,
    estDuration: '4h 30m',
    safetyRating: '100% Verified Safe',
    hazardBypass: 'Bypasses Flash-Flood Prone Lower Riverbed',
    description: 'Historic colonial horse-cart route winding through sacred groves, hanging bridges, and crystal clear river canyons.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCYTNsT9xxclbhQYcHJ6l68g5gJN2C61RhIVmIAyYdoLrLI_2aj1PWQimMU5068bzddhejHMUkmI1eqzMPxOhksg3vVD5JX8OdOX87o7nmD3icBJ5v6pPZ4rWQ5YSBB_nBGPsOGbAXoJLjZpFqJyum71JQbs4SMC5Xz80u1eWEFoiKWSBDTnjLOWczvIgpgwInma1MbLoC5GnHQMr68OkHFXTF2Pf981wdaKaabWfV-4q7ELa-ZJSB5',
    startPoint: {
      name: 'Mawphlang Sacred Grove Arch (Start)',
      lat: 25.4520,
      lng: 91.7580,
      alt: '1,820m',
      desc: 'Heritage entrance with cultural guide station & safety briefing board.',
    },
    endPoint: {
      name: 'Ladmawphlang Valley Exit (Destination)',
      lat: 25.3580,
      lng: 91.6850,
      alt: '1,510m',
      desc: 'Safe paved highway connection with taxi stand & emergency clinic.',
    },
    waypoints: [
      { name: 'Umngi River Suspension Bridge', lat: 25.4150, lng: 91.7320, alt: '1,640m', type: 'checkpoint', desc: 'Steel suspension bridge across river' },
      { name: 'Wah Umngi River Resting Grounds', lat: 25.3850, lng: 91.7100, alt: '1,580m', type: 'rest', desc: 'Clean fresh water spring & eco-shelters' },
    ],
    routePath: [
      [25.4520, 91.7580], // Start
      [25.4350, 25.4350 > 91 ? 91.7450 : 91.7450],
      [25.4150, 91.7320], // WP1
      [25.4000, 91.7200],
      [25.3850, 91.7100], // WP2
      [25.3700, 91.6980],
      [25.3580, 91.6850], // End
    ],
  },
]
