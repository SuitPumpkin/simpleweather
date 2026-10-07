import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { CalendarDays, ChevronDown, CloudRain, Download, LocateFixed, MapPin, Search, Wind, X } from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const today = new Date();
const translations = {
  en: {
    language: 'Español', live: 'live weather context', providers: 'NASA + Open-Meteo', plan: 'Plan your date',
    kicker: 'Plan with context', title: 'Will the weather', titleEm: 'join your plans?', intro: 'A clear look at what is ahead, grounded in the climate patterns of the last five years.',
    searchPlaceholder: 'Search a place, city or address', searchLabel: 'Search a place, city or address', clearSearch: 'Clear search',
    searching: 'Searching...', clickMap: 'Click anywhere to drop a pin', noPlace: 'No place selected', check: 'Check this date', loadingButton: 'Reading the sky...',
    selectPlace: 'Search for a place or click the map first.', unavailable: 'Weather providers are unavailable right now.', error: 'Could not load weather data.',
    outlook: 'Your outlook', updated: 'Updated', choose: 'Choose a place to see the forecast and its historical context.', gathering: 'Gathering the latest readings...',
    forecast: 'Forecast', historical: '5-year context', forecastUnavailable: 'Forecast is not available more than 10 days in advance.', average: 'Average', rainChance: 'Rain chance', wind: 'Wind', nextDays: 'Next days',
    temperatureByHour: 'Temperature by hour', hourlyRange: 'hourly range', weatherOutlook: 'Weather outlook', stormRisk: 'Storm risk',
    rainLikely: 'Rain likely', showersNearby: 'Showers nearby', partlyCloudy: 'Partly cloudy', clearSkies: 'Clear skies',
    hours: '24h', recommendations: 'Weather is a pattern, not a promise.', windUnit: 'km/h', hour: 'Time', activity: 'Activity', advice: 'Plan for your outing', exportPlan: 'Export plan as PNG', feelsLike: 'Feels like', humidity: 'Humidity', clouds: 'Cloud cover', uv: 'UV index', bringUmbrella: 'Bring an umbrella.', dressLight: 'Wear light, breathable clothing.', dressWarm: 'Bring a warm layer.', windAdvice: 'Consider wind protection.', sunAdvice: 'Use sunscreen, sunglasses and a hat.', safeOuting: 'Conditions look favorable for this activity.',
    activities: { walk: 'Walk', picnic: 'Picnic', hiking: 'Hiking', cycling: 'Cycling', beach: 'Beach', running: 'Running', sightseeing: 'Sightseeing' },
  },
  es: {
    language: 'English', live: 'contexto meteorológico en vivo', providers: 'NASA + Open-Meteo', plan: 'Planifica tu fecha',
    kicker: 'Planifica con contexto', title: '¿El clima', titleEm: 'acompañará tus planes?', intro: 'Una mirada clara a lo que viene, basada en los patrones climáticos de los últimos cinco años.',
    searchPlaceholder: 'Busca un lugar, ciudad o dirección', searchLabel: 'Busca un lugar, ciudad o dirección', clearSearch: 'Limpiar búsqueda',
    searching: 'Buscando...', clickMap: 'Haz clic en cualquier lugar para marcarlo', noPlace: 'Ningún lugar seleccionado', check: 'Consultar esta fecha', loadingButton: 'Leyendo el cielo...',
    selectPlace: 'Busca un lugar o haz clic en el mapa primero.', unavailable: 'Los proveedores meteorológicos no están disponibles.', error: 'No se pudieron cargar los datos del clima.',
    outlook: 'Tu pronóstico', updated: 'Actualizado', choose: 'Elige un lugar para ver el pronóstico y su contexto histórico.', gathering: 'Obteniendo las lecturas más recientes...',
    forecast: 'Pronóstico', historical: 'Contexto de 5 años', forecastUnavailable: 'El pronóstico no está disponible para fechas con más de 10 días de anticipación.', average: 'Promedio', rainChance: 'Probabilidad de lluvia', wind: 'Viento', nextDays: 'Próximos días',
    temperatureByHour: 'Temperatura por hora', hourlyRange: 'rango por hora', weatherOutlook: 'Pronóstico del clima', stormRisk: 'Riesgo de tormenta',
    rainLikely: 'Probable lluvia', showersNearby: 'Chubascos cercanos', partlyCloudy: 'Parcialmente nublado', clearSkies: 'Cielo despejado',
    hours: '24 h', recommendations: 'El clima es un patrón, no una promesa.', windUnit: 'km/h', hour: 'Hora', activity: 'Actividad', advice: 'Plan para tu salida', exportPlan: 'Exportar plan como PNG', feelsLike: 'Sensación térmica', humidity: 'Humedad', clouds: 'Nubosidad', uv: 'Índice UV', bringUmbrella: 'Lleva un paraguas.', dressLight: 'Usa ropa ligera y transpirable.', dressWarm: 'Lleva una capa abrigadora.', windAdvice: 'Considera protección contra el viento.', sunAdvice: 'Usa protector solar, lentes de sol y gorra.', safeOuting: 'Las condiciones parecen favorables para esta actividad.',
    activities: { walk: 'Caminata', picnic: 'Picnic', hiking: 'Senderismo', cycling: 'Ciclismo', beach: 'Playa', running: 'Correr', sightseeing: 'Turismo' },
  },
};
const months = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
};
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });
function normalizeCities(citiesSource) {
  return (Array.isArray(citiesSource) ? citiesSource : citiesSource.cities || []).map((city) => ({
  city: city.city || city.name,
  country: city.country || city.country_name || '',
  lat: Number(city.lat ?? city.latitude),
  lng: Number(city.lng ?? city.lon ?? city.longitude),
  })).filter((city) => city.city && Number.isFinite(city.lat) && Number.isFinite(city.lng));
}

function formatDay(date, language) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

function weatherLabel(code, language) {
  const text = translations[language];
  if (code === undefined || code === null) return text.weatherOutlook;
  if (code >= 95) return text.stormRisk;
  if (code >= 61) return text.rainLikely;
  if (code >= 51) return text.showersNearby;
  if (code >= 1) return text.partlyCloudy;
  return text.clearSkies;
}

function buildAdvice(hourData, activity, text) {
  if (!hourData) return [];
  const advice = [];
  const rain = Number(hourData.rainProb) || 0;
  const precipitation = Number(hourData.precipitation) || 0;
  const wind = Number(hourData.wind) || 0;
  const humidity = Number(hourData.humidity) || 0;
  const uv = Number(hourData.uv) || 0;
  const temp = Number(hourData.apparentTemp ?? hourData.temp);
  if (rain >= 45 || precipitation > 0.1) advice.push(text.bringUmbrella);
  if (temp >= 25 || humidity >= 75) advice.push(text.dressLight);
  if (temp < 12) advice.push(text.dressWarm);
  if (wind >= 25 || (activity === 'cycling' && wind >= 18)) advice.push(text.windAdvice);
  if (uv >= 5 && activity !== 'sightseeing') advice.push(text.sunAdvice);
  if (activity === 'picnic' && (rain >= 30 || humidity >= 85)) advice.push(text.bringUmbrella);
  if (activity === 'hiking' && (wind >= 30 || rain >= 60)) advice.push(text.windAdvice);
  if (!advice.length) advice.push(text.safeOuting);
  return [...new Set(advice)];
}

function drawWrappedText(context, value, x, y, maxWidth, lineHeight) {
  const words = value.split(' ');
  let line = '';
  let currentY = y;
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = candidate;
    }
  });
  if (line) context.fillText(line, x, currentY);
  return currentY + lineHeight;
}

function TemperatureChart({ data, text }) {
  if (!data?.length) return <div className="chart-empty">{text.temperatureByHour}.</div>;
  const values = data.map((item) => Number(item.temp) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${92 - ((value - min) / span) * 70}`).join(' ');
  return (
    <div className="chart-wrap">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Hourly temperature chart">
        <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#d55c3f" stopOpacity=".22" /><stop offset="1" stopColor="#d55c3f" stopOpacity="0" /></linearGradient></defs>
        <polygon points={`0,100 ${points} 100,100`} fill="url(#chartFill)" />
        <polyline points={points} fill="none" stroke="#d55c3f" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="chart-axis"><span>{data[0]?.hour}</span><span>{data[Math.floor(data.length / 2)]?.hour}</span><span>{data[data.length - 1]?.hour}</span></div>
      <div className="chart-range"><strong>{Math.round(max)}°</strong><span>{text.hourlyRange}</span><strong>{Math.round(min)}°</strong></div>
    </div>
  );
}

function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem('simpleweather-language') || 'es');
  const text = translations[language];
  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [query, setQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState(null);
  const [coordinates, setCoordinates] = useState(null);
  const [date, setDate] = useState({ year: today.getFullYear(), month: today.getMonth(), day: today.getDate() });
  const [selectedHour, setSelectedHour] = useState(today.getHours());
  const [activity, setActivity] = useState('walk');
  const [view, setView] = useState('forecast');
  const [forecast, setForecast] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);
  const [cityList, setCityList] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  function toggleLanguage() {
    const nextLanguage = language === 'es' ? 'en' : 'es';
    setLanguage(nextLanguage);
    localStorage.setItem('simpleweather-language', nextLanguage);
  }

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`${API_URL}/search?q=${encodeURIComponent(query.trim())}&lang=${language}`, { signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.results || []);
        } else {
          const term = query.trim().toLowerCase();
          setSuggestions(cityList.filter((city) => `${city.city} ${city.country}`.toLowerCase().includes(term)).slice(0, 6));
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          const term = query.trim().toLowerCase();
          setSuggestions(cityList.filter((city) => `${city.city} ${city.country}`.toLowerCase().includes(term)).slice(0, 6));
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, cityList, language]);

  useEffect(() => {
    const map = L.map(mapElement.current, { zoomControl: false, worldCopyJump: true }).setView([20, 0], 2);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18 }).addTo(map);
    map.on('click', (event) => setLocation({ lat: event.latlng.lat, lng: event.latlng.lng }, null));
    mapRef.current = map;
    return () => map.remove();
  }, []);

  useEffect(() => {
    fetch('/datasets/worldcities.json')
      .then((response) => response.json())
      .then((cities) => setCityList(normalizeCities(cities)))
      .catch(() => setCityList([]));
  }, []);

  function setLocation(location, city) {
    setCoordinates(location);
    setSelectedCity(city);
    if (mapRef.current) {
      mapRef.current.setView([location.lat, location.lng], city ? 8 : 6, { animate: true });
      if (markerRef.current) markerRef.current.remove();
      markerRef.current = L.marker([location.lat, location.lng]).addTo(mapRef.current);
    }
  }

  function chooseCity(city) {
    setQuery(city.city);
    setLocation({ lat: city.lat, lng: city.lng }, city);
  }

  async function loadWeather() {
    if (!coordinates) {
      setError(text.selectPlace);
      return;
    }
    setLoading(true);
    setError('');
    setPanelOpen(true);
    const dateString = `${date.year}-${String(date.month + 1).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
    const params = `lat=${coordinates.lat}&lon=${coordinates.lng}`;
    try {
      const [historyResponse, forecastResponse] = await Promise.all([
        fetch(`${API_URL}/weather?${params}&day=${date.day}&month=${date.month + 1}&year=${date.year}&lang=${language}`),
        fetch(`${API_URL}/forecast?${params}&date=${dateString}`),
      ]);
      const [historyJson, forecastJson] = await Promise.all([historyResponse.json(), forecastResponse.json()]);
      if (!historyResponse.ok && !forecastResponse.ok) throw new Error(text.unavailable);
      setHistory(historyResponse.ok ? historyJson : null);
      setForecast(forecastResponse.ok ? forecastJson : null);
      setView(forecastJson?.status === 'unavailable' || !forecastResponse.ok ? 'historical' : 'forecast');
    } catch (loadError) {
      setError(loadError.message || text.error);
    } finally {
      setLoading(false);
    }
  }

  function updateDate(key, value) {
    setDate((current) => ({ ...current, [key]: Number(value) }));
  }

  const activeData = view === 'forecast' ? forecast?.hourly_data : history?.historical_summary?.hourly_data;
  const selectedWeather = forecast?.hourly_data?.find((item) => item.hour?.startsWith(`${String(selectedHour).padStart(2, '0')}:`)) || forecast?.hourly_data?.[0];
  const advice = buildAdvice(selectedWeather, activity, text);
  const planDateString = `${date.year}-${String(date.month + 1).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  const placeName = selectedCity ? `${selectedCity.city}${selectedCity.admin1 ? `, ${selectedCity.admin1}` : ''}${selectedCity.country ? `, ${selectedCity.country}` : ''}` : coordinates ? `${coordinates.lat.toFixed(2)}°, ${coordinates.lng.toFixed(2)}°` : text.noPlace;
  const mainDay = forecast?.main_day;

  function exportPlan() {
    if (!selectedWeather) return;
    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = 900 * scale;
    canvas.height = 1120 * scale;
    const context = canvas.getContext('2d');
    context.scale(scale, scale);
    const background = context.createLinearGradient(0, 0, 900, 1120);
    background.addColorStop(0, '#20302c');
    background.addColorStop(1, '#496c63');
    context.fillStyle = background;
    context.fillRect(0, 0, 900, 1120);
    context.fillStyle = '#d55c3f';
    context.fillRect(54, 58, 90, 8);
    context.fillStyle = '#f8f4ea';
    context.font = '700 28px Arial';
    context.fillText('simpleweather', 54, 116);
    context.font = '600 48px Georgia';
    drawWrappedText(context, placeName, 54, 190, 790, 58);
    context.font = '400 24px Arial';
    context.fillStyle = '#cfe0d8';
    context.fillText(`${formatDay(planDateString, language)} · ${selectedWeather.hour}`, 54, 300);
    context.fillText(`${text.activities[activity]} · ${text.advice}`, 54, 340);
    context.fillStyle = '#f8f4ea';
    context.roundRect(54, 390, 792, 170, 20);
    context.fill();
    context.fillStyle = '#20302c';
    context.font = '700 72px Georgia';
    context.fillText(`${Math.round(selectedWeather.temp)}°`, 86, 480);
    context.font = '400 22px Arial';
    context.fillText(`${text.feelsLike}: ${Math.round(selectedWeather.apparentTemp ?? selectedWeather.temp)}°`, 86, 525);
    context.fillStyle = '#657970';
    context.font = '600 20px Arial';
    context.fillText(`${text.humidity}: ${selectedWeather.humidity ?? '—'}%`, 410, 455);
    context.fillText(`${text.clouds}: ${selectedWeather.cloudCover ?? '—'}%`, 410, 500);
    context.fillText(`${text.uv}: ${selectedWeather.uv ?? '—'}`, 650, 455);
    context.fillText(`${text.rainChance}: ${selectedWeather.rainProb ?? '—'}%`, 650, 500);
    context.fillStyle = '#f8f4ea';
    context.font = '700 27px Arial';
    context.fillText(text.advice, 54, 645);
    context.font = '400 23px Arial';
    context.fillStyle = '#e8f0e8';
    let adviceY = 700;
    advice.forEach((item) => {
      context.fillStyle = '#d55c3f';
      context.beginPath();
      context.arc(66, adviceY - 8, 6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e8f0e8';
      adviceY = drawWrappedText(context, item, 88, adviceY, 740, 32) + 14;
    });
    context.fillStyle = '#b8cec4';
    context.font = '400 18px Arial';
    context.fillText('Weather is a pattern, not a promise.', 54, 1060);
    const link = document.createElement('a');
    link.download = `simpleweather-${planDateString}-${activity}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="SimpleWeather home"><span className="brand-mark">S</span><span>simpleweather</span></a>
        <div className="topbar-meta"><span className="live-dot" /> {text.live} <span className="topbar-divider" /> <span>{text.providers}</span><button className="language-button" onClick={toggleLanguage} aria-label={`Switch to ${text.language}`}>{language === 'es' ? 'ES' : 'EN'} · {text.language}</button></div>
      </header>
      <section className="hero-copy">
        <p className="kicker">{text.kicker}</p>
        <h1>{text.title}<br /><em>{text.titleEm}</em></h1>
        <p className="intro">{text.intro}</p>
      </section>
      <section className="workspace">
        <div className="map-panel">
          <div ref={mapElement} className="map" />
          <div className="map-overlay">
            <div className="search-box">
              <Search size={18} strokeWidth={2.2} />
               <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchPlaceholder} aria-label={text.searchLabel} />
               {query && <button className="icon-button" onClick={() => setQuery('')} aria-label={text.clearSearch}><X size={16} /></button>}
               {isSearching && <div className="searching">{text.searching}</div>}
               {suggestions.length > 0 && <div className="suggestions">{suggestions.map((city) => <button key={`${city.city}-${city.country}-${city.lat}`} onMouseDown={() => chooseCity(city)}><MapPin size={15} /><span><strong>{city.city}</strong><small>{city.admin1 || city.country}</small></span></button>)}</div>}
            </div>
            <div className="map-tip"><LocateFixed size={16} /> {text.clickMap}</div>
          </div>
          {coordinates && <div className="location-chip"><MapPin size={15} /> {placeName}</div>}
        </div>
        <aside className={`control-panel ${panelOpen ? 'is-open' : ''}`}>
          <button className="panel-toggle" onClick={() => setPanelOpen((open) => !open)} aria-expanded={panelOpen}><span><CalendarDays size={18} /> {text.plan}</span><ChevronDown size={18} /></button>
          {panelOpen && <div className="panel-tools">
            <div className="date-fields"><label>{language === 'es' ? 'Año' : 'Year'}<select value={date.year} onChange={(event) => updateDate('year', event.target.value)}>{Array.from({ length: 33 }, (_, index) => today.getFullYear() + 1 - index).map((year) => <option key={year}>{year}</option>)}</select></label><label>{language === 'es' ? 'Mes' : 'Month'}<select value={date.month} onChange={(event) => updateDate('month', event.target.value)}>{months[language].map((month, index) => <option key={month} value={index}>{month}</option>)}</select></label><label>{language === 'es' ? 'Día' : 'Day'}<select value={date.day} onChange={(event) => updateDate('day', event.target.value)}>{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option key={day}>{day}</option>)}</select></label></div>
            <div className="outing-fields"><label>{text.hour}<select value={selectedHour} onChange={(event) => setSelectedHour(Number(event.target.value))}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}</select></label><label>{text.activity}<select value={activity} onChange={(event) => setActivity(event.target.value)}>{Object.entries(text.activities).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
            <button className="primary-button" onClick={loadWeather} disabled={loading || !coordinates}>{loading ? text.loadingButton : text.check}</button>
            {error && <p className="error-message">{error}</p>}
          </div>}
          <div className="panel-divider" />
          <div className="results-heading"><div><p className="kicker">{text.outlook}</p><h2>{placeName}</h2></div>{(forecast || history) && <span className="status">{text.updated}</span>}</div>
          {!forecast && !history && !loading && <div className="empty-state"><CloudRain size={34} /><p>{text.choose}</p></div>}
          {loading && <div className="loading-state"><span className="spinner" /><p>{text.gathering}</p></div>}
          {!loading && (forecast || history) && <>
            <div className="view-tabs"><button className={view === 'forecast' ? 'active' : ''} onClick={() => setView('forecast')}>{text.forecast}</button><button className={view === 'historical' ? 'active' : ''} onClick={() => setView('historical')} disabled={!history}>{text.historical}</button></div>
            {view === 'forecast' && forecast?.status === 'unavailable' && <div className="notice">{text.forecastUnavailable}</div>}
            {view === 'forecast' && mainDay && <div className="weather-card"><div><p className="card-eyebrow">{formatDay(mainDay.date, language)}</p><strong className="big-temp">{Math.round(mainDay.max)}°</strong><span className="temp-low"> / {Math.round(mainDay.min)}°</span><p className="weather-label">{weatherLabel(mainDay.weatherCode, language)}</p></div><div className="rain-stat"><CloudRain size={20} /><strong>{mainDay.rainProb}%</strong><span>{text.rainChance}</span></div></div>}
            {view === 'forecast' && selectedWeather && <div className="outing-advice"><div className="advice-heading"><Wind size={18} /><div><strong>{text.advice}</strong><span>{text.activities[activity]} · {selectedWeather.hour}</span></div></div><div className="advice-metrics"><span>{text.feelsLike} <b>{Math.round(selectedWeather.apparentTemp ?? selectedWeather.temp)}°</b></span><span>{text.humidity} <b>{selectedWeather.humidity ?? '—'}%</b></span><span>{text.clouds} <b>{selectedWeather.cloudCover ?? '—'}%</b></span><span>{text.uv} <b>{selectedWeather.uv ?? '—'}</b></span></div><ul>{advice.map((item) => <li key={item}>{item}</li>)}</ul><button className="export-button" onClick={exportPlan}><Download size={16} /> {text.exportPlan}</button></div>}
            {view === 'historical' && history?.historical_summary && <div className="stats-grid"><div><span>{text.average}</span><strong>{history.historical_summary.temp}°</strong></div><div><span>{text.rainChance}</span><strong>{history.historical_summary.rainProb}%</strong></div><div><span>{text.wind}</span><strong>{history.historical_summary.wind}<small> {text.windUnit}</small></strong></div></div>}
            {view === 'forecast' && forecast?.forecast?.length > 0 && <div className="forecast-list"><h3>{text.nextDays}</h3>{forecast.forecast.map((day) => <div className="forecast-row" key={day.date}><span>{formatDay(day.date, language)}</span><strong>{Math.round(day.max)}° <small>/ {Math.round(day.min)}°</small></strong><span className="rain-small"><CloudRain size={14} /> {day.rainProb}%</span></div>)}</div>}
            {view === 'historical' && history?.recommendations?.length > 0 && <div className="recommendation"><Wind size={17} /><p>{history.recommendations[0]}</p></div>}
            {activeData && <div className="chart-section"><div className="section-heading"><h3>{text.temperatureByHour}</h3><span>{text.hours}</span></div><TemperatureChart data={activeData} text={text} /></div>}
          </>}
        </aside>
      </section>
      <footer><span>SimpleWeather</span><span>{text.recommendations}</span></footer>
    </main>
  );
}

export default App;
