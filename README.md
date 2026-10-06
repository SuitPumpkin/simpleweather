# SimpleWeather

SimpleWeather is a focused weather-planning experience built around a map. It combines a fast short-term forecast with five-year historical context so users can make clearer outdoor plans.

## About this repository

This is an independent React and Node.js reimplementation based on the original collaborative hackathon project, [Will-It-Rain-On-My-Parade](https://github.com/SuitPumpkin/Will-It-Rain-On-My-Parade). The original project and its contributors are part of the history of the idea; this repository contains the new implementation, architecture, and visual direction.

Please preserve the original project credits when presenting or distributing this work.

## Stack

- **Web:** React 18 + Vite + Leaflet
- **API:** Node.js 20 + Express
- **Providers:** Open-Meteo and NASA POWER

The API performs historical provider requests concurrently, caches responses in memory, validates inputs, and applies upstream timeouts. The web client loads the city dataset on demand to keep the initial bundle small.

## Run locally

Requirements: Node.js 20 or newer.

```bash
# API
cd backend
npm install
npm run dev

# In another terminal, web client
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:8000`.

## Configuration

Copy `backend/.env.example` to `backend/.env` and configure `NASA_API_KEY` when required by the NASA POWER account. Configure allowed origins with `CORS_ORIGINS` if the frontend is deployed separately.

For a remote API, copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_API_URL`.

## Production build

```bash
cd frontend
npm run build

cd ../backend
npm start
```

## Creating the new Git repository

Create an empty repository named `simpleweather` under the account or organization that will own this version. Then run from this directory:

```bash
git remote rename origin original-hackathon
git remote add origin https://github.com/YOUR_ACCOUNT/simpleweather.git
git add .
git commit -m "Rebrand project as SimpleWeather"
git push -u origin HEAD
```

Keep `original-hackathon` if you want the original repository to remain available as a reference. Do not force-push over the collaborative repository.

## API endpoints

- `GET /health`
- `GET /weather?lat={lat}&lon={lon}&day={day}&month={month}&year={year}`
- `GET /forecast?lat={lat}&lon={lon}&date={YYYY-MM-DD}`

## License

MIT. See [LICENSE](LICENSE). The original project link and contributor credit above should remain with derivative presentations of this work.
