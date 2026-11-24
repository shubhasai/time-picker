/**
 * Astronomical solar & lunar ephemeris, expanded 25-country timezone catalog,
 * geographic coordinate lookup, and 3D horizon / orrery vector transforms.
 */
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export const COUNTRY_TIMEZONES = [
  { id: 'local', country: 'Local', city: 'Auto', label: 'Local Timezone', offsetHours: null, latDeg: null, lonDeg: null },
  { id: 'US-W', country: 'USA (West)', city: 'Los Angeles', label: 'USA West · Los Angeles (-08:00)', offsetHours: -8, latDeg: 34.05, lonDeg: -118.24 },
  { id: 'US-C', country: 'USA (Central)', city: 'Chicago', label: 'USA Central · Chicago (-06:00)', offsetHours: -6, latDeg: 41.88, lonDeg: -87.63 },
  { id: 'US-E', country: 'USA (East)', city: 'New York', label: 'USA East · New York (-05:00)', offsetHours: -5, latDeg: 40.71, lonDeg: -74.01 },
  { id: 'CA', country: 'Canada', city: 'Toronto', label: 'Canada · Toronto (-05:00)', offsetHours: -5, latDeg: 43.65, lonDeg: -79.38 },
  { id: 'MX', country: 'Mexico', city: 'Mexico City', label: 'Mexico · Mexico City (-06:00)', offsetHours: -6, latDeg: 19.43, lonDeg: -99.13 },
  { id: 'BR', country: 'Brazil', city: 'São Paulo', label: 'Brazil · São Paulo (-03:00)', offsetHours: -3, latDeg: -23.55, lonDeg: -46.63 },
  { id: 'AR', country: 'Argentina', city: 'Buenos Aires', label: 'Argentina · Buenos Aires (-03:00)', offsetHours: -3, latDeg: -34.60, lonDeg: -58.38 },
  { id: 'GB', country: 'United Kingdom', city: 'London', label: 'United Kingdom · London (00:00)', offsetHours: 0, latDeg: 51.51, lonDeg: -0.13 },
  { id: 'ES', country: 'Spain', city: 'Madrid', label: 'Spain · Madrid (+01:00)', offsetHours: 1, latDeg: 40.42, lonDeg: -3.70 },
  { id: 'FR', country: 'France', city: 'Paris', label: 'France · Paris (+01:00)', offsetHours: 1, latDeg: 48.86, lonDeg: 2.35 },
  { id: 'DE', country: 'Germany', city: 'Berlin', label: 'Germany · Berlin (+01:00)', offsetHours: 1, latDeg: 52.52, lonDeg: 13.40 },
  { id: 'IT', country: 'Italy', city: 'Rome', label: 'Italy · Rome (+01:00)', offsetHours: 1, latDeg: 41.90, lonDeg: 12.50 },
  { id: 'EG', country: 'Egypt', city: 'Cairo', label: 'Egypt · Cairo (+02:00)', offsetHours: 2, latDeg: 30.04, lonDeg: 31.24 },
  { id: 'ZA', country: 'South Africa', city: 'Cape Town', label: 'South Africa · Cape Town (+02:00)', offsetHours: 2, latDeg: -33.92, lonDeg: 18.42 },
  { id: 'KE', country: 'Kenya', city: 'Nairobi', label: 'Kenya · Nairobi (+03:00)', offsetHours: 3, latDeg: -1.29, lonDeg: 36.82 },
  { id: 'SA', country: 'Saudi Arabia', city: 'Riyadh', label: 'Saudi Arabia · Riyadh (+03:00)', offsetHours: 3, latDeg: 24.71, lonDeg: 46.68 },
  { id: 'RU', country: 'Russia', city: 'Moscow', label: 'Russia · Moscow (+03:00)', offsetHours: 3, latDeg: 55.76, lonDeg: 37.62 },
  { id: 'AE', country: 'UAE', city: 'Dubai', label: 'UAE · Dubai (+04:00)', offsetHours: 4, latDeg: 25.20, lonDeg: 55.27 },
  { id: 'IN', country: 'India', city: 'New Delhi', label: 'India · IST (+05:30)', offsetHours: 5.5, latDeg: 28.61, lonDeg: 77.21 },
  { id: 'TH', country: 'Thailand', city: 'Bangkok', label: 'Thailand · Bangkok (+07:00)', offsetHours: 7, latDeg: 13.76, lonDeg: 100.50 },
  { id: 'ID', country: 'Indonesia', city: 'Jakarta', label: 'Indonesia · Jakarta (+07:00)', offsetHours: 7, latDeg: -6.21, lonDeg: 106.85 },
  { id: 'CN', country: 'China', city: 'Beijing', label: 'China · Beijing (+08:00)', offsetHours: 8, latDeg: 39.90, lonDeg: 116.41 },
  { id: 'JP', country: 'Japan', city: 'Tokyo', label: 'Japan · Tokyo (+09:00)', offsetHours: 9, latDeg: 35.68, lonDeg: 139.65 },
  { id: 'AU', country: 'Australia', city: 'Sydney', label: 'Australia · Sydney (+10:00)', offsetHours: 10, latDeg: -33.87, lonDeg: 151.21 },
  { id: 'NZ', country: 'New Zealand', city: 'Auckland', label: 'New Zealand · Auckland (+12:00)', offsetHours: 12, latDeg: -36.85, lonDeg: 174.76 }
];

const IANA_TO_COUNTRY = {
  'America/Los_Angeles': 'US-W',
  'America/Vancouver': 'US-W',
  'America/Chicago': 'US-C',
  'America/Mexico_City': 'MX',
  'America/New_York': 'US-E',
  'America/Toronto': 'CA',
  'America/Sao_Paulo': 'BR',
  'America/Argentina/Buenos_Aires': 'AR',
  'Europe/London': 'GB',
  'Europe/Madrid': 'ES',
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE',
  'Europe/Zurich': 'DE',
  'Europe/Rome': 'IT',
  'Africa/Cairo': 'EG',
  'Africa/Johannesburg': 'ZA',
  'Africa/Nairobi': 'KE',
  'Asia/Riyadh': 'SA',
  'Europe/Moscow': 'RU',
  'Asia/Dubai': 'AE',
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
  'Asia/Bangkok': 'TH',
  'Asia/Jakarta': 'ID',
  'Asia/Shanghai': 'CN',
  'Asia/Tokyo': 'JP',
  'Australia/Sydney': 'AU',
  'Pacific/Auckland': 'NZ'
};

export function detectLocalTimezone() {
  let iana = 'UTC';
  try {
    iana = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (_) {}
  const offsetHours = -new Date().getTimezoneOffset() / 60;
  const mappedId = IANA_TO_COUNTRY[iana];
  if (mappedId) {
    const c = COUNTRY_TIMEZONES.find((item) => item.id === mappedId);
    if (c) {
      return {
        iana,
        matchedId: c.id,
        country: c.country,
        offsetHours,
        latDeg: c.latDeg,
        lonDeg: c.lonDeg
      };
    }
  }
  const lonDeg = offsetHours * 15;
  const byOffset = COUNTRY_TIMEZONES.find((c) => c.offsetHours === offsetHours);
  return {
    iana,
    matchedId: byOffset ? byOffset.id : 'local',
    country: byOffset ? byOffset.country : iana,
    offsetHours,
    latDeg: byOffset ? byOffset.latDeg : 30.0,
    lonDeg: byOffset ? byOffset.lonDeg : lonDeg
  };
}

export function resolveLocationFromLatLon(latDeg, lonDeg) {
  let best = null;
  let bestDist = Infinity;

  for (const c of COUNTRY_TIMEZONES) {
    if (c.id === 'local') continue;
    const dLat = latDeg - c.latDeg;
    let dLon = lonDeg - c.lonDeg;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const dist = Math.hypot(dLat, dLon * Math.cos(latDeg * RAD));
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }

  if (best && bestDist <= 18) {
    return best;
  }

  const offsetHours = Math.max(-12, Math.min(14, Math.round(lonDeg / 15)));
  const latStr = `${Math.abs(latDeg).toFixed(1)}°${latDeg >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lonDeg).toFixed(1)}°${lonDeg >= 0 ? 'E' : 'W'}`;
  return {
    id: 'custom',
    country: `Meridian ${lonStr}`,
    city: latStr,
    label: `Custom (${latStr}, ${lonStr}) · ${formatOffsetLabel(offsetHours)}`,
    offsetHours,
    latDeg,
    lonDeg
  };
}

export function formatOffsetLabel(offsetHours) {
  const sign = offsetHours >= 0 ? '+' : '-';
  const abs = Math.abs(offsetHours);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  return `UTC${sign}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function formatMeridianLabel(lonDeg) {
  const abs = Math.abs(lonDeg);
  const hemi = lonDeg >= 0 ? 'E' : 'W';
  return `${abs.toFixed(1)}°${hemi}`;
}

function norm360(deg) {
  return ((deg % 360) + 360) % 360;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function equatorialToHorizon(haDeg, decDeg, latDeg) {
  const ha = haDeg * RAD;
  const dec = decDeg * RAD;
  const lat = latDeg * RAD;

  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha);
  const altRad = Math.asin(clamp(sinAlt, -1, 1));

  const yAz = -Math.cos(dec) * Math.sin(ha);
  const xAz = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(ha);
  const azRad = Math.atan2(yAz, xAz);

  const cosAlt = Math.cos(altRad);
  const vec = [
    cosAlt * Math.sin(azRad),   // +X = East
    Math.sin(altRad),           // +Y = Zenith
    -cosAlt * Math.cos(azRad)   // -Z = North, +Z = South
  ];

  return {
    altDeg: altRad * DEG,
    azDeg: norm360(azRad * DEG),
    vec
  };
}

export function orreryVector(haDeg, decDeg) {
  const ha = haDeg * RAD;
  const dec = decDeg * RAD;
  const cosD = Math.cos(dec);
  return [
    -Math.sin(ha) * cosD,
    Math.sin(dec),
    Math.cos(ha) * cosD
  ];
}

function lunarPhaseName(elongDeg) {
  const e = norm360(elongDeg);
  if (e < 22.5 || e >= 337.5) return 'NEW MOON';
  if (e < 67.5) return 'WAXING CRESCENT';
  if (e < 112.5) return 'FIRST QUARTER';
  if (e < 157.5) return 'WAXING GIBBOUS';
  if (e < 202.5) return 'FULL MOON';
  if (e < 247.5) return 'WANING GIBBOUS';
  if (e < 292.5) return 'LAST QUARTER';
  return 'WANING CRESCENT';
}

export function computeSkyFactors(sunAltDeg, sunHaDeg) {
  const dayFactor = smoothstep(-5, 14, sunAltDeg);
  const twilightFactor = Math.exp(-Math.pow((sunAltDeg + 0.5) / 7.2, 2));
  let skyState = 'NIGHT';
  if (sunAltDeg >= 6) {
    skyState = 'DAY';
  } else if (sunAltDeg >= -7) {
    skyState = norm360(sunHaDeg) >= 180 ? 'DAWN' : 'DUSK';
  }
  return { dayFactor, twilightFactor, skyState };
}

export function computeCelestialState({
  year,
  month,
  day,
  hour,
  minute,
  tzOffsetHours,
  observerLatDeg,
  observerLonDeg
}) {
  const localHours = hour + minute / 60;
  const utcHours = localHours - tzOffsetHours;

  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  const jd =
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    utcHours / 24 +
    B -
    1524.5;
  const d = jd - 2451545.0;

  const g = norm360(357.529 + 0.98560028 * d);
  const q = norm360(280.459 + 0.98564736 * d);
  const sunLon = norm360(q + 1.915 * Math.sin(g * RAD) + 0.02 * Math.sin(2 * g * RAD));
  const eps = 23.439 - 0.00000036 * d;

  const sunRaRad = Math.atan2(
    Math.cos(eps * RAD) * Math.sin(sunLon * RAD),
    Math.cos(sunLon * RAD)
  );
  const sunDecDeg = Math.asin(clamp(Math.sin(eps * RAD) * Math.sin(sunLon * RAD), -1, 1)) * DEG;
  const sunRaDeg = norm360(sunRaRad * DEG);

  const lm = norm360(218.316 + 13.176396 * d);
  const mm = norm360(134.963 + 13.064993 * d);
  const fm = norm360(93.272 + 13.22935 * d);
  const moonLon = norm360(lm + 6.289 * Math.sin(mm * RAD));
  const moonLat = 5.128 * Math.sin(fm * RAD);

  const cl = Math.cos(moonLon * RAD);
  const sl = Math.sin(moonLon * RAD);
  const cb = Math.cos(moonLat * RAD);
  const sb = Math.sin(moonLat * RAD);
  const ce = Math.cos(eps * RAD);
  const se = Math.sin(eps * RAD);

  const xEq = cb * cl;
  const yEq = ce * cb * sl - se * sb;
  const zEq = se * cb * sl + ce * sb;

  const moonRaDeg = norm360(Math.atan2(yEq, xEq) * DEG);
  const moonDecDeg = Math.asin(clamp(zEq, -1, 1)) * DEG;

  const elongationDeg = norm360(moonLon - sunLon);
  const moonIllumination = (1 - Math.cos(elongationDeg * RAD)) / 2;

  const tzLonDeg = observerLonDeg !== undefined && observerLonDeg !== null
    ? observerLonDeg
    : tzOffsetHours * 15;
  const gmstDeg = norm360(280.46061837 + 360.98564736629 * d);
  const lstDeg = norm360(gmstDeg + tzLonDeg);

  const sunHaDeg = norm360(lstDeg - sunRaDeg);
  const moonHaDeg = norm360(lstDeg - moonRaDeg);

  const sunHorizon = equatorialToHorizon(sunHaDeg, sunDecDeg, observerLatDeg);
  const moonHorizon = equatorialToHorizon(moonHaDeg, moonDecDeg, observerLatDeg);

  const sunOrreryDir = orreryVector(sunHaDeg, sunDecDeg);
  const moonOrreryDir = orreryVector(moonHaDeg, moonDecDeg);

  const { dayFactor, twilightFactor, skyState } = computeSkyFactors(sunHorizon.altDeg, sunHaDeg);

  return {
    tzOffsetHours,
    tzLonDeg,
    observerLatDeg,
    lstDeg,
    sunRaDeg,
    sunDecDeg,
    sunHaDeg,
    moonRaDeg,
    moonDecDeg,
    moonHaDeg,
    sunHorizon,
    moonHorizon,
    sunOrreryDir,
    moonOrreryDir,
    moonIllumination,
    moonPhaseName: lunarPhaseName(elongationDeg),
    elongationDeg,
    dayFactor,
    twilightFactor,
    skyState,
    isPM: hour >= 12
  };
}

/**
 * Deterministic natural local sky/weather condition derived from date, meridian,
 * and solar elevation for the Observatory Room exterior window view.
 */
export function computeWeatherCondition(state, celestial) {
  const dayFactor = celestial ? celestial.dayFactor : 0.8;
  const skyState = celestial ? celestial.skyState : 'DAY';

  const seed =
    (state.year || 2026) * 372.13 +
    (state.month || 1) * 31.7 +
    (state.day || 1) * 7.31 +
    Math.round((state.tzOffsetHours || 0) * 4) * 19.3;
  const frac = Math.abs(Math.sin(seed) * 43758.5453123) % 1;

  let id = 'clear';
  let cloudCover = 0.22;
  let rainIntensity = 0;

  if (frac < 0.60) {
    id = 'clear';
    cloudCover = 0.16 + (frac / 0.60) * 0.18;
  } else if (frac < 0.85) {
    id = 'cloudy';
    cloudCover = 0.56 + ((frac - 0.60) / 0.25) * 0.20;
  } else {
    id = 'rain';
    cloudCover = 0.78 + ((frac - 0.85) / 0.15) * 0.14;
    rainIntensity = 0.65 + ((frac - 0.85) / 0.15) * 0.35;
  }

  let label = 'CLEAR DAY';
  if (skyState === 'NIGHT') {
    label = id === 'rain' ? 'NIGHT RAIN' : id === 'cloudy' ? 'CLOUDY NIGHT' : frac < 0.30 ? 'STARRY NIGHT' : 'CLEAR NIGHT';
  } else if (skyState === 'DAWN' || skyState === 'DUSK') {
    if (id === 'rain') label = `${skyState} RAIN`;
    else if (id === 'cloudy') label = `CLOUDY ${skyState}`;
    else label = `GOLDEN ${skyState}`;
  } else {
    label = id === 'rain' ? 'LIGHT RAIN' : id === 'cloudy' ? 'PARTLY CLOUDY' : 'CLEAR DAY';
  }

  return {
    id,
    label,
    cloudCover,
    rainIntensity,
    isNight: dayFactor < 0.22
  };
}
