'use client';

import { useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUpRight, ArrowDownLeft, Activity, DollarSign, Database, BookOpen } from 'lucide-react';
import { formatNumber, formatNumberExact } from '@/lib/utils';

function formatCost(cost: number): string {
  if (cost >= 1000) return `$${(cost / 1000).toFixed(1)}K`;
  return `$${cost.toFixed(2)}`;
}

function formatModelName(model: string): string {
  return model
    .replace('claude-', '')
    .replace(/-\d{8}$/, '');
}

interface ModelStat {
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_create_tokens: number;
  cache_read_tokens: number;
  record_count: number;
  cost: number;
}

interface StatsOverviewProps {
  stats: {
    totalInput: number;
    totalOutput: number;
    totalTokens: number;
    totalCacheCreate: number;
    totalCacheRead: number;
    totalRecords: number;
    totalCost: number;
  };
  modelStats?: ModelStat[];
}

function StatCard({
  title,
  value,
  formattedValue,
  subtitle,
  icon,
  modelStats,
  field,
  formatter,
}: {
  title: string;
  value: string;
  formattedValue: string;
  subtitle: string;
  icon: React.ReactNode;
  modelStats?: ModelStat[];
  field: keyof ModelStat;
  formatter: (v: number) => string;
}) {
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const hasDetail = modelStats && modelStats.length > 0;

  const sorted = hasDetail
    ? [...modelStats]
        .map(m => ({ model: m.model, value: m[field] as number }))
        .filter(m => m.value > 0)
        .sort((a, b) => b.value - a.value)
    : [];

  const handleEnter = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHovered(true);
  }, []);

  const handleLeave = useCallback(() => {
    timerRef.current = setTimeout(() => setHovered(false), 100);
  }, []);

  const showDetail = hovered && sorted.length > 0;

  return (
    <Card
      className="min-w-0 overflow-hidden relative cursor-default"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="relative">
        {/* Main value - always visible, fades when detail shown */}
        <div className={`transition-opacity duration-200 ${showDetail ? 'opacity-0' : 'opacity-100'}`}>
          <div className="text-xl xl:text-lg 2xl:text-2xl font-bold truncate" title={formattedValue}>{value}</div>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>

        {/* Detail overlay - positioned on top of main value */}
        {sorted.length > 0 && (
          <div
            className={`absolute inset-0 px-6 pb-6 flex flex-col justify-center transition-opacity duration-200 ${
              showDetail ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="space-y-1">
              {sorted.map(item => (
                <div key={item.model} className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground truncate" title={item.model}>
                    {formatModelName(item.model)}
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums whitespace-nowrap">
                    {formatter(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StatsOverview({ stats, modelStats }: StatsOverviewProps) {
  const t = useTranslations('dashboard.stats');

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      <StatCard
        title={t('totalTokens')}
        value={formatNumber(stats.totalTokens)}
        formattedValue={formatNumberExact(stats.totalTokens)}
        subtitle={t('combinedInputOutput')}
        icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        modelStats={modelStats}
        field="total_tokens"
        formatter={formatNumberExact}
      />

      <StatCard
        title={t('inputTokens')}
        value={formatNumber(stats.totalInput)}
        formattedValue={formatNumberExact(stats.totalInput)}
        subtitle={t('sentToClaude')}
        icon={<ArrowUpRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
        modelStats={modelStats}
        field="input_tokens"
        formatter={formatNumberExact}
      />

      <StatCard
        title={t('outputTokens')}
        value={formatNumber(stats.totalOutput)}
        formattedValue={formatNumberExact(stats.totalOutput)}
        subtitle={t('receivedFromClaude')}
        icon={<ArrowDownLeft className="h-4 w-4 text-green-600 dark:text-green-400" />}
        modelStats={modelStats}
        field="output_tokens"
        formatter={formatNumberExact}
      />

      <StatCard
        title={t('cacheWrite')}
        value={formatNumber(stats.totalCacheCreate)}
        formattedValue={formatNumberExact(stats.totalCacheCreate)}
        subtitle={t('cacheWriteTokens')}
        icon={<Database className="h-4 w-4 text-orange-600 dark:text-orange-400" />}
        modelStats={modelStats}
        field="cache_create_tokens"
        formatter={formatNumberExact}
      />

      <StatCard
        title={t('cacheRead')}
        value={formatNumber(stats.totalCacheRead)}
        formattedValue={formatNumberExact(stats.totalCacheRead)}
        subtitle={t('cacheReadTokens')}
        icon={<BookOpen className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
        modelStats={modelStats}
        field="cache_read_tokens"
        formatter={formatNumberExact}
      />

      <StatCard
        title={t('estimatedCost')}
        value={formatCost(stats.totalCost)}
        formattedValue={formatCost(stats.totalCost)}
        subtitle={t('basedOnApiPricing')}
        icon={<DollarSign className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
        modelStats={modelStats}
        field="cost"
        formatter={formatCost}
      />
    </div>
  );
}
