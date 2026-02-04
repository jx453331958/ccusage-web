'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatNumber } from '@/lib/utils';

interface ModelStat {
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  record_count: number;
}

interface ModelBreakdownProps {
  modelStats: ModelStat[];
}

// Color palette for models
const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4-5-20251101': '#8b5cf6',     // purple
  'claude-sonnet-4-20250514': '#3b82f6',      // blue
  'claude-3-7-sonnet-20250219': '#06b6d4',   // cyan
  'claude-3-5-sonnet-20241022': '#10b981',   // green
  'claude-3-5-haiku-20241022': '#f59e0b',    // amber
  'unknown': '#6b7280',                       // gray
};

const FALLBACK_COLORS = [
  '#ec4899', // pink
  '#f97316', // orange
  '#84cc16', // lime
  '#14b8a6', // teal
  '#a855f7', // violet
];

function getModelColor(model: string, index: number): string {
  // Check for exact match
  if (MODEL_COLORS[model]) {
    return MODEL_COLORS[model];
  }
  // Check for partial match (model name contains)
  const lowerModel = model.toLowerCase();
  if (lowerModel.includes('opus')) return MODEL_COLORS['claude-opus-4-5-20251101'];
  if (lowerModel.includes('sonnet')) return MODEL_COLORS['claude-sonnet-4-20250514'];
  if (lowerModel.includes('haiku')) return MODEL_COLORS['claude-3-5-haiku-20241022'];
  // Use fallback color
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function getModelDisplayName(model: string): string {
  if (model === 'unknown') return model;
  // Simplify model names for display
  const lowerModel = model.toLowerCase();
  if (lowerModel.includes('opus-4-5')) return 'Opus 4.5';
  if (lowerModel.includes('sonnet-4-')) return 'Sonnet 4';
  if (lowerModel.includes('3-7-sonnet')) return 'Sonnet 3.7';
  if (lowerModel.includes('3-5-sonnet')) return 'Sonnet 3.5';
  if (lowerModel.includes('3-5-haiku')) return 'Haiku 3.5';
  if (lowerModel.includes('opus')) return 'Opus';
  if (lowerModel.includes('sonnet')) return 'Sonnet';
  if (lowerModel.includes('haiku')) return 'Haiku';
  return model;
}

export default function ModelBreakdown({ modelStats }: ModelBreakdownProps) {
  const t = useTranslations('dashboard.modelBreakdown');

  // Transform data for pie chart
  const pieData = modelStats.map((stat, index) => ({
    name: getModelDisplayName(stat.model),
    value: stat.total_tokens,
    color: getModelColor(stat.model, index),
    fullName: stat.model,
  }));

  const totalTokens = modelStats.reduce((sum, stat) => sum + stat.total_tokens, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {modelStats.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {t('noData')}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Pie Chart */}
            <div className="min-h-[250px]">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatNumber(value)}
                    labelStyle={{ color: '#000' }}
                  />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Model Details List */}
            <div className="space-y-3">
              {modelStats.map((stat, index) => {
                const percentage = totalTokens > 0
                  ? ((stat.total_tokens / totalTokens) * 100).toFixed(1)
                  : '0';
                const displayName = getModelDisplayName(stat.model);
                const color = getModelColor(stat.model, index);

                return (
                  <div key={stat.model} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm truncate" title={stat.model}>
                          {stat.model === 'unknown' ? t('unknownModel') : displayName}
                        </span>
                        <span className="text-sm text-muted-foreground ml-2">
                          {percentage}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        <span>{formatNumber(stat.total_tokens)} tokens</span>
                        <span className="mx-2">·</span>
                        <span>{t('in')}: {formatNumber(stat.input_tokens)}</span>
                        <span className="mx-2">·</span>
                        <span>{t('out')}: {formatNumber(stat.output_tokens)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
