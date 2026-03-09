import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
} from "lightweight-charts";

type AssetType = "equity" | "fx" | "crypto";

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

type MarketSnapshot = {
  lastPrice: number;
  changePct: number;
  volume: number | null;
  high: number;
  low: number;
  updatedAt: string;
};

type MarketResponse = {
  symbol: string;
  assetType: AssetType;
  candles: Candle[];
  snapshot: MarketSnapshot;
  source: "live" | "demo";
  note?: string;
};

type NewsItem = {
  headline: string;
  snippet: string;
  url: string;
  source: string;
  datetime: string;
  sentiment: "positive" | "neutral" | "negative";
};

type Analytics = {
  volatility30d: number | null;
  annualizedReturn: number | null;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
};

const ALPHA_VANTAGE_KEY = "J0NY9ESFK8GRYN41";
const FINNHUB_KEY = "d6m5p81r01qi0ajl0o50d6m5p81r01qi0ajl0o5g";

const QUICK_SYMBOLS = ["AAPL", "MSFT", "EURUSD", "BTC", "TSLA"];
const SECTORS = ["All", "Technology", "Energy", "Financials", "Healthcare", "Macro"];
const KEYWORDS = ["All", "inflation", "rates", "tech", "energy", "earnings"];
const FX_RATES: Record<string, number> = {
  USD: 5.25,
  EUR: 4.0,
  GBP: 5.0,
  JPY: 0.1,
  CHF: 1.5,
  AUD: 4.35,
  CAD: 4.75,
  NZD: 5.5,
};
const KNOWN_FX = new Set(Object.keys(FX_RATES));
const KNOWN_CRYPTO = new Set(["BTC", "ETH", "SOL", "XRP", "ADA"]);
function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return `${value >= 0 ? "+" : ""}${formatNumber(value, 2)}%`;
}

function toBusinessDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day } as const;
}

function inferSymbol(input: string): { symbol: string; assetType: AssetType; base?: string; quote?: string } {
  const cleaned = input.toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
  const compact = cleaned.replace("/", "");

  if (KNOWN_CRYPTO.has(compact)) {
    return { symbol: `${compact}/USD`, assetType: "crypto", base: compact, quote: "USD" };
  }

  if (cleaned.includes("/")) {
    const [base, quote] = cleaned.split("/");
    if (KNOWN_FX.has(base) && KNOWN_FX.has(quote)) {
      return { symbol: `${base}/${quote}`, assetType: "fx", base, quote };
    }
  }

  if (compact.length === 6) {
    const base = compact.slice(0, 3);
    const quote = compact.slice(3, 6);
    if (KNOWN_FX.has(base) && KNOWN_FX.has(quote)) {
      return { symbol: `${base}/${quote}`, assetType: "fx", base, quote };
    }
    if (KNOWN_CRYPTO.has(base) && quote === "USD") {
      return { symbol: `${base}/USD`, assetType: "crypto", base, quote };
    }
  }

  return { symbol: compact, assetType: "equity" };
}



function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeSMA(closes: number[], period: number) {
  if (closes.length < period) return null;
  return average(closes.slice(-period));
}

function computeRSI(closes: number[], period = 14) {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }
  if (losses === 0) return 100;
  const rs = gains / period / (losses / period);
  return 100 - 100 / (1 + rs);
}

function computeAnalytics(candles: Candle[]): Analytics {
  const closes = candles.map((candle) => candle.close);
  const returns = closes.slice(1).map((close, index) => close / closes[index] - 1);
  const returns30 = returns.slice(-30);
  const mean = average(returns30);
  const variance = mean === null
    ? null
    : average(returns30.map((value) => (value - mean) ** 2));
  const volatility30d = variance === null ? null : Math.sqrt(variance) * Math.sqrt(252) * 100;
  const annualizedReturn =
    closes.length > 30
      ? ((closes[closes.length - 1] / closes[Math.max(0, closes.length - 31)]) ** (252 / 30) - 1) * 100
      : null;

  return {
    volatility30d,
    annualizedReturn,
    sma20: computeSMA(closes, 20),
    sma50: computeSMA(closes, 50),
    rsi14: computeRSI(closes, 14),
  };
}

function computeSentiment(text: string): NewsItem["sentiment"] {
  const positiveWords = ["surge", "beat", "gain", "rally", "growth", "optimism", "upgrade", "record"];
  const negativeWords = ["fall", "miss", "cut", "selloff", "recession", "downgrade", "risk", "pressure"];
  const normalized = text.toLowerCase();
  const positiveHits = positiveWords.filter((word) => normalized.includes(word)).length;
  const negativeHits = negativeWords.filter((word) => normalized.includes(word)).length;
  if (positiveHits > negativeHits) return "positive";
  if (negativeHits > positiveHits) return "negative";
  return "neutral";
}

function generateDemoCandles(symbol: string): Candle[] {
  const seed = symbol.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  let price = 80 + (seed % 120);
  const today = new Date();
  const candles: Candle[] = [];

  for (let i = 130; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const drift = Math.sin((seed + i) / 8) * 1.6;
    const shock = ((seed * (i + 3)) % 17 - 8) / 10;
    const open = price;
    const close = Math.max(5, open + drift + shock);
    const high = Math.max(open, close) + Math.abs(shock) * 1.8 + 1.2;
    const low = Math.min(open, close) - Math.abs(drift) * 1.2 - 1.1;
    const volume = 900000 + ((seed + i * 4213) % 1000000);
    candles.push({
      time: date.toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume,
    });
    price = close;
  }

  return candles.slice(-100);
}

function demoMarketResponse(input: string): MarketResponse {
  const inferred = inferSymbol(input);
  const candles = generateDemoCandles(inferred.symbol);
  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2] ?? latest;
  return {
    symbol: inferred.symbol,
    assetType: inferred.assetType,
    candles,
    snapshot: {
      lastPrice: latest.close,
      changePct: ((latest.close / previous.close) - 1) * 100,
      volume: latest.volume,
      high: latest.high,
      low: latest.low,
      updatedAt: latest.time,
    },
    source: "demo",
    note: "Demo mode enabled. Add API keys for live market data.",
  };
}

async function fetchMarketData(input: string): Promise<MarketResponse | null> {
  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${input}&outputsize=compact&apikey=${ALPHA_VANTAGE_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    // Rate limit protection
    if (data.Note || data.Information) {
      console.warn("Rate limit atteint");
      return demoMarketResponse(input); // fallback stable
    }

    if (!data["Time Series (Daily)"]) {
      console.warn("Pas de données pour", input);
      return demoMarketResponse(input); // fallback stable
    }

    const entries = Object.entries(data["Time Series (Daily)"])
      .map(([date, values]: any) => ({
        time: date,
        open: parseFloat(values["1. open"]),
        high: parseFloat(values["2. high"]),
        low: parseFloat(values["3. low"]),
        close: parseFloat(values["4. close"]),
        volume: parseFloat(values["5. volume"])
      }))
      .sort((a, b) => a.time.localeCompare(b.time))
      .slice(-100);

    const latest = entries[entries.length - 1];
    const previous = entries[entries.length - 2];

    return {
      symbol: input,
      assetType: "equity",
      candles: entries,
      snapshot: {
        lastPrice: latest.close,
        changePct: ((latest.close / previous.close) - 1) * 100,
        volume: latest.volume,
        high: latest.high,
        low: latest.low,
        updatedAt: latest.time
      },
      source: "live"
    };

  } catch (error) {
    console.error("Erreur API:", error);
    return demoMarketResponse(input); // fallback si erreur réseau
  }
}

function demoNews(symbol: string): NewsItem[] {
  const items = [
    `${symbol} traders monitor rates outlook as volatility cools into month-end`,
    `Technology leadership broadens while macro desks debate inflation trajectory`,
    `Energy and FX markets reprice central-bank expectations after mixed data`,
    `Risk sentiment improves as investors rotate into quality growth names`,
    `Cross-asset positioning stays cautious ahead of major economic releases`,
  ];

  return items.map((headline, index) => ({
    headline,
    snippet:
      "Demo headline generated locally. Add a Finnhub API key to unlock live market headlines, symbol filters, and a richer sidebar news experience.",
    url: "https://finnhub.io/",
    source: "Demo Feed",
    datetime: new Date(Date.now() - index * 1000 * 60 * 90).toISOString(),
    sentiment: computeSentiment(headline),
  }));
}

async function fetchNews(symbol: string, assetType: AssetType): Promise<NewsItem[]> {
  if (!FINNHUB_KEY) return demoNews(symbol);

  const isEquity = assetType === "equity";
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 14);
  const toDate = today.toISOString().slice(0, 10);
  const fromDate = from.toISOString().slice(0, 10);

  const endpoint = isEquity
    ? `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${fromDate}&to=${toDate}&token=${FINNHUB_KEY}`
    : `https://finnhub.io/api/v1/news?category=${assetType === "crypto" ? "crypto" : assetType === "fx" ? "forex" : "general"}&token=${FINNHUB_KEY}`;

  const response = await fetch(endpoint);
  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("Unable to load news feed.");
  }

  return data.slice(0, 20).map((item: any) => ({
    headline: item.headline ?? "Untitled headline",
    snippet: item.summary ?? "No summary available.",
    url: item.url ?? "https://finnhub.io/",
    source: item.source ?? "Finnhub",
    datetime: new Date((item.datetime ?? Date.now() / 1000) * 1000).toISOString(),
    sentiment: computeSentiment(`${item.headline ?? ""} ${item.summary ?? ""}`),
  }));
}

function getCarry(base: string, quote: string) {
  const baseRate = FX_RATES[base] ?? 0;
  const quoteRate = FX_RATES[quote] ?? 0;
  return {
    baseRate,
    quoteRate,
    carry: baseRate - quoteRate,
  };
}

function Widget({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={classNames(
        "rounded-2xl border border-white/10 bg-[#111827]/80 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur-sm",
        className
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-[#f59e0b]">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p
        className={classNames(
          "mt-3 text-2xl font-semibold",
          tone === "positive" && "text-emerald-400",
          tone === "negative" && "text-rose-400",
          tone === "neutral" && "text-slate-100"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SentimentPill({ sentiment }: { sentiment: NewsItem["sentiment"] }) {
  return (
    <span
      className={classNames(
        "rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.22em]",
        sentiment === "positive" && "bg-emerald-500/15 text-emerald-300",
        sentiment === "negative" && "bg-rose-500/15 text-rose-300",
        sentiment === "neutral" && "bg-slate-500/20 text-slate-300"
      )}
    >
      {sentiment}
    </span>
  );
}

function ChartWidget({ symbol, candles }: { symbol: string; candles: Candle[] }) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    chartRef.current.innerHTML = "";
    const chart = createChart(chartRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0b1120" },
        textColor: "#cbd5e1",
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.08)" },
        horzLines: { color: "rgba(148, 163, 184, 0.08)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(148, 163, 184, 0.2)" },
      timeScale: { borderColor: "rgba(148, 163, 184, 0.2)", timeVisible: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const chartAny = chart as any;
    const candleSeries = chartAny.addCandlestickSeries
      ? chartAny.addCandlestickSeries({
          upColor: "#22c55e",
          downColor: "#ef4444",
          borderVisible: false,
          wickUpColor: "#22c55e",
          wickDownColor: "#ef4444",
        })
      : chartAny.addSeries(CandlestickSeries, {
          upColor: "#22c55e",
          downColor: "#ef4444",
          borderVisible: false,
          wickUpColor: "#22c55e",
          wickDownColor: "#ef4444",
        });

    const sma20Series = chartAny.addLineSeries
      ? chartAny.addLineSeries({ color: "#f59e0b", lineWidth: 2 })
      : chartAny.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 2 });

    const sma50Series = chartAny.addLineSeries
      ? chartAny.addLineSeries({ color: "#38bdf8", lineWidth: 2 })
      : chartAny.addSeries(LineSeries, { color: "#38bdf8", lineWidth: 2 });

    const candleData = candles.map((candle) => ({
      time: toBusinessDay(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));

    candleSeries.setData(candleData);

    const closes = candles.map((candle) => candle.close);
    const sma20Data = candles
      .map((candle, index) => {
        const value = index >= 19 ? average(closes.slice(index - 19, index + 1)) : null;
        return value ? { time: toBusinessDay(candle.time), value } : null;
      })
      .filter(Boolean);

    const sma50Data = candles
      .map((candle, index) => {
        const value = index >= 49 ? average(closes.slice(index - 49, index + 1)) : null;
        return value ? { time: toBusinessDay(candle.time), value } : null;
      })
      .filter(Boolean);

    sma20Series.setData(sma20Data);
    sma50Series.setData(sma50Data);

    chart.timeScale().fitContent();

    const tooltip = tooltipRef.current;
    chart.subscribeCrosshairMove((param: any) => {
      if (!tooltip || !param.point || !param.time) {
        if (tooltip) tooltip.style.display = "none";
        return;
      }

      const values = param.seriesData.get(candleSeries);
      if (!values) {
        tooltip.style.display = "none";
        return;
      }

      tooltip.style.display = "block";
      tooltip.style.left = `${Math.min(param.point.x + 14, chartRef.current!.clientWidth - 170)}px`;
      tooltip.style.top = `${Math.max(12, param.point.y - 80)}px`;

      const time = `${param.time.year}-${String(param.time.month).padStart(2, "0")}-${String(param.time.day).padStart(2, "0")}`;
      tooltip.innerHTML = `
        <div class="text-[10px] uppercase tracking-[0.2em] text-slate-400">${symbol}</div>
        <div class="mt-1 text-xs text-slate-300">${time}</div>
        <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-200">
          <span>O ${formatNumber(values.open, 2)}</span>
          <span>H ${formatNumber(values.high, 2)}</span>
          <span>L ${formatNumber(values.low, 2)}</span>
          <span>C ${formatNumber(values.close, 2)}</span>
        </div>
      `;
    });

    const resizeObserver = new ResizeObserver(() => chart.applyOptions({ width: chartRef.current?.clientWidth }));
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [candles, symbol]);

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span className="rounded-full bg-white/5 px-3 py-1">Zoom: scroll / pinch</span>
        <span className="rounded-full bg-white/5 px-3 py-1">Hover for OHLC tooltip</span>
        <span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-300">SMA 20 / SMA 50 overlays</span>
      </div>
      <div ref={chartRef} className="h-[420px] w-full overflow-hidden rounded-xl border border-white/10 bg-[#0b1120]" />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute hidden min-w-[150px] rounded-lg border border-white/10 bg-slate-950/95 p-3 shadow-xl"
      />
    </div>
  );
}

export function App() {
  const [symbolInput, setSymbolInput] = useState("AAPL");
  const [activeSymbol, setActiveSymbol] = useState("AAPL");
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [news, setNews] = useState<NewsItem[]>(() => demoNews("AAPL"));
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [loadingNews, setLoadingNews] = useState(false);
  const [banner, setBanner] = useState<string>("Bloomberg-style student terminal powered by free APIs and client-side analytics.");
  const [sector, setSector] = useState("All");
  const [keyword, setKeyword] = useState("All");
  const [carryPair, setCarryPair] = useState("EUR/USD");


  

  const analytics = useMemo(() => {
  if (!market) {
    return {
      volatility30d: null,
      annualizedReturn: null,
      sma20: null,
      sma50: null,
      rsi14: null,
    };
  }
  return computeAnalytics(market?.candles);
}, [market]);


async function loadDashboard(nextSymbol: string) {
  console.log("loadDashboard lancé avec :", nextSymbol);

  setLoadingMarket(true);

  try {
    const marketData = await fetchMarketData(nextSymbol);
    console.log("marketData reçu :", marketData);

    if (!marketData) return;

    setMarket(marketData);
    setActiveSymbol(marketData.symbol);

  } finally {
    setLoadingMarket(false);
  }
}

  useEffect(() => {
    loadDashboard("AAPL");
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (ALPHA_VANTAGE_KEY) loadDashboard(activeSymbol);
    }, 1000 * 60 * 5);
    return () => window.clearInterval(interval);
  }, [activeSymbol]);

  const filteredNews = useMemo(() => {
    return news.filter((item) => {
      const haystack = `${item.headline} ${item.snippet}`.toLowerCase();
      const matchesKeyword = keyword === "All" ? true : haystack.includes(keyword.toLowerCase());
      const matchesSector =
        sector === "All"
          ? true
          : sector === "Macro"
            ? ["rates", "inflation", "cpi", "fed", "ecb", "boj"].some((term) => haystack.includes(term))
            : haystack.includes(sector.toLowerCase());
      const matchesSymbol = haystack.includes(activeSymbol.replace("/", "").toLowerCase().slice(0, 6)) || sector === "All";
      return matchesKeyword && matchesSector && matchesSymbol;
    });
  }, [news, keyword, sector, activeSymbol]);

  const carry = useMemo(() => {
    const [base, quote] = carryPair.split("/");
    return getCarry(base, quote);
  }, [carryPair]);

  function exportToExcel() {
  if (!market) return;

  // 1️⃣ Sheet KPI
  const kpiData = [
    ["Symbol", market.symbol],
    ["Last Price", market.snapshot.lastPrice],
    ["Daily Change %", market.snapshot.changePct],
    ["Volume", market.snapshot.volume],
    ["High", market.snapshot.high],
    ["Low", market.snapshot.low],
    ["Updated At", market.snapshot.updatedAt],
  ];

  const worksheetKPI = XLSX.utils.aoa_to_sheet(kpiData);

  // 2️⃣ Sheet Time Series (OHLC)
  const timeSeriesData = market.candles.map(c => ({
    Date: c.time,
    Open: c.open,
    High: c.high,
    Low: c.low,
    Close: c.close,
    Volume: c.volume
  }));

  const worksheetTS = XLSX.utils.json_to_sheet(timeSeriesData);

  // 3️⃣ Workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheetKPI, "KPI");
  XLSX.utils.book_append_sheet(workbook, worksheetTS, "TimeSeries");
  // 3️⃣ Sheet News
const newsData = news.map(n => ({
  Date: n.datetime,
  Source: n.source,
  Headline: n.headline,
  Sentiment: n.sentiment
}));

const worksheetNews = XLSX.utils.json_to_sheet(newsData);
XLSX.utils.book_append_sheet(workbook, worksheetNews, "News");

  // 4️⃣ Download
  XLSX.writeFile(workbook, `${market.symbol}_Market_Report.xlsx`);
}

  // ===== RISK REGIME MODEL =====

const riskRegime = useMemo(() => {
  if (!market) return "Loading...";

  const closes = market.candles.map(c => c.close);

  function sma(data: number[], period: number) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const latest = closes[closes.length - 1];

  if (!sma20 || !sma50) return "Loading...";

  if (latest > sma20 && sma20 > sma50) return "Risk-On";
  if (latest < sma20 && sma20 < sma50) return "Risk-Off";

  return "Neutral";
}, [market]);

  const changeTone =
  market && market?.snapshot.changePct > 0
    ? "positive"
    : market && market?.snapshot.changePct < 0
    ? "negative"
    : "neutral";
if (!market) {
  return (
    <div className="min-h-screen bg-[#060b14] flex items-center justify-center text-slate-100">
      Loading market data...
    </div>
  );
}

return (
  <div className="min-h-screen bg-[#060b14] text-slate-100">
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-4 rounded-2xl border border-[#f59e0b]/20 bg-gradient-to-r from-[#111827] via-[#0f172a] to-[#111827] p-5 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-[#f59e0b]/20 bg-[#f59e0b]/10 px-3 py-2 text-sm font-semibold tracking-[0.28em] text-[#fbbf24]">
                  CALVINX
                </div>
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-emerald-300">
                  {market?.source === "live" ? "live feeds" : "demo-safe mode"}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Mini Bloomberg Terminal</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">{banner}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
             
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">AlphaVantage</p>
                <p className="mt-2 text-sm text-slate-200">{ALPHA_VANTAGE_KEY ? "Configured" : "Missing key"}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Finnhub News</p>
                <p className="mt-2 text-sm text-slate-200">{FINNHUB_KEY ? "Configured" : "Missing key → demo headlines"}</p>
              </div>
            </div>
          </div>
        </header>

{/* ===== MARKET REGIME SNAPSHOT ===== */}
<div className="mb-4 grid gap-3 sm:grid-cols-3">
<div className="rounded-xl border border-white/10 bg-black/20 p-4">
  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
    Market Regime
  </p>
  <p
    className={`mt-2 text-lg font-semibold ${
      riskRegime === "Risk-On"
        ? "text-emerald-400"
        : riskRegime === "Risk-Off"
        ? "text-rose-400"
        : "text-slate-100"
    }`}
  >
    {riskRegime}
  </p>
</div>
  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
  </div>


</div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_400px]">
          <div className="space-y-4">
            <Widget title="Market Monitor" subtitle="Search a symbol to refresh the dashboard KPIs, chart, analytics, and news.">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 lg:flex-row">
                  <input
                    value={symbolInput}
                    onChange={(event) => setSymbolInput(event.target.value.toUpperCase())}
                    placeholder="Enter AAPL, EURUSD, BTC..."
                    className="h-12 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-slate-100 outline-none ring-0 transition placeholder:text-slate-500 focus:border-[#f59e0b]/40"
                  />
                  <button
                    onClick={() => loadDashboard(symbolInput)}
                    disabled={loadingMarket}
                    className="h-12 rounded-xl bg-[#f59e0b] px-5 text-sm font-semibold text-slate-950 transition hover:bg-[#fbbf24] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingMarket ? "Loading..." : "Analyze Symbol"}
                  </button>
                  <button
  onClick={exportToExcel}
  className="h-12 rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
>
  Export Excel
</button>

                </div>

                <div className="flex flex-wrap gap-2">
                  {QUICK_SYMBOLS.map((symbol) => (
                    <button
                      key={symbol}
                      onClick={() => {
                        setSymbolInput(symbol);
                        loadDashboard(symbol);
                      }}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-[#f59e0b]/30 hover:text-white"
                    >
                      {symbol}
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard label={`${market?.symbol} Last`} value={formatNumber(market?.snapshot.lastPrice, market?.assetType === "fx" ? 4 : 2)} />
                  <StatCard label="Daily Change" value={formatPercent(market?.snapshot.changePct)} tone={changeTone} />
                  <StatCard label="Volume" value={formatCompact(market?.snapshot.volume)} />
                  <StatCard label="Day Range" value={`${formatNumber(market?.snapshot.low, 2)} - ${formatNumber(market?.snapshot.high, 2)}`} />
                </div>
              </div>
            </Widget>

            <Widget title="Candlestick Chart" subtitle="Last 100 observations from Alpha Vantage with built-in zoom and hover tooltips.">
              <ChartWidget symbol={market?.symbol} candles={market?.candles} />
            </Widget>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <Widget title="Volatility & Return Analytics" subtitle="All analytics are computed client-side from the loaded historical series.">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <StatCard label="30D Volatility" value={formatPercent(analytics.volatility30d)} />
                  <StatCard label="Annualized Return" value={formatPercent(analytics.annualizedReturn)} tone={analytics.annualizedReturn && analytics.annualizedReturn > 0 ? "positive" : analytics.annualizedReturn && analytics.annualizedReturn < 0 ? "negative" : "neutral"} />
                  <StatCard label="SMA 20" value={formatNumber(analytics.sma20, 2)} />
                  <StatCard label="SMA 50" value={formatNumber(analytics.sma50, 2)} />
                  <StatCard label="RSI 14" value={formatNumber(analytics.rsi14, 2)} />
                </div>
                <div className="mt-4 grid gap-3 text-xs text-slate-400 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">Historical volatility annualizes the standard deviation of the last 30 daily returns.</div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">Annualized return extrapolates the most recent 30-day performance over a 252-trading-day year.</div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">SMA 20 and SMA 50 highlight short-term versus medium-term trend direction.</div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">RSI 14 helps identify momentum extremes above 70 or below 30.</div>
                </div>
              </Widget>

              <Widget title="FX Carry Calculator" subtitle="Static policy-rate table for a free, recruiter-friendly carry-trade module.">
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-[0.24em] text-slate-500">Currency Pair</label>
                    <select
                      value={carryPair}
                      onChange={(event) => setCarryPair(event.target.value)}
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-slate-100 outline-none"
                    >
                      {["EUR/USD", "GBP/JPY", "AUD/JPY", "NZD/USD", "USD/CHF", "CAD/JPY"].map((pair) => (
                        <option key={pair} value={pair}>
                          {pair}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard label="Base Rate" value={formatPercent(carry.baseRate)} />
                    <StatCard label="Quote Rate" value={formatPercent(carry.quoteRate)} />
                    <StatCard label="Annualized Carry" value={formatPercent(carry.carry)} tone={carry.carry > 0 ? "positive" : carry.carry < 0 ? "negative" : "neutral"} />
                  </div>
                  <p className="text-xs leading-6 text-slate-400">
                    Simple carry return = base currency policy rate minus quote currency policy rate. This is a simplified educational approximation and does not include funding spreads, forwards, or volatility drag.
                  </p>
                </div>
              </Widget>
            </div>
          </div>

          <div className="space-y-4">
            <Widget title="Market News Feed" subtitle="Live Finnhub headlines with symbol, sector, and macro-keyword filtering.">
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-[0.24em] text-slate-500">Sector</label>
                    <select
                      value={sector}
                      onChange={(event) => setSector(event.target.value)}
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-slate-100 outline-none"
                    >
                      {SECTORS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-[0.24em] text-slate-500">Keyword</label>
                    <select
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-slate-100 outline-none"
                    >
                      {KEYWORDS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    setLoadingNews(true);
                    try {
                      const items = await fetchNews(activeSymbol.replace("/", ""), market?.assetType);
                      setNews(items);
                      setBanner(`News refreshed for ${activeSymbol}.`);
                    } catch (error) {
                      setBanner(error instanceof Error ? error.message : "Unable to refresh news.");
                    } finally {
                      setLoadingNews(false);
                    }
                  }}
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                >
                  {loadingNews ? "Refreshing news..." : "Refresh News Feed"}
                </button>

                <div className="max-h-[920px] space-y-3 overflow-auto pr-1">
                  {filteredNews.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-400">
                      No articles matched the active filters. Try another keyword, sector, or symbol.
                    </div>
                  ) : (
                    filteredNews.map((item, index) => (
                      <a
                        key={`${item.url}-${index}`}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-xl border border-white/10 bg-black/20 p-4 transition hover:border-[#f59e0b]/30 hover:bg-black/30"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{item.source}</div>
                          <SentimentPill sentiment={item.sentiment} />
                        </div>
                        <h3 className="mt-3 text-sm font-semibold leading-6 text-slate-100">{item.headline}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-400">{item.snippet}</p>
                        <div className="mt-3 text-xs text-slate-500">
                          {new Date(item.datetime).toLocaleString()}
                        </div>
                      </a>
                    ))
                  )}
                </div>
              </div>
            </Widget>

            <Widget title="Terminal Notes" subtitle="Deployment-safe guidance for API configuration and recruiter demos.">
              <div className="space-y-3 text-sm leading-6 text-slate-400">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  Alpha Vantage free tier is rate-limited. If the API returns a limit notice, the terminal keeps your existing view and shows a banner instead of crashing.
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  Missing API keys automatically trigger demo-safe mode so the app still renders beautifully on Vercel, Netlify, or GitHub Pages before credentials are added.
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  Use the README for install steps, environment variables, deployment instructions, and the app folder structure.
                </div>
              </div>
            </Widget>
          </div>
        </div>
      </div>
     </div>
);
}