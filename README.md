# SimpleWeather
<img width="854" height="384" alt="mockup-all-framed" src="https://github.com/user-attachments/assets/1d0d87ae-0c4b-4dec-910d-5eb3694aa265" />

[![SimpleWeather](https://img.shields.io/badge/Live-Demo-blue?style=for-the-badge&logo=render)](https://simpleweather-api.onrender.com/health)

---

## About

**SimpleWeather** is a focused weather-planning experience built around a map. It combines a fast short-term forecast with five-year historical context so users can make clearer outdoor plans.

This is an independent React and Node.js reimplementation based on the original collaborative hackathon project, [Will-It-Rain-On-My-Parade](https://github.com/SuitPumpkin/Will-It-Rain-On-My-Parade). The original project and its contributors are part of the history of the idea; this repository contains the new implementation, architecture, and visual direction.

Please preserve the original project credits when presenting or distributing this work.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| **React 18** | Frontend framework |
| **Vite** | Development and build tool |
| **Leaflet** | Interactive maps |
| **Node.js 20** | Backend runtime |
| **Express 5** | API framework |
| **Open-Meteo** | Forecast and weather data |
| **NASA POWER** | Historical weather data |

The API performs historical provider requests concurrently, caches responses in memory, validates inputs, and applies upstream timeouts. Place search uses Open-Meteo Geocoding with localized results. Forecast responses include hourly apparent temperature, humidity, precipitation probability, wind, cloud cover, UV index, and weather code so the client can tailor outing advice. Forecasts are cached for 30 minutes and can be served stale for up to six hours if Open-Meteo temporarily rate-limits the production server. The web client loads the city dataset on demand to keep the initial bundle small.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/search?q=&lang=es\|en` | Place search through Open-Meteo Geocoding |
| `GET` | `/weather?lat=&lon=&day=&month=&year=` | 5-year historical summary |
| `GET` | `/forecast?lat=&lon=&date=YYYY-MM-DD` | Short-term forecast |

---

## Project Structure

```
simpleweather/
├── backend/
│   ├── server.js          # Express API
│   ├── package.json
│   ├── package-lock.json
│   └── .env.example
│
├── frontend/
│   ├── vite.config.js      # Vite + React
│   ├── package.json
│   ├── package-lock.json
│   ├── index.html
│   ├── .env.example
│   │
│   ├── public/
│   │   ├── index.html
│   │   └── datasets/
│   │       └── worldcities.json
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       └── styles.css
│
├── .gitignore
├── LICENSE
└── README.md
```

---

## Development

### Requirements

- Node.js 20 or newer

### Installation

```bash
# API
cd backend
npm install
npm run dev

# Web client (in another terminal)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:8000`.

---

## Configuration

Copy `backend/.env.example` to `backend/.env` and configure `NASA_API_KEY` when required by the NASA POWER account. Configure allowed origins with `CORS_ORIGINS` if the frontend is deployed separately.

```env
NASA_API_KEY=your_nasa_api_key
CORS_ORIGINS=http://localhost:5173,http://localhost:8080,https://simpleweather-1.onrender.com (change this one to your deploy url)
WEATHER_USER_AGENT=SimpleWeather/1.0 (admin@example.com)
```

For a remote API, copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_API_URL`.

```env
VITE_API_URL=http://127.0.0.1:8000
```

---

## Production Build

```bash
cd frontend
npm run build

cd ../backend
npm start
```

---

## Deployment

The project is configured for deployment on **Render** with two services.

| Service | Type | Root Directory | Build Command | Start Command | Publish Dir |
|---|---|---|---|---|---|
| API | Web Service | `backend/` | `npm install` | `npm start` | — |
| Web | Static Site | `frontend/` | `npm install && npm run build` | — | `dist/` |

### Environment Variables

**API service**

| Variable | Required | Default | Description |
|---|---|---|---|
| `NASA_API_KEY` | No | — | NASA POWER API key for higher rate limits |
| `CORS_ORIGINS` | No | `http://localhost:5173,http://localhost:8080` | Comma-separated allowed origins |
| `WEATHER_USER_AGENT` | No | `SimpleWeather/1.0 (weather application)` | Identification sent to the MET Norway fallback provider |
| `PORT` | No | `8000` | Server port (injected by Render) |

**Web service**

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | Yes | `http://127.0.0.1:8000` | Backend API URL |

Set `VITE_API_URL` to the Render URL of your API service, e.g. `https://simpleweather-api.onrender.com`. Set `CORS_ORIGINS` on the API to the Render URL of your frontend. For the current deployment, use `https://simpleweather-1.onrender.com`.

---

## License

MIT. See [LICENSE](LICENSE). The original project link and contributor credit above should remain with derivative presentations of this work.
