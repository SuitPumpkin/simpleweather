import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { CalendarDays, ChevronDown, CloudRain, LocateFixed, MapPin, Search, Wind, X } from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const today = new Date();
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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

function formatDay(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

function weatherLabel(code) {
  if (code === undefined || code === null) return 'Weather outlook';
  if (code >= 95) return 'Storm risk';
  if (code >= 61) return 'Rain likely';
  if (code >= 51) return 'Showers nearby';
  if (code >= 1) return 'Partly cloudy';
  return 'Clear skies';
}

function TemperatureChart({ data }) {
  if (!data?.length) return <div className="chart-empty">Hourly temperatures will appear here.</div>;
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
      <div className="chart-range"><strong>{Math.round(max)}°</strong><span>hourly range</span><strong>{Math.round(min)}°</strong></div>
    </div>
  );
}

function App() {
  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [query, setQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState(null);
  const [coordinates, setCoordinates] = useState(null);
  const [date, setDate] = useState({ year: today.getFullYear(), month: today.getMonth(), day: today.getDate() });
  const [view, setView] = useState('forecast');
  const [forecast, setForecast] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);
  const [cityList, setCityList] = useState([]);

  const suggestions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 2) return [];
    return cityList.filter((city) => `${city.city} ${city.country}`.toLowerCase().includes(term)).slice(0, 6);
  }, [query]);

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
      setError('Search for a place or click the map first.');
      return;
    }
    setLoading(true);
    setError('');
    setPanelOpen(true);
    const dateString = `${date.year}-${String(date.month + 1).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
    const params = `lat=${coordinates.lat}&lon=${coordinates.lng}`;
    try {
      const [historyResponse, forecastResponse] = await Promise.all([
        fetch(`${API_URL}/weather?${params}&day=${date.day}&month=${date.month + 1}&year=${date.year}`),
        fetch(`${API_URL}/forecast?${params}&date=${dateString}`),
      ]);
      const [historyJson, forecastJson] = await Promise.all([historyResponse.json(), forecastResponse.json()]);
      if (!historyResponse.ok && !forecastResponse.ok) throw new Error('Weather providers are unavailable right now.');
      setHistory(historyResponse.ok ? historyJson : null);
      setForecast(forecastResponse.ok ? forecastJson : null);
      setView(forecastJson?.status === 'unavailable' ? 'historical' : 'forecast');
    } catch (loadError) {
      setError(loadError.message || 'Could not load weather data.');
    } finally {
      setLoading(false);
    }
  }

  function updateDate(key, value) {
    setDate((current) => ({ ...current, [key]: Number(value) }));
  }

  const activeData = view === 'forecast' ? forecast?.hourly_data : history?.historical_summary?.hourly_data;
  const placeName = selectedCity ? `${selectedCity.city}, ${selectedCity.country}` : coordinates ? `${coordinates.lat.toFixed(2)}°, ${coordinates.lng.toFixed(2)}°` : 'No place selected';
  const mainDay = forecast?.main_day;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="SimpleWeather home"><span className="brand-mark">S</span><span>simpleweather</span></a>
        <div className="topbar-meta"><span className="live-dot" /> live weather context <span className="topbar-divider" /> <span>NASA + Open-Meteo</span></div>
      </header>
      <section className="hero-copy">
        <p className="kicker">Plan with context</p>
        <h1>Will the weather<br /><em>join your plans?</em></h1>
        <p className="intro">A clear look at what is ahead, grounded in the climate patterns of the last five years.</p>
      </section>
      <section className="workspace">
        <div className="map-panel">
          <div ref={mapElement} className="map" />
          <div className="map-overlay">
            <div className="search-box">
              <Search size={18} strokeWidth={2.2} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a city or country" aria-label="Search a city or country" />
              {query && <button className="icon-button" onClick={() => setQuery('')} aria-label="Clear search"><X size={16} /></button>}
              {suggestions.length > 0 && <div className="suggestions">{suggestions.map((city) => <button key={`${city.city}-${city.country}`} onMouseDown={() => chooseCity(city)}><MapPin size={15} /><span><strong>{city.city}</strong><small>{city.country}</small></span></button>)}</div>}
            </div>
            <div className="map-tip"><LocateFixed size={16} /> Click anywhere to drop a pin</div>
          </div>
          {coordinates && <div className="location-chip"><MapPin size={15} /> {placeName}</div>}
        </div>
        <aside className={`control-panel ${panelOpen ? 'is-open' : ''}`}>
          <button className="panel-toggle" onClick={() => setPanelOpen((open) => !open)} aria-expanded={panelOpen}><span><CalendarDays size={18} /> Plan your date</span><ChevronDown size={18} /></button>
          {panelOpen && <div className="panel-tools">
            <div className="date-fields"><label>Year<select value={date.year} onChange={(event) => updateDate('year', event.target.value)}>{Array.from({ length: 33 }, (_, index) => today.getFullYear() + 1 - index).map((year) => <option key={year}>{year}</option>)}</select></label><label>Month<select value={date.month} onChange={(event) => updateDate('month', event.target.value)}>{months.map((month, index) => <option key={month} value={index}>{month}</option>)}</select></label><label>Day<select value={date.day} onChange={(event) => updateDate('day', event.target.value)}>{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option key={day}>{day}</option>)}</select></label></div>
            <button className="primary-button" onClick={loadWeather} disabled={loading || !coordinates}>{loading ? 'Reading the sky...' : 'Check this date'}</button>
            {error && <p className="error-message">{error}</p>}
          </div>}
          <div className="panel-divider" />
          <div className="results-heading"><div><p className="kicker">Your outlook</p><h2>{placeName}</h2></div>{(forecast || history) && <span className="status">Updated</span>}</div>
          {!forecast && !history && !loading && <div className="empty-state"><CloudRain size={34} /><p>Choose a place to see the forecast and its historical context.</p></div>}
          {loading && <div className="loading-state"><span className="spinner" /><p>Gathering the latest readings...</p></div>}
          {!loading && (forecast || history) && <>
            <div className="view-tabs"><button className={view === 'forecast' ? 'active' : ''} onClick={() => setView('forecast')}>Forecast</button><button className={view === 'historical' ? 'active' : ''} onClick={() => setView('historical')} disabled={!history}>5-year context</button></div>
            {view === 'forecast' && forecast?.status === 'unavailable' && <div className="notice">{forecast.message}</div>}
            {view === 'forecast' && mainDay && <div className="weather-card"><div><p className="card-eyebrow">{formatDay(mainDay.date)}</p><strong className="big-temp">{Math.round(mainDay.max)}°</strong><span className="temp-low"> / {Math.round(mainDay.min)}°</span><p className="weather-label">{weatherLabel(mainDay.weatherCode)}</p></div><div className="rain-stat"><CloudRain size={20} /><strong>{mainDay.rainProb}%</strong><span>rain chance</span></div></div>}
            {view === 'historical' && history?.historical_summary && <div className="stats-grid"><div><span>Average</span><strong>{history.historical_summary.temp}°</strong></div><div><span>Rain chance</span><strong>{history.historical_summary.rainProb}%</strong></div><div><span>Wind</span><strong>{history.historical_summary.wind}<small> km/h</small></strong></div></div>}
            {view === 'forecast' && forecast?.forecast?.length > 0 && <div className="forecast-list"><h3>Next days</h3>{forecast.forecast.map((day) => <div className="forecast-row" key={day.date}><span>{formatDay(day.date)}</span><strong>{Math.round(day.max)}° <small>/ {Math.round(day.min)}°</small></strong><span className="rain-small"><CloudRain size={14} /> {day.rainProb}%</span></div>)}</div>}
            {view === 'historical' && history?.recommendations?.length > 0 && <div className="recommendation"><Wind size={17} /><p>{history.recommendations[0]}</p></div>}
            {activeData && <div className="chart-section"><div className="section-heading"><h3>Temperature by hour</h3><span>24h</span></div><TemperatureChart data={activeData} /></div>}
          </>}
        </aside>
      </section>
      <footer><span>SimpleWeather</span><span>Weather is a pattern, not a promise.</span></footer>
    </main>
  );
}

export default App;
