'use client';

import { useMemo, useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Interval } from './DashboardClient';

// Dynamic import to avoid SSR issues with ECharts
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface TrendData {
  timestamp: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_create_tokens: number;
  cache_read_tokens: number;
  cost?: number;
}

interface ModelTrendData {
  timestamp: number;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_create_tokens: number;
  cache_read_tokens: number;
  cost?: number;
}

interface UsageTrendProps {
  trendData: TrendData[];
  modelTrendData: ModelTrendData[];
  interval: Interval;
  effectiveInterval: string;
  onIntervalChange: (interval: Interval) => void;
  loading?: boolean;
}

const INTERVAL_OPTIONS: { value: Interval; labelKey: string }[] = [
  { value: 'auto', labelKey: 'auto' },
  { value: '1m', labelKey: '1m' },
  { value: '5m', labelKey: '5m' },
  { value: '15m', labelKey: '15m' },
  { value: '30m', labelKey: '30m' },
  { value: '1h', labelKey: '1h' },
  { value: '1d', labelKey: '1d' },
];

// Color palette for models (muted tones that work on both light and dark)
const MODEL_COLORS = [
  '#6b8fd4', '#7ec08a', '#e0b850', '#d47272', '#7bb8d0',
  '#4da87c', '#e08a5e', '#9870b0', '#d48ab0', '#58b4c4',
];

function formatTime(timestamp: number, interval: string): string {
  const date = new Date(timestamp * 1000);
  if (interval === '1d') {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatFullTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

function formatCostValue(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  if (value >= 0.001) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
}

type ViewMode = 'total' | 'model';

export default function UsageTrend({
  trendData,
  modelTrendData,
  interval,
  effectiveInterval,
  onIntervalChange,
  loading = false,
}: UsageTrendProps) {
  const t = useTranslations('dashboard.usageTrend');
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('total');
  const [showZeroValues, setShowZeroValues] = useState(false);

  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';

  // Get unique models
  const models = useMemo(() => {
    const modelSet = new Set<string>();
    modelTrendData.forEach((d) => {
      if (d.model) modelSet.add(d.model);
    });
    return Array.from(modelSet).sort();
  }, [modelTrendData]);

  // Build chart options for total view
  const totalChartOption = useMemo(() => {
    // Filter out zero values if showZeroValues is false
    const filteredData = showZeroValues
      ? trendData
      : trendData.filter((d) => d.input_tokens > 0 || d.output_tokens > 0 || d.total_tokens > 0);
    const timestamps = filteredData.map((d) => d.timestamp);

    const textColor = isDark ? '#b0b8c8' : '#374151';
    const tooltipBg = isDark ? '#1e2536' : '#fff';
    const tooltipBorder = isDark ? '#2d3548' : '#e5e7eb';
    const tooltipTextColor = isDark ? '#c8cdd8' : '#111827';

    return {
      darkMode: isDark,
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipTextColor },
        formatter: (params: any) => {
          const timestamp = params[0]?.axisValue;
          let html = `<div style="font-weight:bold;margin-bottom:4px;color:${tooltipTextColor}">${formatFullTime(timestamp)}</div>`;
          params.forEach((p: any) => {
            const isCost = p.seriesName === t('cost');
            const displayValue = isCost ? formatCostValue(p.value) : formatNumber(p.value);
            html += `<div style="display:flex;align-items:center;gap:8px;color:${tooltipTextColor}">
              <span style="display:inline-block;width:10px;height:10px;background:${p.color};border-radius:50%"></span>
              <span>${p.seriesName}:</span>
              <span style="font-weight:bold">${displayValue}</span>
            </div>`;
          });
          return html;
        },
      },
      legend: {
        data: [t('inputTokens'), t('outputTokens'), t('totalTokens'), t('cacheWrite'), t('cacheRead'), t('cost')],
        bottom: 0,
        textStyle: { color: textColor },
      },
      grid: {
        left: 60,
        right: 70,
        top: 20,
        bottom: 80,
      },
      xAxis: {
        type: 'category',
        data: timestamps,
        axisLabel: {
          formatter: (value: number) => formatTime(value, effectiveInterval),
          color: textColor,
        },
      },
      yAxis: [
        {
          type: 'value',
          axisLabel: {
            formatter: (value: number) => formatNumber(value),
            color: textColor,
          },
          splitLine: { lineStyle: { color: isDark ? '#252d3d' : '#e5e7eb' } },
        },
        {
          type: 'value',
          position: 'right',
          axisLabel: {
            formatter: (value: number) => formatCostValue(value),
            color: isDark ? '#fbbf24' : '#d97706',
          },
          splitLine: { show: false },
        },
      ],
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100,
        },
        {
          type: 'slider',
          start: 0,
          end: 100,
          bottom: 30,
          textStyle: { color: textColor },
        },
      ],
      series: [
        {
          name: t('inputTokens'),
          type: 'line',
          yAxisIndex: 0,
          data: filteredData.map((d) => d.input_tokens),
          smooth: true,
          itemStyle: { color: isDark ? '#6b9cf7' : '#3b82f6' },
        },
        {
          name: t('outputTokens'),
          type: 'line',
          yAxisIndex: 0,
          data: filteredData.map((d) => d.output_tokens),
          smooth: true,
          itemStyle: { color: isDark ? '#4ec9a0' : '#10b981' },
        },
        {
          name: t('totalTokens'),
          type: 'line',
          yAxisIndex: 0,
          data: filteredData.map((d) => d.total_tokens),
          smooth: true,
          itemStyle: { color: isDark ? '#a78bfa' : '#8b5cf6' },
        },
        {
          name: t('cacheWrite'),
          type: 'line',
          yAxisIndex: 0,
          data: filteredData.map((d) => d.cache_create_tokens || 0),
          smooth: true,
          itemStyle: { color: isDark ? '#f97316' : '#ea580c' },
        },
        {
          name: t('cacheRead'),
          type: 'line',
          yAxisIndex: 0,
          data: filteredData.map((d) => d.cache_read_tokens || 0),
          smooth: true,
          itemStyle: { color: isDark ? '#c084fc' : '#9333ea' },
        },
        {
          name: t('cost'),
          type: 'line',
          yAxisIndex: 1,
          data: filteredData.map((d) => d.cost || 0),
          smooth: true,
          itemStyle: { color: isDark ? '#fbbf24' : '#d97706' },
          lineStyle: { type: 'dashed' },
        },
      ],
    };
  }, [trendData, effectiveInterval, t, showZeroValues, isDark]);

  // Build chart options for model view
  const modelChartOption = useMemo(() => {
    // Get all unique timestamps
    const timestampSet = new Set<number>();
    modelTrendData.forEach((d) => timestampSet.add(d.timestamp));
    const allTimestamps = Array.from(timestampSet).sort((a, b) => a - b);

    // Build data map: model -> timestamp -> total_tokens
    const modelDataMap = new Map<string, Map<number, number>>();
    models.forEach((model) => {
      modelDataMap.set(model, new Map());
    });
    modelTrendData.forEach((d) => {
      if (d.model && modelDataMap.has(d.model)) {
        modelDataMap.get(d.model)!.set(d.timestamp, d.total_tokens);
      }
    });

    // Filter out timestamps where all models have zero values
    const timestamps = showZeroValues
      ? allTimestamps
      : allTimestamps.filter((ts) => {
          return models.some((model) => {
            const value = modelDataMap.get(model)?.get(ts) || 0;
            return value > 0;
          });
        });

    // Build series
    const series = models.map((model, index) => {
      const dataMap = modelDataMap.get(model)!;
      return {
        name: model || t('unknownModel'),
        type: 'line',
        data: timestamps.map((ts) => dataMap.get(ts) || 0),
        smooth: true,
        itemStyle: { color: MODEL_COLORS[index % MODEL_COLORS.length] },
      };
    });

    const textColor = isDark ? '#b0b8c8' : '#374151';
    const tooltipBg = isDark ? '#1e2536' : '#fff';
    const tooltipBorder = isDark ? '#2d3548' : '#e5e7eb';
    const tooltipTextColor = isDark ? '#c8cdd8' : '#111827';

    return {
      darkMode: isDark,
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipTextColor },
        formatter: (params: any) => {
          const timestamp = params[0]?.axisValue;
          let html = `<div style="font-weight:bold;margin-bottom:4px;color:${tooltipTextColor}">${formatFullTime(timestamp)}</div>`;
          // Sort by value descending
          const sorted = [...params].sort((a: any, b: any) => b.value - a.value);
          sorted.forEach((p: any) => {
            if (p.value > 0) {
              html += `<div style="display:flex;align-items:center;gap:8px;color:${tooltipTextColor}">
                <span style="display:inline-block;width:10px;height:10px;background:${p.color};border-radius:50%"></span>
                <span>${p.seriesName}:</span>
                <span style="font-weight:bold">${formatNumber(p.value)}</span>
              </div>`;
            }
          });
          return html;
        },
      },
      legend: {
        data: models.map((m) => m || t('unknownModel')),
        bottom: 0,
        type: 'scroll',
        textStyle: { color: textColor },
      },
      grid: {
        left: 60,
        right: 20,
        top: 20,
        bottom: 80,
      },
      xAxis: {
        type: 'category',
        data: timestamps,
        axisLabel: {
          formatter: (value: number) => formatTime(value, effectiveInterval),
          color: textColor,
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (value: number) => formatNumber(value),
          color: textColor,
        },
        splitLine: { lineStyle: { color: isDark ? '#252d3d' : '#e5e7eb' } },
      },
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100,
        },
        {
          type: 'slider',
          start: 0,
          end: 100,
          bottom: 30,
          textStyle: { color: textColor },
        },
      ],
      series,
    };
  }, [modelTrendData, models, effectiveInterval, t, showZeroValues, isDark]);

  const chartOption = viewMode === 'total' ? totalChartOption : modelChartOption;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex flex-col gap-3">
          {/* Title + desktop controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="space-y-1">
              <CardTitle>{t('title')}</CardTitle>
              <CardDescription>
                {t('description')} · {t('currentInterval')}: {t(`interval.${effectiveInterval}`)}
              </CardDescription>
            </div>
            {/* Desktop: inline view mode + show zero */}
            <div className="hidden sm:flex items-center gap-3">
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant={viewMode === 'total' ? 'default' : 'outline'}
                  onClick={() => setViewMode('total')}
                >
                  {t('viewTotal')}
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'model' ? 'default' : 'outline'}
                  onClick={() => setViewMode('model')}
                >
                  {t('viewByModel')}
                </Button>
              </div>
              <div className="h-5 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Switch
                  id="show-zero"
                  checked={showZeroValues}
                  onCheckedChange={setShowZeroValues}
                />
                <Label htmlFor="show-zero" className="text-sm cursor-pointer">
                  {t('showZeroValues')}
                </Label>
              </div>
            </div>
          </div>

          {/* Mobile: segmented control for view mode */}
          <div className="sm:hidden">
            <div className="flex rounded-lg bg-muted p-1">
              <button
                className={cn(
                  'flex-1 text-center text-sm font-medium py-1.5 rounded-md transition-all',
                  viewMode === 'total'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground'
                )}
                onClick={() => setViewMode('total')}
              >
                {t('viewTotal')}
              </button>
              <button
                className={cn(
                  'flex-1 text-center text-sm font-medium py-1.5 rounded-md transition-all',
                  viewMode === 'model'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground'
                )}
                onClick={() => setViewMode('model')}
              >
                {t('viewByModel')}
              </button>
            </div>
          </div>

          {/* Interval selector: scrollable on mobile, wrapping on desktop */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto sm:overflow-visible sm:flex-wrap scrollbar-hide -mx-6 px-6 sm:mx-0 sm:px-0">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap shrink-0">
              {t('intervalLabel')}
            </span>
            {INTERVAL_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={interval === option.value ? 'default' : 'outline'}
                onClick={() => onIntervalChange(option.value)}
                className="shrink-0 h-7 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm"
              >
                {t(`interval.${option.labelKey}`)}
              </Button>
            ))}
          </div>

          {/* Mobile: show zero values toggle */}
          <div className="sm:hidden flex items-center justify-between">
            <Label htmlFor="show-zero-mobile" className="text-sm text-muted-foreground cursor-pointer">
              {t('showZeroValues')}
            </Label>
            <Switch
              id="show-zero-mobile"
              checked={showZeroValues}
              onCheckedChange={setShowZeroValues}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {trendData.length === 0 && !loading ? (
          <div className="text-center py-12 text-muted-foreground">
            {t('noData')}
          </div>
        ) : (
          <div className="w-full relative">
            {loading && (
              <div className="absolute inset-0 bg-background/70 z-10 flex items-center justify-center backdrop-blur-[1px] transition-opacity duration-200">
                <div className="flex items-center gap-2 text-muted-foreground bg-background/90 px-4 py-2 rounded-full shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-medium">{t('loading')}</span>
                </div>
              </div>
            )}
            <ReactECharts
              option={chartOption}
              notMerge={true}
              style={{ height: '400px', width: '100%' }}
              opts={{ renderer: 'svg' }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
