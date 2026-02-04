'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatNumber } from '@/lib/utils';
import { Settings2 } from 'lucide-react';

interface TrendData {
  date: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

interface UsageTrendProps {
  trendData: TrendData[];
  granularity?: 'hourly' | 'daily';
}

type XAxisTickCount = 'auto' | 'all' | '5' | '10' | '15' | '20';

// Format date for X-axis based on granularity
function formatXAxis(date: string, granularity: 'hourly' | 'daily'): string {
  if (granularity === 'hourly') {
    // date is "YYYY-MM-DD HH:00", extract time part
    const timePart = date.split(' ')[1];
    return timePart || date;
  }
  // date is "YYYY-MM-DD", extract month-day
  const parts = date.split('-');
  if (parts.length === 3) {
    return `${parts[1]}-${parts[2]}`;
  }
  return date;
}

// Calculate interval based on tick count setting
function calculateInterval(dataLength: number, tickCount: XAxisTickCount): number | 'preserveStartEnd' {
  if (tickCount === 'auto') {
    return 'preserveStartEnd';
  }
  if (tickCount === 'all') {
    return 0;
  }
  const count = parseInt(tickCount, 10);
  if (dataLength <= count) {
    return 0;
  }
  return Math.ceil(dataLength / count) - 1;
}

export default function UsageTrend({ trendData, granularity = 'daily' }: UsageTrendProps) {
  const t = useTranslations('dashboard.usageTrend');
  const [showSettings, setShowSettings] = useState(false);
  const [xAxisTickCount, setXAxisTickCount] = useState<XAxisTickCount>('auto');
  const [xAxisAngle, setXAxisAngle] = useState<number>(0);

  const description = granularity === 'hourly' ? t('descriptionHourly') : t('description');
  const interval = calculateInterval(trendData.length, xAxisTickCount);

  const tickCountOptions: { value: XAxisTickCount; label: string }[] = [
    { value: 'auto', label: t('xAxis.auto') },
    { value: 'all', label: t('xAxis.all') },
    { value: '5', label: '5' },
    { value: '10', label: '10' },
    { value: '15', label: '15' },
    { value: '20', label: '20' },
  ];

  const angleOptions: { value: number; label: string }[] = [
    { value: 0, label: '0°' },
    { value: -30, label: '-30°' },
    { value: -45, label: '-45°' },
    { value: -90, label: '-90°' },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className="flex-shrink-0 w-full sm:w-auto"
          >
            <Settings2 className="h-4 w-4 mr-2" />
            {t('chartSettings')}
          </Button>
        </div>

        {showSettings && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">{t('xAxis.tickCount')}</label>
              <div className="flex flex-wrap gap-2">
                {tickCountOptions.map((option) => (
                  <Button
                    key={option.value}
                    size="sm"
                    variant={xAxisTickCount === option.value ? 'default' : 'outline'}
                    onClick={() => setXAxisTickCount(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">{t('xAxis.labelAngle')}</label>
              <div className="flex flex-wrap gap-2">
                {angleOptions.map((option) => (
                  <Button
                    key={option.value}
                    size="sm"
                    variant={xAxisAngle === option.value ? 'default' : 'outline'}
                    onClick={() => setXAxisAngle(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {trendData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {t('noData')}
          </div>
        ) : (
          <div className="min-w-[300px] w-full">
            <ResponsiveContainer width="100%" height={xAxisAngle !== 0 ? 350 : 300}>
              <LineChart data={trendData} margin={{ bottom: xAxisAngle !== 0 ? 50 : 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  interval={interval}
                  angle={xAxisAngle}
                  textAnchor={xAxisAngle !== 0 ? 'end' : 'middle'}
                  height={xAxisAngle !== 0 ? 80 : 30}
                  tickFormatter={(value) => formatXAxis(value, granularity)}
                />
                <YAxis
                  tickFormatter={(value) => formatNumber(value)}
                  tick={{ fontSize: 12 }}
                  width={60}
                />
                <Tooltip
                  formatter={(value: number) => formatNumber(value)}
                  labelStyle={{ color: '#000' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="input_tokens"
                  stroke="#3b82f6"
                  name={t('inputTokens')}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="output_tokens"
                  stroke="#10b981"
                  name={t('outputTokens')}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="total_tokens"
                  stroke="#8b5cf6"
                  name={t('totalTokens')}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
