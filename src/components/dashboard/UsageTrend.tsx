'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatNumber } from '@/lib/utils';
import type { Interval } from './DashboardClient';

interface TrendData {
  timestamp: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

interface UsageTrendProps {
  trendData: TrendData[];
  interval: Interval;
  effectiveInterval: string;
  onIntervalChange: (interval: Interval) => void;
}

// Format timestamp for X-axis based on interval (uses browser's local timezone)
function formatXAxis(timestamp: number, interval: string): string {
  const date = new Date(timestamp * 1000);

  if (interval === '1d') {
    // Show month-day for daily interval
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}-${day}`;
  }

  // Show time (HH:MM) for minute/hour intervals
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Format timestamp for tooltip (full date and time)
function formatTooltipLabel(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
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

export default function UsageTrend({ trendData, interval, effectiveInterval, onIntervalChange }: UsageTrendProps) {
  const t = useTranslations('dashboard.usageTrend');

  // Calculate dynamic interval for X-axis ticks
  const dataLength = trendData.length;
  const tickInterval = dataLength > 20 ? Math.ceil(dataLength / 15) - 1 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>
              {t('description')} · {t('currentInterval')}: {t(`interval.${effectiveInterval}`)}
            </CardDescription>
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
      <CardContent className="overflow-x-auto">
        {trendData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {t('noData')}
          </div>
        ) : (
          <div className="min-w-[300px] w-full">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  tick={{ fontSize: 12 }}
                  interval={tickInterval}
                  tickFormatter={(value) => formatXAxis(value, effectiveInterval)}
                />
                <YAxis
                  tickFormatter={(value) => formatNumber(value)}
                  tick={{ fontSize: 12 }}
                  width={60}
                />
                <Tooltip
                  formatter={(value: number) => formatNumber(value)}
                  labelFormatter={(value: number) => formatTooltipLabel(value)}
                  labelStyle={{ color: '#000' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="input_tokens"
                  stroke="#3b82f6"
                  name={t('inputTokens')}
                  strokeWidth={2}
                  dot={dataLength <= 30}
                />
                <Line
                  type="monotone"
                  dataKey="output_tokens"
                  stroke="#10b981"
                  name={t('outputTokens')}
                  strokeWidth={2}
                  dot={dataLength <= 30}
                />
                <Line
                  type="monotone"
                  dataKey="total_tokens"
                  stroke="#8b5cf6"
                  name={t('totalTokens')}
                  strokeWidth={2}
                  dot={dataLength <= 30}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
