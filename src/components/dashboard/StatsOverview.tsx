'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUpRight, ArrowDownLeft, Activity } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface StatsOverviewProps {
  stats: {
    totalInput: number;
    totalOutput: number;
    totalTokens: number;
    totalRecords: number;
  };
}

export default function StatsOverview({ stats }: StatsOverviewProps) {
  const t = useTranslations('dashboard.stats');

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('totalTokens')}</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatNumber(stats.totalTokens)}</div>
          <p className="text-xs text-muted-foreground">{t('combinedInputOutput')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('inputTokens')}</CardTitle>
          <ArrowUpRight className="h-4 w-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatNumber(stats.totalInput)}</div>
          <p className="text-xs text-muted-foreground">{t('sentToClaude')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('outputTokens')}</CardTitle>
          <ArrowDownLeft className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatNumber(stats.totalOutput)}</div>
          <p className="text-xs text-muted-foreground">{t('receivedFromClaude')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('totalRecords')}</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatNumber(stats.totalRecords)}</div>
          <p className="text-xs text-muted-foreground">{t('usageReports')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
