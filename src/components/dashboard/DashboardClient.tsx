'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Activity, Database, Cpu, Settings } from 'lucide-react';
import StatsOverview from './StatsOverview';
import DeviceList from './DeviceList';
import ApiKeyManager from './ApiKeyManager';
import UsageTrend from './UsageTrend';
import LanguageSwitcher from '@/components/LanguageSwitcher';

interface User {
  id: number;
  username: string;
}

export default function DashboardClient({ user }: { user: User }) {
  const router = useRouter();
  const t = useTranslations();
  const [stats, setStats] = useState<any>(null);
  const [range, setRange] = useState('7d');
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/usage/stats?range=${range}`);
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
  }, [range]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{t('common.appName')}</h1>
                <p className="text-sm text-gray-500">{t('common.appDescription')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">
                {t('common.welcome')}, <span className="font-medium">{user.username}</span>
              </span>
              <LanguageSwitcher />
              <Button variant="outline" size="sm" onClick={() => router.push('/settings')}>
                <Settings className="h-4 w-4 mr-2" />
                {t('common.settings')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                {t('common.logout')}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">
              <Database className="h-4 w-4 mr-2" />
              {t('dashboard.tabs.overview')}
            </TabsTrigger>
            <TabsTrigger value="devices">
              <Cpu className="h-4 w-4 mr-2" />
              {t('dashboard.tabs.devices')}
            </TabsTrigger>
            <TabsTrigger value="api-keys">
              {t('dashboard.tabs.apiKeys')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={range === '1d' ? 'default' : 'outline'}
                onClick={() => setRange('1d')}
              >
                {t('dashboard.timeRange.1d')}
              </Button>
              <Button
                size="sm"
                variant={range === '7d' ? 'default' : 'outline'}
                onClick={() => setRange('7d')}
              >
                {t('dashboard.timeRange.7d')}
              </Button>
              <Button
                size="sm"
                variant={range === '30d' ? 'default' : 'outline'}
                onClick={() => setRange('30d')}
              >
                {t('dashboard.timeRange.30d')}
              </Button>
              <Button
                size="sm"
                variant={range === 'all' ? 'default' : 'outline'}
                onClick={() => setRange('all')}
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
                <UsageTrend trendData={stats.trendData} />
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
