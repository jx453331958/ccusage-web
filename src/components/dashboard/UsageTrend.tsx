'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatNumber } from '@/lib/utils';

interface TrendData {
  date: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

interface UsageTrendProps {
  trendData: TrendData[];
}

export default function UsageTrend({ trendData }: UsageTrendProps) {
  const t = useTranslations('dashboard.usageTrend');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
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
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
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
