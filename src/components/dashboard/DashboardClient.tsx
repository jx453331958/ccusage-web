'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import dayjs from 'dayjs';
import { DatePicker, ConfigProvider } from 'antd';
import antdZhCN from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-cn';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LogOut, Activity, Settings, BarChart3, Cpu, Key, Monitor, ChevronDown, Loader2 } from 'lucide-react';
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

type RangeType = 'today' | 'custom';

const DATE_PRESETS = [
  { key: 'yesterday', fromDaysAgo: 1, toDaysAgo: 1 },
  { key: 'last3days', fromDaysAgo: 2, toDaysAgo: 0 },
  { key: 'last7days', fromDaysAgo: 6, toDaysAgo: 0 },
  { key: 'last2weeks', fromDaysAgo: 13, toDaysAgo: 0 },
  { key: 'lastMonth', fromDaysAgo: 29, toDaysAgo: 0 },
  { key: 'last3months', fromDaysAgo: 89, toDaysAgo: 0 },
  { key: 'last6months', fromDaysAgo: 179, toDaysAgo: 0 },
  { key: 'lastYear', fromDaysAgo: 364, toDaysAgo: 0 },
];
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
  const [dataLoading, setDataLoading] = useState(false); // Loading state for data switching
  const [chartLoading, setChartLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false);
  const [tabDropdownOpen, setTabDropdownOpen] = useState(false);
  const deviceDropdownRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (deviceDropdownRef.current && !deviceDropdownRef.current.contains(event.target as Node)) {
        setDeviceDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Build URL for API call - always pass from/to timestamps to ensure correct timezone handling
  const buildStatsUrl = useCallback((intervalOverride?: Interval) => {
    const effectiveInterval = intervalOverride ?? interval;
    let url = `/api/usage/stats?interval=${effectiveInterval}`;

    const now = new Date();
    let from: number;
    let to: number = Math.floor(now.getTime() / 1000);

    if (rangeType === 'today') {
      // Today: from local midnight to now
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      from = Math.floor(today.getTime() / 1000);
    } else if (rangeType === 'custom' && customDateRange) {
      from = Math.floor(customDateRange.from.getTime() / 1000);
      // End of the selected day
      const endDate = new Date(customDateRange.to);
      endDate.setHours(23, 59, 59, 999);
      to = Math.floor(endDate.getTime() / 1000);
    } else {
      // Default to today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      from = Math.floor(today.getTime() / 1000);
    }

    url += `&from=${from}&to=${to}`;

    if (selectedDevice) {
      url += `&device=${encodeURIComponent(selectedDevice)}`;
    }

    return url;
  }, [rangeType, customDateRange, interval, selectedDevice]);

  // Full fetch - shows loading state, updates all data
  const fetchStats = useCallback(async () => {
    // Show full loading on initial load, dataLoading on subsequent loads
    if (isInitialLoad.current) {
      setLoading(true);
    } else {
      setDataLoading(true);
    }
    try {
      const res = await fetch(buildStatsUrl());
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
      setDataLoading(false);
      isInitialLoad.current = false;
    }
  }, [buildStatsUrl]);

  // Fetch only trend data when interval changes - no full page loading
  const fetchTrendData = useCallback(async (newInterval: Interval) => {
    setChartLoading(true);
    try {
      const res = await fetch(buildStatsUrl(newInterval));
      if (res.ok) {
        const data = await res.json();
        // Only update trend-related data, keep totalStats unchanged
        setStats((prev: any) => prev ? {
          ...prev,
          trendData: data.trendData,
          modelTrendData: data.modelTrendData,
          interval: data.interval,
        } : data);
      }
    } catch (error) {
      console.error('Error fetching trend data:', error);
    } finally {
      setChartLoading(false);
    }
  }, [buildStatsUrl]);

  // Initial load and when filter params change (except interval)
  useEffect(() => {
    fetchStats();
  }, [rangeType, customDateRange, selectedDevice]); // Note: interval not included

  // Handle interval change - only update chart, no full page reload
  const handleIntervalChange = useCallback((newInterval: Interval) => {
    setInterval(newInterval);
    fetchTrendData(newInterval);
  }, [fetchTrendData]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const rangePresets = useMemo(() =>
    DATE_PRESETS.map(preset => ({
      label: t(`dashboard.timeRange.presets.${preset.key}`),
      value: [
        dayjs().subtract(preset.fromDaysAgo, 'day').startOf('day'),
        dayjs().subtract(preset.toDaysAgo, 'day').startOf('day'),
      ] as [dayjs.Dayjs, dayjs.Dayjs],
    })),
  [t]);

  const tabs: { id: TabType; icon: React.ReactNode; label: string }[] = [
    { id: 'overview', icon: <BarChart3 className="h-4 w-4" />, label: t('dashboard.tabs.overview') },
    { id: 'devices', icon: <Cpu className="h-4 w-4" />, label: t('dashboard.tabs.devices') },
    { id: 'api-keys', icon: <Key className="h-4 w-4" />, label: t('dashboard.tabs.apiKeys') },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{t('common.appName')}</h1>
                <p className="text-xs sm:text-sm text-gray-500 truncate">{t('common.appDescription')}</p>
              </div>
              {/* Tab Navigation Dropdown */}
              <div className="h-6 w-px bg-gray-200 mx-2 hidden sm:block" />
              <Popover open={tabDropdownOpen} onOpenChange={setTabDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="min-w-[120px] justify-between">
                    <span className="flex items-center gap-2">
                      {tabs.find(tab => tab.id === activeTab)?.icon}
                      <span>{tabs.find(tab => tab.id === activeTab)?.label}</span>
                    </span>
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-1" align="start">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setTabDropdownOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-2 text-sm font-medium rounded-md transition-colors",
                        activeTab === tab.id
                          ? "bg-gray-100 text-gray-900"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      )}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
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
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Filters Row */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              {/* Device Selector */}
              <div className="relative" ref={deviceDropdownRef}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDeviceDropdownOpen(!deviceDropdownOpen)}
                  className="sm:min-w-[160px] justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    <span className="truncate max-w-[100px]">
                      {selectedDevice || t('dashboard.devices.allDevices')}
                    </span>
                  </span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", deviceDropdownOpen && "rotate-180")} />
                </Button>
                {deviceDropdownOpen && stats?.availableDevices && (
                  <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-white border rounded-md shadow-lg py-1">
                    <button
                      onClick={() => {
                        setSelectedDevice(null);
                        setDeviceDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2",
                        !selectedDevice && "bg-gray-50 font-medium"
                      )}
                    >
                      <Monitor className="h-4 w-4" />
                      {t('dashboard.devices.allDevices')}
                    </button>
                    {stats.availableDevices.map((device: string) => (
                      <button
                        key={device}
                        onClick={() => {
                          setSelectedDevice(device);
                          setDeviceDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm hover:bg-gray-100 truncate",
                          selectedDevice === device && "bg-gray-50 font-medium"
                        )}
                      >
                        {device}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Divider - desktop only */}
              <div className="h-6 w-px bg-gray-200 hidden sm:block" />

              {/* Time Range Selector - flattened, no wrapper */}
              <Button
                size="sm"
                variant={rangeType === 'today' ? 'default' : 'outline'}
                onClick={() => setRangeType('today')}
              >
                {t('dashboard.timeRange.today')}
              </Button>

              <ConfigProvider locale={locale === 'zh' ? antdZhCN : undefined}>
                <DatePicker.RangePicker
                  presets={rangePresets}
                  value={rangeType === 'custom' && customDateRange
                    ? [dayjs(customDateRange.from), dayjs(customDateRange.to)]
                    : null}
                  onChange={(dates) => {
                    if (dates && dates[0] && dates[1]) {
                      setCustomDateRange({ from: dates[0].toDate(), to: dates[1].toDate() });
                      setRangeType('custom');
                    }
                  }}
                  disabledDate={(current) => current.isAfter(dayjs(), 'day')}
                  size="small"
                  allowClear={false}
                />
              </ConfigProvider>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="flex items-center justify-center gap-2 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>{t('common.loading')}</span>
                </div>
              </div>
            ) : stats ? (
              <div className="relative">
                {/* Data loading overlay */}
                {dataLoading && (
                  <div className="absolute inset-0 bg-white/70 z-20 flex items-center justify-center rounded-lg backdrop-blur-[1px] transition-opacity duration-200">
                    <div className="flex items-center gap-2 text-gray-600 bg-white/90 px-4 py-2 rounded-full shadow-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm font-medium">{t('common.loading')}</span>
                    </div>
                  </div>
                )}
                <div className="space-y-6">
                  <StatsOverview stats={stats.totalStats} />
                  <UsageTrend
                    trendData={stats.trendData}
                    modelTrendData={stats.modelTrendData || []}
                    interval={interval}
                    effectiveInterval={stats.interval}
                    onIntervalChange={handleIntervalChange}
                    loading={chartLoading}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Devices Tab */}
        {activeTab === 'devices' && (
          <div>
            {loading ? (
              <div className="text-center py-12">
                <div className="flex items-center justify-center gap-2 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>{t('common.loading')}</span>
                </div>
              </div>
            ) : stats ? (
              <div className="relative">
                {dataLoading && (
                  <div className="absolute inset-0 bg-white/70 z-20 flex items-center justify-center rounded-lg backdrop-blur-[1px] transition-opacity duration-200">
                    <div className="flex items-center gap-2 text-gray-600 bg-white/90 px-4 py-2 rounded-full shadow-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm font-medium">{t('common.loading')}</span>
                    </div>
                  </div>
                )}
                <DeviceList devices={stats.deviceStats} />
              </div>
            ) : null}
          </div>
        )}

        {/* API Keys Tab */}
        {activeTab === 'api-keys' && <ApiKeyManager />}
      </main>
    </div>
  );
}
