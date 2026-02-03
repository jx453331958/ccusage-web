'use client';

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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage Trend</CardTitle>
        <CardDescription>Daily token usage over time</CardDescription>
      </CardHeader>
      <CardContent>
        {trendData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No data available for the selected period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis tickFormatter={(value) => formatNumber(value)} />
              <Tooltip
                formatter={(value: number) => formatNumber(value)}
                labelStyle={{ color: '#000' }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="input_tokens"
                stroke="#3b82f6"
                name="Input Tokens"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="output_tokens"
                stroke="#10b981"
                name="Output Tokens"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="total_tokens"
                stroke="#8b5cf6"
                name="Total Tokens"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
