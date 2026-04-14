"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, CrosshairMode, IChartApi, UTCTimestamp, Time, SeriesMarkerPosition, SeriesMarkerShape, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from "lightweight-charts";
import type { OHLCVData } from "@/lib/api";

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

export default function TradingViewChart({ data, markers = [], lines = [] }: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    // Convert date string to UTCTimestamp (seconds)
    const formatTime = (dateStr: string | number): UTCTimestamp => {
      if (typeof dateStr === "number") return Math.floor(dateStr) as UTCTimestamp;
      return Math.floor(new Date(dateStr).getTime() / 1000) as UTCTimestamp;
    };

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

    const mainSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    mainSeries.setData(candleData);

    // Apply markers
    if (markers.length > 0) {
      const formattedMarkers = markers.map((m) => ({
        ...m,
        time: formatTime(m.time) as Time,
        position: m.position as SeriesMarkerPosition,
        shape: m.shape as SeriesMarkerShape,
      })).sort((a, b) => (a.time as number) - (b.time as number));
      
      mainSeries.setMarkers(formattedMarkers);
    }

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#26a69a",
      priceFormat: { type: "volume" },
      priceScaleId: "", // overlay
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
    volumeSeries.setData(volumeData);

    // Add extra lines
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
      chart.remove();
    };
  }, [data, markers, lines]);

  return (
    <div className="relative w-full h-[400px]">
      <div ref={chartContainerRef} className="absolute inset-0" />
    </div>
  );
}
