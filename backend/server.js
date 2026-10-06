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

const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:8080')
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

function recommendations(summary) {
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

app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'simpleweather-api' }));

app.get('/weather', async (request, response) => {
  const lat = Number(request.query.lat);
  const lon = Number(request.query.lon);
  const day = Number(request.query.day);
  const month = Number(request.query.month);
  const year = Number(request.query.year);
  if (!validateCoordinates(lat, lon) || !Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return response.status(400).json({ error: 'Invalid location or date.' });
  }
  const key = `history:${lat.toFixed(3)}:${lon.toFixed(3)}:${day}:${month}:${year}`;
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
    return response.json(cacheSet(key, { historical_summary: summary, historical_yearly_data: historical, recommendations: recommendations(summary) }));
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
  const params = new URLSearchParams({ latitude: String(lat), longitude: String(lon), daily: isArchive ? 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum' : 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', hourly: 'temperature_2m,weather_code', timezone: 'auto', start_date: date, end_date: endDate });
  try {
    const data = await fetchJson(`${isArchive ? OPEN_METEO_ARCHIVE : OPEN_METEO_FORECAST}?${params}`);
    const daily = data.daily;
    const probability = daily.precipitation_probability_max?.[0] ?? rainProbability(daily.precipitation_sum?.[0] ?? 0);
    const forecast = daily.time.slice(1).map((day, index) => ({ date: day, max: daily.temperature_2m_max[index + 1], min: daily.temperature_2m_min[index + 1], rainProb: daily.precipitation_probability_max?.[index + 1] ?? rainProbability(daily.precipitation_sum?.[index + 1] ?? 0), weatherCode: daily.weather_code[index + 1] }));
    const result = { main_day: { date: daily.time[0], max: daily.temperature_2m_max[0], min: daily.temperature_2m_min[0], rainProb: probability, weatherCode: daily.weather_code[0] }, forecast, hourly_data: data.hourly.time.slice(0, 24).map((time, index) => ({ hour: time.split('T')[1], temp: data.hourly.temperature_2m[index] })) };
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
