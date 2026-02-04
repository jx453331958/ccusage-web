'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Interval } from './DashboardClient';

// Dynamic import to avoid SSR issues with ECharts
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface TrendData {
  timestamp: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

interface ModelTrendData {
  timestamp: number;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
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

// Color palette for models
const MODEL_COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#48b8d0',
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
  const [viewMode, setViewMode] = useState<ViewMode>('total');

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
    const timestamps = trendData.map((d) => d.timestamp);

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const timestamp = params[0]?.axisValue;
          let html = `<div style="font-weight:bold;margin-bottom:4px">${formatFullTime(timestamp)}</div>`;
          params.forEach((p: any) => {
            html += `<div style="display:flex;align-items:center;gap:8px">
              <span style="display:inline-block;width:10px;height:10px;background:${p.color};border-radius:50%"></span>
              <span>${p.seriesName}:</span>
              <span style="font-weight:bold">${formatNumber(p.value)}</span>
            </div>`;
          });
          return html;
        },
      },
      legend: {
        data: [t('inputTokens'), t('outputTokens'), t('totalTokens')],
        bottom: 0,
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
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (value: number) => formatNumber(value),
        },
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
        },
      ],
      series: [
        {
          name: t('inputTokens'),
          type: 'line',
          data: trendData.map((d) => d.input_tokens),
          smooth: true,
          itemStyle: { color: '#3b82f6' },
        },
        {
          name: t('outputTokens'),
          type: 'line',
          data: trendData.map((d) => d.output_tokens),
          smooth: true,
          itemStyle: { color: '#10b981' },
        },
        {
          name: t('totalTokens'),
          type: 'line',
          data: trendData.map((d) => d.total_tokens),
          smooth: true,
          itemStyle: { color: '#8b5cf6' },
        },
      ],
    };
  }, [trendData, effectiveInterval, t]);

  // Build chart options for model view
  const modelChartOption = useMemo(() => {
    // Get all unique timestamps
    const timestampSet = new Set<number>();
    modelTrendData.forEach((d) => timestampSet.add(d.timestamp));
    const timestamps = Array.from(timestampSet).sort((a, b) => a - b);

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

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const timestamp = params[0]?.axisValue;
          let html = `<div style="font-weight:bold;margin-bottom:4px">${formatFullTime(timestamp)}</div>`;
          // Sort by value descending
          const sorted = [...params].sort((a: any, b: any) => b.value - a.value);
          sorted.forEach((p: any) => {
            if (p.value > 0) {
              html += `<div style="display:flex;align-items:center;gap:8px">
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
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (value: number) => formatNumber(value),
        },
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
        },
      ],
      series,
    };
  }, [modelTrendData, models, effectiveInterval, t]);

  const chartOption = viewMode === 'total' ? totalChartOption : modelChartOption;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="space-y-2">
              <CardTitle>{t('title')}</CardTitle>
              <CardDescription>
                {t('description')} · {t('currentInterval')}: {t(`interval.${effectiveInterval}`)}
              </CardDescription>
            </div>
            <div className="flex gap-2">
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
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">{t('intervalLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {INTERVAL_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={interval === option.value ? 'default' : 'outline'}
                  onClick={() => onIntervalChange(option.value)}
                >
                  {t(`interval.${option.labelKey}`)}
                </Button>
              ))}
            </div>
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
              <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center">
                <div className="text-sm text-gray-500">Loading...</div>
              </div>
            )}
            <ReactECharts
              option={chartOption}
              style={{ height: '400px', width: '100%' }}
              opts={{ renderer: 'svg' }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
