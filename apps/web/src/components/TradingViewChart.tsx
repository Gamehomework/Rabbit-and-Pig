"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { createChart, ColorType, CrosshairMode, IChartApi, ISeriesApi, UTCTimestamp, Time, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from "lightweight-charts";
import type { ISeriesMarkersPluginApi, SeriesMarkerBarPosition, SeriesMarkerShape, SeriesMarkerBar } from "lightweight-charts";
import type { OHLCVData } from "@/lib/api";

export interface TradingViewChartHandle {
  /** Imperatively update the latest candle without triggering a React re-render. */
  updateLatestCandle: (candle: OHLCVData) => void;
}

export interface ChartMarker {
  time: string | number; // 'YYYY-MM-DD' or timestamp in seconds
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  shape: "circle" | "square" | "arrowUp" | "arrowDown";
  text: string;
}

export interface ChartLine {
  title: string;
  color: string;
  data: { time: string | number; value: number }[];
}

export interface TradingViewChartProps {
  data: OHLCVData[];
  markers?: ChartMarker[];
  lines?: ChartLine[];
}

// Convert date string to UTCTimestamp (seconds)
const formatTime = (dateStr: string | number): UTCTimestamp => {
  if (typeof dateStr === "number") return Math.floor(dateStr) as UTCTimestamp;
  return Math.floor(new Date(dateStr).getTime() / 1000) as UTCTimestamp;
};

const TradingViewChart = forwardRef<TradingViewChartHandle, TradingViewChartProps>(
function TradingViewChart({ data, markers = [], lines = [] }, ref) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const seriesMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  // Expose imperative handle so parent can update the latest candle
  // without triggering a React re-render of this component.
  useImperativeHandle(ref, () => ({
    updateLatestCandle(candle: OHLCVData) {
      const main = mainSeriesRef.current;
      const vol = volumeSeriesRef.current;
      if (!main || !vol) return;
      const time = formatTime(candle.date);
      main.update({ time, open: candle.open ?? 0, high: candle.high ?? 0, low: candle.low ?? 0, close: candle.close ?? 0 });
      vol.update({ time, value: candle.volume ?? 0, color: (candle.close ?? 0) > (candle.open ?? 0) ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)" });
    },
  }));

  // Effect 1: Create/rebuild chart when data changes
  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    // Filter out invalid dates
    const validData = data.filter(d => !isNaN(new Date(d.date).getTime()));

    const candleData = [...validData]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((d) => ({
        time: formatTime(d.date),
        open: d.open ?? 0,
        high: d.high ?? 0,
        low: d.low ?? 0,
        close: d.close ?? 0,
      }));

    const volumeData = [...validData]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((d) => ({
        time: formatTime(d.date),
        value: d.volume ?? 0,
        color: (d.close ?? 0) > (d.open ?? 0) ? "rgba(38, 166, 154, 0.5)" : "rgba(239, 83, 80, 0.5)",
      }));

    // Full rebuild: initial load or range change.
    // Polling updates are handled imperatively via updateLatestCandle() — no re-render needed.
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#666",
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      grid: {
        vertLines: { color: "#f0f3fa" },
        horzLines: { color: "#f0f3fa" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });
    chartRef.current = chart;

    const newMainSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    newMainSeries.setData(candleData);
    mainSeriesRef.current = newMainSeries;

    // Reset markers/lines refs — will be re-applied by Effect 2
    seriesMarkersRef.current = null;
    lineSeriesRef.current = [];

    const newVolumeSeries = chart.addSeries(HistogramSeries, {
      color: "#26a69a",
      priceFormat: { type: "volume" },
      priceScaleId: "", // overlay
    });
    newVolumeSeries.setData(volumeData);
    volumeSeriesRef.current = newVolumeSeries;
    chart.priceScale("").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 }
    });

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeSeriesRef.current = null;
      seriesMarkersRef.current = null;
      lineSeriesRef.current = [];
      chart.remove();
    };
  }, [data]);

  // Effect 2: Update markers and lines without rebuilding the chart
  useEffect(() => {
    const chart = chartRef.current;
    const mainSeries = mainSeriesRef.current;
    if (!chart || !mainSeries) return;

    // Update markers
    if (!seriesMarkersRef.current) {
      seriesMarkersRef.current = createSeriesMarkers(mainSeries);
    }
    if (markers.length > 0) {
      const formattedMarkers: SeriesMarkerBar<Time>[] = markers.map((m) => ({
        time: formatTime(m.time) as Time,
        position: m.position as SeriesMarkerBarPosition,
        shape: m.shape as SeriesMarkerShape,
        color: m.color,
        text: m.text,
      }));
      formattedMarkers.sort((a, b) => (a.time as number) - (b.time as number));
      seriesMarkersRef.current.setMarkers(formattedMarkers);
    } else {
      seriesMarkersRef.current.setMarkers([]);
    }

    // Remove old line series
    lineSeriesRef.current.forEach((ls) => {
      chart.removeSeries(ls);
    });
    lineSeriesRef.current = [];

    // Add new line series
    lines.forEach((line) => {
      const lineSeries = chart.addSeries(LineSeries, {
        color: line.color,
        lineWidth: 2,
        title: line.title,
      });
      const formattedLineData = line.data.map((d) => ({
        time: formatTime(d.time) as Time,
        value: d.value,
      })).sort((a, b) => (a.time as number) - (b.time as number));
      lineSeries.setData(formattedLineData);
      lineSeriesRef.current.push(lineSeries);
    });
  }, [markers, lines]);

  return (
    <div className="relative w-full h-[400px]">
      <div ref={chartContainerRef} className="absolute inset-0" />
    </div>
  );
});

TradingViewChart.displayName = "TradingViewChart";
export default TradingViewChart;
