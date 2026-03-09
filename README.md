# CalvinX – Mini Bloomberg Terminal

A polished, Bloomberg-inspired financial dashboard built with **React + Vite + Tailwind CSS** and designed to be easy to deploy on **Vercel, Netlify, or GitHub Pages**.

## Features

- Dark Bloomberg-style terminal UI
- Responsive dashboard layout
- Symbol search for equities, FX, and crypto
- Alpha Vantage market data integration
- Candlestick chart powered by TradingView Lightweight Charts
- Client-side analytics:
  - 30D historical volatility
  - Annualized return
  - SMA 20 / SMA 50
  - RSI 14
- FX carry calculator with embedded policy-rate table
- Market news feed with filters and sentiment tagging
- Graceful fallback demo mode when API keys are missing
- Rate-limit handling for free-tier APIs

## Tech Stack

- **Frontend:** React + TypeScript + Vite
- **Styling:** Tailwind CSS v4 + custom terminal theming
- **Charts:** `lightweight-charts`
- **Market Data:** Alpha Vantage free API
- **News:** Finnhub free API

## Installation

```bash
npm install
npm run dev
```

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
VITE_FINNHUB_API_KEY=your_finnhub_key
```

### API Sources

- Alpha Vantage: https://www.alphavantage.co/support/#api-key
- Finnhub: https://finnhub.io/dashboard

## Demo-Safe Fallback Behavior

If API keys are not provided:

- Market widgets fall back to generated demo data
- News feed falls back to generated demo headlines
- The interface remains fully usable for UI demos and recruiter portfolios

If Alpha Vantage rate limits the app:

- The app shows a status banner
- Existing market data remains visible
- The dashboard does not crash

## Supported Inputs

Examples:

- **Equities:** `AAPL`, `MSFT`, `TSLA`
- **FX:** `EURUSD`, `EUR/USD`, `GBPJPY`
- **Crypto:** `BTC`, `ETH`, `BTCUSD`

## Folder Structure

```text
.
├── index.html
├── README.md
├── src
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   ├── utils
│   │   └── cn.ts
│   └── vite-env.d.ts
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Deployment

### Vercel

1. Push the project to GitHub
2. Import the repository into Vercel
3. Add environment variables:
   - `VITE_ALPHA_VANTAGE_API_KEY`
   - `VITE_FINNHUB_API_KEY`
4. Deploy

### Netlify

1. Push the project to GitHub
2. Import the repository into Netlify
3. Build command:
   ```bash
   npm run build
   ```
4. Publish directory:
   ```bash
   dist
   ```
5. Add the two `VITE_` environment variables

### GitHub Pages

You can deploy the generated `dist` folder using a Pages workflow or a static deploy action.
Because this is a pure frontend Vite app, it does not require paid server hosting.

## Notes for Recruiter Demos

- The chart includes candlesticks plus SMA overlays
- Analytics are computed directly in the browser to demonstrate quantitative front-end capability
- FX carry adds a macro/markets use case beyond simple price display
- News sentiment is lightweight and heuristic-based for free-tier compatibility

## Production Considerations

For a future upgrade, you could add:

- Better sentiment scoring with NLP APIs
- More granular intraday data
- Watchlists and local storage persistence
- Portfolio simulation tools
- Multi-chart layouts and comparative analytics

## Build

```bash
npm run build
```
