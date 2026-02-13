'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUpRight, ArrowDownLeft, Activity, DollarSign, Database, BookOpen } from 'lucide-react';
import { formatNumber, formatNumberExact } from '@/lib/utils';

function formatCost(cost: number): string {
  if (cost >= 1000) return `$${(cost / 1000).toFixed(1)}K`;
  return `$${cost.toFixed(2)}`;
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
}

export default function StatsOverview({ stats }: StatsOverviewProps) {
  const t = useTranslations('dashboard.stats');

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('totalTokens')}</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-xl xl:text-lg 2xl:text-2xl font-bold truncate" title={formatNumberExact(stats.totalTokens)}>{formatNumber(stats.totalTokens)}</div>
          <p className="text-xs text-muted-foreground">{t('combinedInputOutput')}</p>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('inputTokens')}</CardTitle>
          <ArrowUpRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </CardHeader>
        <CardContent>
          <div className="text-xl xl:text-lg 2xl:text-2xl font-bold truncate" title={formatNumberExact(stats.totalInput)}>{formatNumber(stats.totalInput)}</div>
          <p className="text-xs text-muted-foreground">{t('sentToClaude')}</p>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('outputTokens')}</CardTitle>
          <ArrowDownLeft className="h-4 w-4 text-green-600 dark:text-green-400" />
        </CardHeader>
        <CardContent>
          <div className="text-xl xl:text-lg 2xl:text-2xl font-bold truncate" title={formatNumberExact(stats.totalOutput)}>{formatNumber(stats.totalOutput)}</div>
          <p className="text-xs text-muted-foreground">{t('receivedFromClaude')}</p>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('totalRecords')}</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-xl xl:text-lg 2xl:text-2xl font-bold truncate" title={formatNumberExact(stats.totalRecords)}>{formatNumber(stats.totalRecords)}</div>
          <p className="text-xs text-muted-foreground">{t('usageReports')}</p>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('cacheWrite')}</CardTitle>
          <Database className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        </CardHeader>
        <CardContent>
          <div className="text-xl xl:text-lg 2xl:text-2xl font-bold truncate" title={formatNumberExact(stats.totalCacheCreate)}>{formatNumber(stats.totalCacheCreate)}</div>
          <p className="text-xs text-muted-foreground">{t('cacheWriteTokens')}</p>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('cacheRead')}</CardTitle>
          <BookOpen className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </CardHeader>
        <CardContent>
          <div className="text-xl xl:text-lg 2xl:text-2xl font-bold truncate" title={formatNumberExact(stats.totalCacheRead)}>{formatNumber(stats.totalCacheRead)}</div>
          <p className="text-xs text-muted-foreground">{t('cacheReadTokens')}</p>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('estimatedCost')}</CardTitle>
          <DollarSign className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </CardHeader>
        <CardContent>
          <div className="text-xl xl:text-lg 2xl:text-2xl font-bold truncate" title={formatCost(stats.totalCost)}>{formatCost(stats.totalCost)}</div>
          <p className="text-xs text-muted-foreground">{t('basedOnApiPricing')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
