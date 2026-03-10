# CalvinX – Market Terminal (Mini Bloomberg)

A full-featured, Bloomberg-inspired financial terminal built with **React + Vite + TypeScript + Tailwind CSS**.  
Designed for **Equity / FX / Crypto** analysis with **live market data**, technical indicators, news sentiment, and **Excel auto-reporting**.

## ✨ Overview
This project replicates the workflow of a real analyst/desk:
- Market snapshot → chart → analytics → sentiment → export.
- Built for **students in finance**, **market risk**, **sales & trading**, and **quant/structuring** junior roles.
- Fully client-side with **fallback demo mode** when APIs hit rate limits.

---

## 📊 Features

### 🟦 Market Dashboard
- Live Alpha Vantage data (Equity / FX / Crypto)  
- Smart symbol inference (AAPL, EURUSD, BTC, etc.)  
- Risk regime estimator (Risk-On / Risk-Off / Neutral)

### 📈 Technical Indicators
- Candlestick chart (100 obs)
- **SMA20 / SMA50**
- **RSI14**
- **30D annualized volatility**
- **30D annualized return**

### 📰 News Sentiment Engine
- Finnhub-based market headlines
- Sector filter (Technology, Energy, Macro…)
- Keyword filter (inflation, earnings…)
- Sentiment tagging (positive / neutral / negative)

### 📤 Excel Auto-Export
Generates a 3-sheet professional XLSX report:
- **KPI** (Last, % Change, Volume, High/Low)
- **TimeSeries** (OHLC + Volume)
- **News** (headline, sentiment, source)

### 💱 FX Carry Module
- Static policy-rate table
- Computes base–quote annualized carry

### 🛡️ Demo-Safe Mode
- Automatic fallback when the free Alpha Vantage API rate-limit is hit
- Guarantees the terminal always loads during recruiter demos

---

## 🧰 Tech Stack

| Layer | Tools |
|-------|--------|
| Frontend | React, TypeScript, Vite |
| UI | Tailwind CSS, custom widgets |
| Charts | TradingView Lightweight-Charts |
| Data APIs | Alpha Vantage (markets), Finnhub (news) |
| Excel | SheetJS (XLSX) |
| Deployment | Vercel (recommended) |

---

## 🚀 Getting Started

Install dependencies:

```bash
npm install
npm run dev
