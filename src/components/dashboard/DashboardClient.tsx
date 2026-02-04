'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Activity, Database, Cpu, Settings } from 'lucide-react';
import StatsOverview from './StatsOverview';
import DeviceList from './DeviceList';
import ApiKeyManager from './ApiKeyManager';
import UsageTrend from './UsageTrend';
import ModelBreakdown from './ModelBreakdown';
import LanguageSwitcher from '@/components/LanguageSwitcher';

interface User {
  id: number;
  username: string;
}

export type Interval = '1m' | '5m' | '15m' | '30m' | '1h' | '1d' | 'auto';

export default function DashboardClient({ user }: { user: User }) {
  const router = useRouter();
  const t = useTranslations();
  const locale = useLocale();
  const [stats, setStats] = useState<any>(null);
  const [range, setRange] = useState('1d');
  const [interval, setInterval] = useState<Interval>('auto');
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/usage/stats?range=${range}&interval=${interval}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [range, interval]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{t('common.appName')}</h1>
                <p className="text-xs sm:text-sm text-gray-500 truncate">{t('common.appDescription')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              <span className="text-xs sm:text-sm text-gray-600 hidden md:inline">
                {t('common.welcome')}, <span className="font-medium">{user.username}</span>
              </span>
              <LanguageSwitcher currentLocale={locale} />
              <Button variant="outline" size="sm" onClick={() => router.push('/settings')} className="flex-shrink-0">
                <Settings className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('common.settings')}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout} className="flex-shrink-0">
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('common.logout')}</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">
              <Database className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('dashboard.tabs.overview')}</span>
            </TabsTrigger>
            <TabsTrigger value="devices" className="text-xs sm:text-sm">
              <Cpu className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('dashboard.tabs.devices')}</span>
            </TabsTrigger>
            <TabsTrigger value="api-keys" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">{t('dashboard.tabs.apiKeys')}</span>
              <span className="sm:hidden">API</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant={range === '1d' ? 'default' : 'outline'}
                onClick={() => setRange('1d')}
                className="flex-shrink-0"
              >
                {t('dashboard.timeRange.1d')}
              </Button>
              <Button
                size="sm"
                variant={range === '7d' ? 'default' : 'outline'}
                onClick={() => setRange('7d')}
                className="flex-shrink-0"
              >
                {t('dashboard.timeRange.7d')}
              </Button>
              <Button
                size="sm"
                variant={range === '30d' ? 'default' : 'outline'}
                onClick={() => setRange('30d')}
                className="flex-shrink-0"
              >
                {t('dashboard.timeRange.30d')}
              </Button>
              <Button
                size="sm"
                variant={range === 'all' ? 'default' : 'outline'}
                onClick={() => setRange('all')}
                className="flex-shrink-0"
              >
                {t('dashboard.timeRange.all')}
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="text-gray-500">{t('common.loading')}</div>
              </div>
            ) : stats ? (
              <>
                <StatsOverview stats={stats.totalStats} />
                <UsageTrend
                  trendData={stats.trendData}
                  interval={interval}
                  effectiveInterval={stats.interval}
                  onIntervalChange={setInterval}
                />
                <ModelBreakdown modelStats={stats.modelStats || []} />
              </>
            ) : null}
          </TabsContent>

          <TabsContent value="devices">
            {stats && <DeviceList devices={stats.deviceStats} />}
          </TabsContent>

          <TabsContent value="api-keys">
            <ApiKeyManager />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
