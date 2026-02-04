'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LogOut, Activity, Settings, CalendarIcon, BarChart3, Cpu, Key } from 'lucide-react';
import StatsOverview from './StatsOverview';
import DeviceList from './DeviceList';
import ApiKeyManager from './ApiKeyManager';
import UsageTrend from './UsageTrend';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { cn } from '@/lib/utils';

interface User {
  id: number;
  username: string;
}

export type Interval = '1m' | '5m' | '15m' | '30m' | '1h' | '1d' | 'auto';

type RangeType = 'today' | '7d' | '30d' | 'custom';
type TabType = 'overview' | 'devices' | 'api-keys';

export default function DashboardClient({ user }: { user: User }) {
  const router = useRouter();
  const t = useTranslations();
  const locale = useLocale();
  const [stats, setStats] = useState<any>(null);
  const [rangeType, setRangeType] = useState<RangeType>('today');
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date } | null>(null);
  const [interval, setInterval] = useState<Interval>('auto');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const fetchStats = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      let url = `/api/usage/stats?interval=${interval}`;

      if (rangeType === 'today') {
        url += '&range=today';
      } else if (rangeType === '7d') {
        url += '&range=7d';
      } else if (rangeType === '30d') {
        url += '&range=30d';
      } else if (rangeType === 'custom' && customDateRange) {
        const from = Math.floor(customDateRange.from.getTime() / 1000);
        const to = Math.floor(customDateRange.to.getTime() / 1000) + 86400 - 1; // End of day
        url += `&from=${from}&to=${to}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }, [rangeType, customDateRange, interval]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Handle interval change without showing loading
  const handleIntervalChange = useCallback((newInterval: Interval) => {
    setInterval(newInterval);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const handleDateRangeSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from && range?.to) {
      setCustomDateRange({ from: range.from, to: range.to });
      setRangeType('custom');
    }
  };

  const tabs: { id: TabType; icon: React.ReactNode; label: string }[] = [
    { id: 'overview', icon: <BarChart3 className="h-4 w-4" />, label: t('dashboard.tabs.overview') },
    { id: 'devices', icon: <Cpu className="h-4 w-4" />, label: t('dashboard.tabs.devices') },
    { id: 'api-keys', icon: <Key className="h-4 w-4" />, label: t('dashboard.tabs.apiKeys') },
  ];

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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Navigation Tabs */}
        <div className="mb-6">
          <nav className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
                  activeTab === tab.id
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Time Range Selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant={rangeType === 'today' ? 'default' : 'outline'}
                onClick={() => setRangeType('today')}
              >
                {t('dashboard.timeRange.today')}
              </Button>
              <Button
                size="sm"
                variant={rangeType === '7d' ? 'default' : 'outline'}
                onClick={() => setRangeType('7d')}
              >
                {t('dashboard.timeRange.7d')}
              </Button>
              <Button
                size="sm"
                variant={rangeType === '30d' ? 'default' : 'outline'}
                onClick={() => setRangeType('30d')}
              >
                {t('dashboard.timeRange.30d')}
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    variant={rangeType === 'custom' ? 'default' : 'outline'}
                    className="min-w-[140px]"
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {rangeType === 'custom' && customDateRange ? (
                      <span className="text-xs">
                        {format(customDateRange.from, 'MM/dd')} - {format(customDateRange.to, 'MM/dd')}
                      </span>
                    ) : (
                      t('dashboard.timeRange.custom')
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={customDateRange ? { from: customDateRange.from, to: customDateRange.to } : undefined}
                    onSelect={handleDateRangeSelect}
                    numberOfMonths={2}
                    disabled={{ after: new Date() }}
                  />
                </PopoverContent>
              </Popover>
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
                  modelTrendData={stats.modelTrendData || []}
                  interval={interval}
                  effectiveInterval={stats.interval}
                  onIntervalChange={handleIntervalChange}
                />
              </>
            ) : null}
          </div>
        )}

        {/* Devices Tab */}
        {activeTab === 'devices' && (
          <div>
            {loading ? (
              <div className="text-center py-12">
                <div className="text-gray-500">{t('common.loading')}</div>
              </div>
            ) : stats ? (
              <DeviceList devices={stats.deviceStats} />
            ) : null}
          </div>
        )}

        {/* API Keys Tab */}
        {activeTab === 'api-keys' && <ApiKeyManager />}
      </main>
    </div>
  );
}
