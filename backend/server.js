import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const port = Number(process.env.PORT || 8000);
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;
const STALE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FORECAST_CACHE_TTL_MS = 30 * 60 * 1000;
const NASA_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point';
const OPEN_METEO_FORECAST = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const OPEN_METEO_GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';
const MET_FORECAST = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:8080,https://simpleweather-1.onrender.com')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: origins }));
app.use(express.json());

function cacheGet(key, allowStale = false) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt >= Date.now()) return entry.value;
  if (allowStale && entry.staleUntil >= Date.now()) return entry.value;
  if (entry.staleUntil < Date.now()) {
    cache.delete(key);
  }
  return null;
}

function cacheSet(key, value, ttl = CACHE_TTL_MS, staleTtl = STALE_CACHE_TTL_MS) {
  const now = Date.now();
  cache.set(key, { value, expiresAt: now + ttl, staleUntil: now + ttl + staleTtl });
  return value;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const pendingRequests = new Map();

function dedupeFetch(key, fetcher) {
  if (pendingRequests.has(key)) return pendingRequests.get(key);
  const promise = fetcher().finally(() => pendingRequests.delete(key));
  pendingRequests.set(key, promise);
  return promise;
}

async function fetchJson(url, options = {}) {
  return dedupeFetch(url, async () => {
    const maxRetries = 1;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(8000),
          headers: { Accept: 'application/json', ...options.headers },
        });

        if (response.status === 429) {
          if (attempt === maxRetries) {
            const error = new Error('Weather provider returned 429 (rate limited)');
            error.status = 429;
            const retryAfter = Number(response.headers.get('Retry-After'));
            if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = Math.ceil(retryAfter);
            throw error;
          }
          const retryAfter = Number(response.headers.get('Retry-After'));
          const delay = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 5000)
            : Math.min(1000 * 2 ** attempt, 5000);
          await sleep(delay);
          continue;
        }

        if (!response.ok) {
          throw new Error(`Weather provider returned ${response.status}`);
        }

        return response.json();
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) break;
        const delay = Math.min(1000 * 2 ** attempt, 5000);
        await sleep(delay);
      }
    }

    throw lastError || new Error('Weather provider request failed');
  });
}

function validateCoordinates(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function simulateHourlyTemps(minTemp, maxTemp) {
  if (![minTemp, maxTemp].every(Number.isFinite)) {
    return Array.from({ length: 24 }, (_, hour) => ({ hour: `${hour}:00`, temp: 0 }));
  }
  const amplitude = (maxTemp - minTemp) / 2;
  const average = minTemp + amplitude;
  return Array.from({ length: 24 }, (_, hour) => ({
    hour: `${hour}:00`,
    temp: Number((average + amplitude * Math.sin((hour - 10) * (Math.PI / 12))).toFixed(1)),
  }));
}

function rainProbability(precipitation) {
  return precipitation > 0.1 ? Math.min(100, Math.floor(20 + precipitation * 10)) : 0;
}

function metWeatherCode(symbol = '') {
  const code = symbol.toLowerCase();
  if (code.includes('thunder')) return 95;
  if (code.includes('snow')) return 71;
  if (code.includes('sleet')) return 66;
  if (code.includes('rain') || code.includes('shower')) return 61;
  if (code.includes('fog')) return 45;
  if (code.includes('cloudy')) return 3;
  if (code.includes('partly') || code.includes('fair')) return 2;
  return 0;
}

async function getMetForecast(lat, lon, date) {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  const data = await fetchJson(`${MET_FORECAST}?${params}`, {
    headers: {
      'User-Agent': process.env.WEATHER_USER_AGENT || 'SimpleWeather/1.0 (weather application)',
    },
  });
  const points = data?.properties?.timeseries || [];
  const byDate = new Map();
  for (const point of points) {
    const day = point.time.slice(0, 10);
    const details = point.data?.instant?.details || {};
    const temperature = Number(details.air_temperature);
    if (!Number.isFinite(temperature)) continue;
    const nextHour = point.data?.next_1_hours;
    const precipitation = Number(nextHour?.details?.precipitation_amount || 0);
    const symbol = nextHour?.summary?.symbol_code || '';
    if (!byDate.has(day)) byDate.set(day, []);
    byDate.get(day).push({
      time: point.time,
      temperature,
      apparentTemp: Number(details.air_temperature),
      humidity: Number(details.relative_humidity),
      wind: Number(details.wind_speed) * 3.6,
      cloudCover: Number(details.cloud_area_fraction),
      precipitation: Number.isFinite(precipitation) ? precipitation : 0,
      weatherCode: metWeatherCode(symbol),
    });
  }

  const days = [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right));
  const targetIndex = days.findIndex(([day]) => day === date);
  if (targetIndex < 0) throw new Error('Fallback weather provider returned no data for the requested date');

  const toDaily = ([day, entries]) => {
    const max = Math.max(...entries.map((entry) => entry.temperature));
    const min = Math.min(...entries.map((entry) => entry.temperature));
    const rain = entries.reduce((sum, entry) => sum + entry.precipitation, 0);
    return {
      date: day,
      max: Number(max.toFixed(1)),
      min: Number(min.toFixed(1)),
      rainProb: rainProbability(rain),
      weatherCode: entries[Math.floor(entries.length / 2)]?.weatherCode ?? 0,
    };
  };
  const target = toDaily(days[targetIndex]);
  const hourly = days[targetIndex][1].slice(0, 24).map((entry) => ({
    hour: entry.time.slice(11, 16),
    temp: entry.temperature,
    apparentTemp: entry.apparentTemp,
    humidity: Number.isFinite(entry.humidity) ? Math.round(entry.humidity) : undefined,
    wind: Number.isFinite(entry.wind) ? Number(entry.wind.toFixed(1)) : undefined,
    cloudCover: Number.isFinite(entry.cloudCover) ? Math.round(entry.cloudCover) : undefined,
    precipitation: entry.precipitation,
    rainProb: undefined,
    uv: undefined,
  }));
  return {
    main_day: target,
    forecast: days.slice(targetIndex + 1, targetIndex + 5).map(toDaily),
    hourly_data: hourly,
  };
}

async function getHistoricalYear(lat, lon, targetDate) {
  const date = targetDate.toISOString().slice(0, 10).replaceAll('-', '');
  const params = new URLSearchParams({
    parameters: 'T2M_MAX,T2M_MIN,PRECTOTCORR,WS10M',
    community: 'AG', longitude: String(lon), latitude: String(lat),
    start: date, end: date, format: 'JSON',
  });
  if (process.env.NASA_API_KEY) params.set('api_key', process.env.NASA_API_KEY);

  const data = await fetchJson(`${NASA_URL}?${params}`);
  const values = data?.properties?.parameter || {};
  const max = Number(values.T2M_MAX?.[date]);
  const min = Number(values.T2M_MIN?.[date]);
  const rain = Number(values.PRECTOTCORR?.[date]);
  const wind = Number(values.WS10M?.[date]);
  if (![max, min, rain, wind].every(Number.isFinite)) return null;
  return {
    date: targetDate.toISOString().slice(0, 10),
    temp: Number(((max + min) / 2).toFixed(1)),
    min: Number(min.toFixed(1)), max: Number(max.toFixed(1)), rain: Number(rain.toFixed(1)),
    rainProb: rainProbability(rain), wind: Number(wind.toFixed(1)),
    hourly_data: simulateHourlyTemps(min, max),
  };
}

function recommendations(summary, language = 'en') {
  if (language === 'es') {
    const result = [];
    if (summary.max > 28 && summary.rainProb > 40) result.push('Historial de calor y lluvia. Considera ropa ligera e impermeable y mantente hidratado.');
    else if (summary.min < 10 && summary.rainProb > 40) result.push('Historial de frío y lluvia. Usa varias capas y un abrigo impermeable.');
    if (summary.rainProb > 60) result.push('Alta probabilidad histórica de lluvia. No olvides tu paraguas.');
    else if (summary.rainProb > 30) result.push('Lluvias históricas dispersas. Un impermeable sería buena idea.');
    if (summary.max > 30 && !result.some((item) => item.includes('calor'))) result.push('Día históricamente caluroso. Busca sombra y usa protector solar.');
    else if (summary.min < 10 && !result.some((item) => item.includes('frío'))) result.push('Día históricamente frío. Abrígate bien.');
    if (summary.wind > 25) result.push('Vientos históricamente fuertes. Asegura los objetos sueltos.');
    return result.length ? result : ['El clima suele ser agradable, sin condiciones extremas destacables.'];
  }
  const result = [];
  if (summary.max > 28 && summary.rainProb > 40) result.push('Heat and rain history. Consider light, waterproof clothing and stay hydrated.');
  else if (summary.min < 10 && summary.rainProb > 40) result.push('Cold and rain history. Dress in layers with a waterproof coat.');
  if (summary.rainProb > 60) result.push("High historical rainfall probability. Don't forget your umbrella.");
  else if (summary.rainProb > 30) result.push('Scattered historical rainfall. A raincoat would be a good idea.');
  if (summary.max > 30 && !result.some((item) => item.includes('Heat'))) result.push('Historically hot day. Seek shade and use sunscreen.');
  else if (summary.min < 10 && !result.some((item) => item.includes('Cold'))) result.push('Historically cold day. Be sure to bundle up.');
  if (summary.wind > 25) result.push('Historically strong winds. Secure loose objects.');
  return result.length ? result : ['Weather is usually pleasant, with no notable extreme conditions.'];
}

function normalizeGeocodingResults(results) {
  return results
    .map((item) => ({
      id: item.id ?? `${item.latitude},${item.longitude}`,
      city: item.name,
      country: item.country ?? '',
      admin1: item.admin1 ?? '',
      lat: Number(item.latitude),
      lng: Number(item.longitude),
      type: item.type ?? '',
    }))
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
}

app.get('/search', async (request, response) => {
  const query = request.query.q?.trim();
  if (!query || query.length < 2) {
    return response.status(400).json({ error: 'Search query is required (minimum 2 characters).' });
  }

  const language = request.query.lang === 'en' ? 'en' : 'es';
  const params = new URLSearchParams({
    name: query,
    count: '8',
    language,
    format: 'json',
  });

  const cacheKey = `search:${query.toLowerCase()}:${language}`;
  const cached = cacheGet(cacheKey);
  if (cached) return response.json(cached);

  try {
    const data = await fetchJson(`${OPEN_METEO_GEOCODING}?${params}`);
    const results = normalizeGeocodingResults(data?.results || []);
    return response.json(cacheSet(cacheKey, { results }, CACHE_TTL_MS * 3));
  } catch (error) {
    console.error('Geocoding error:', error.message);
    return response.status(502).json({ error: 'Could not retrieve place suggestions.' });
  }
});

app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'simpleweather-api' }));

app.get('/weather', async (request, response) => {
  const lat = Number(request.query.lat);
  const lon = Number(request.query.lon);
  const day = Number(request.query.day);
  const month = Number(request.query.month);
  const year = Number(request.query.year);
  const language = request.query.lang === 'en' ? 'en' : 'es';
  if (!validateCoordinates(lat, lon) || !Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return response.status(400).json({ error: 'Invalid location or date.' });
  }
  const key = `history:${lat.toFixed(3)}:${lon.toFixed(3)}:${day}:${month}:${year}:${language}`;
  const cached = cacheGet(key);
  if (cached) return response.json(cached);

  try {
    const dates = Array.from({ length: 5 }, (_, index) => new Date(Date.UTC(year - index - 1, month - 1, day)));
    const historical = (await Promise.all(dates.map((date) => getHistoricalYear(lat, lon, date)))).filter(Boolean);
    if (!historical.length) return response.status(502).json({ error: 'Historical data could not be obtained.' });
    const summary = {
      temp: Number((historical.reduce((sum, item) => sum + item.temp, 0) / historical.length).toFixed(1)),
      min: Number((historical.reduce((sum, item) => sum + item.min, 0) / historical.length).toFixed(1)),
      max: Number((historical.reduce((sum, item) => sum + item.max, 0) / historical.length).toFixed(1)),
      rain: Number((historical.reduce((sum, item) => sum + item.rain, 0) / historical.length).toFixed(1)),
      rainProb: Math.round(historical.reduce((sum, item) => sum + item.rainProb, 0) / historical.length),
      wind: Math.round(historical.reduce((sum, item) => sum + item.wind, 0) / historical.length),
      hourly_data: historical[0].hourly_data,
    };
    return response.json(cacheSet(key, { historical_summary: summary, historical_yearly_data: historical,     recommendations: recommendations(summary, language) }));
  } catch (error) {
    console.error('Historical weather error:', error.message);
    return response.status(502).json({ error: 'Historical data could not be obtained.' });
  }
});

app.get('/forecast', async (request, response) => {
  const lat = Number(request.query.lat);
  const lon = Number(request.query.lon);
  const date = String(request.query.date || '');
  const target = new Date(`${date}T00:00:00Z`);
  if (!validateCoordinates(lat, lon) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(target.getTime())) {
    return response.status(400).json({ error: 'Invalid location or date.' });
  }
  const daysFromToday = Math.floor((target.getTime() - Date.now()) / 86400000);
  if (daysFromToday > 10) return response.json({ status: 'unavailable', message: 'Forecast not available for dates more than 10 days in advance.' });
  const key = `forecast:${lat.toFixed(3)}:${lon.toFixed(3)}:${date}`;
  const cached = cacheGet(key);
  if (cached) return response.json(cached);

  const isArchive = daysFromToday < -90;
  const endDate = isArchive ? date : new Date(target.getTime() + 4 * 86400000).toISOString().slice(0, 10);
  const params = new URLSearchParams({ latitude: String(lat), longitude: String(lon), daily: isArchive ? 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum' : 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,wind_speed_10m,cloud_cover,uv_index,weather_code', timezone: 'auto', start_date: date, end_date: endDate });
  try {
    let data;
    try {
      data = await fetchJson(`${isArchive ? OPEN_METEO_ARCHIVE : OPEN_METEO_FORECAST}?${params}`);
    } catch (error) {
      if (isArchive || error.status !== 429) throw error;
      console.warn('Open-Meteo rate limited; using MET Norway fallback');
      const fallback = await getMetForecast(lat, lon, date);
      return response.json(cacheSet(key, fallback, FORECAST_CACHE_TTL_MS));
    }
    const daily = data.daily;
    const probability = daily.precipitation_probability_max?.[0] ?? rainProbability(daily.precipitation_sum?.[0] ?? 0);
    const forecast = daily.time.slice(1).map((day, index) => ({ date: day, max: daily.temperature_2m_max[index + 1], min: daily.temperature_2m_min[index + 1], rainProb: daily.precipitation_probability_max?.[index + 1] ?? rainProbability(daily.precipitation_sum?.[index + 1] ?? 0), weatherCode: daily.weather_code[index + 1] }));
    const result = { main_day: { date: daily.time[0], max: daily.temperature_2m_max[0], min: daily.temperature_2m_min[0], rainProb: probability, weatherCode: daily.weather_code[0] }, forecast, hourly_data: data.hourly.time.slice(0, 24).map((time, index) => ({ hour: time.split('T')[1], temp: data.hourly.temperature_2m[index], apparentTemp: data.hourly.apparent_temperature?.[index], humidity: data.hourly.relative_humidity_2m?.[index], rainProb: data.hourly.precipitation_probability?.[index], precipitation: data.hourly.precipitation?.[index], wind: data.hourly.wind_speed_10m?.[index], cloudCover: data.hourly.cloud_cover?.[index], uv: data.hourly.uv_index?.[index], weatherCode: data.hourly.weather_code?.[index] })) };
    return response.json(cacheSet(key, result, FORECAST_CACHE_TTL_MS));
  } catch (error) {
    console.error('Forecast error:', error.message);
    if (error.status === 429) {
      const stale = cacheGet(key, true);
      if (stale) {
        response.set('X-Weather-Data', 'stale');
        return response.json(stale);
      }
      if (error.retryAfter) response.set('Retry-After', String(error.retryAfter));
      return response.status(503).json({ error: 'The weather provider is temporarily rate limited. Please try again shortly.' });
    }
    return response.status(502).json({ error: 'The weather forecast could not be obtained.' });
  }
});

app.listen(port, () => console.log(`SimpleWeather API listening on port ${port}`));
