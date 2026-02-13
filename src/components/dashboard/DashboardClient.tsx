'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useTranslations, useLocale } from 'next-intl';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { DatePicker, ConfigProvider, theme as antdTheme } from 'antd';
import antdZhCN from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-cn';

dayjs.extend(isoWeek);
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LogOut, Activity, Settings, BarChart3, Cpu, Key, Monitor, ChevronDown, Loader2 } from 'lucide-react';
import StatsOverview from './StatsOverview';
import DeviceList from './DeviceList';
import ApiKeyManager from './ApiKeyManager';
import UsageTrend from './UsageTrend';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { cn } from '@/lib/utils';

interface User {
  id: number;
  username: string;
}

export type Interval = '1m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '12h' | '1d' | 'auto';

function buildDatePresets() {
  const today = dayjs().startOf('day');
  return [
    { key: 'today', from: today, to: today },
    { key: 'yesterday', from: today.subtract(1, 'day'), to: today.subtract(1, 'day') },
    { key: 'dayBeforeYesterday', from: today.subtract(2, 'day'), to: today.subtract(2, 'day') },
    { key: 'last3days', from: today.subtract(2, 'day'), to: today },
    { key: 'last7days', from: today.subtract(6, 'day'), to: today },
    { key: 'thisWeek', from: today.startOf('isoWeek'), to: today },
    { key: 'lastWeek', from: today.subtract(1, 'week').startOf('isoWeek'), to: today.subtract(1, 'week').endOf('isoWeek').startOf('day') },
    { key: 'thisMonth', from: today.startOf('month'), to: today },
    { key: 'lastMonth', from: today.subtract(1, 'month').startOf('month'), to: today.subtract(1, 'month').endOf('month').startOf('day') },
  ];
}
type TabType = 'overview' | 'devices' | 'api-keys';

export default function DashboardClient({ user }: { user: User }) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const t = useTranslations();
  const locale = useLocale();
  const isDark = resolvedTheme === 'dark';
  const [stats, setStats] = useState<any>(null);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => [
    dayjs().startOf('day'),
    dayjs().startOf('day'),
  ]);
  const [interval, setInterval] = useState<Interval>('auto');
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false); // Loading state for data switching
  const [chartLoading, setChartLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false);
  const [tabDropdownOpen, setTabDropdownOpen] = useState(false);
  const [activePresetKey, setActivePresetKey] = useState<string | null>('today');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
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

  // Stable key for dateRange to use in useEffect deps
  const dateRangeKey = `${dateRange[0].valueOf()}-${dateRange[1].valueOf()}`;

  // Build URL for API call
  const buildStatsUrl = useCallback((intervalOverride?: Interval) => {
    const effectiveInterval = intervalOverride ?? interval;
    let url = `/api/usage/stats?interval=${effectiveInterval}`;

    const from = Math.floor(dateRange[0].startOf('day').valueOf() / 1000);
    // If end date is today, use current time; otherwise end of day
    const to = dateRange[1].isSame(dayjs(), 'day')
      ? Math.floor(Date.now() / 1000)
      : Math.floor(dateRange[1].endOf('day').valueOf() / 1000);

    url += `&from=${from}&to=${to}`;

    if (selectedDevice) {
      url += `&device=${encodeURIComponent(selectedDevice)}`;
    }

    return url;
  }, [dateRangeKey, interval, selectedDevice]);

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
  }, [dateRangeKey, selectedDevice]); // Note: interval not included

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

  const datePresets = useMemo(() => buildDatePresets(), []);

  const rangePresets = useMemo(() =>
    datePresets.map(preset => ({
      label: preset.key === 'today'
        ? t('dashboard.timeRange.today')
        : t(`dashboard.timeRange.presets.${preset.key}`),
      value: [preset.from, preset.to] as [dayjs.Dayjs, dayjs.Dayjs],
    })),
  [datePresets, t]);

  const findMatchingPresetKey = useCallback((from: dayjs.Dayjs, to: dayjs.Dayjs): string | null => {
    const presets = buildDatePresets();
    for (const preset of presets) {
      if (from.isSame(preset.from, 'day') && to.isSame(preset.to, 'day')) {
        return preset.key;
      }
    }
    return null;
  }, []);

  const tabs: { id: TabType; icon: React.ReactNode; label: string }[] = [
    { id: 'overview', icon: <BarChart3 className="h-4 w-4" />, label: t('dashboard.tabs.overview') },
    { id: 'devices', icon: <Cpu className="h-4 w-4" />, label: t('dashboard.tabs.devices') },
    { id: 'api-keys', icon: <Key className="h-4 w-4" />, label: t('dashboard.tabs.apiKeys') },
  ];

  return (
    <div className="min-h-screen bg-muted/50">
      <header className="bg-background border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">{t('common.appName')}</h1>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">{t('common.appDescription')}</p>
              </div>
              {/* Tab Navigation Dropdown */}
              <div className="h-6 w-px bg-border mx-2 hidden sm:block" />
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
                        const switchingToOverview = tab.id === 'overview' && activeTab !== 'overview';
                        setActiveTab(tab.id);
                        setTabDropdownOpen(false);
                        if (switchingToOverview) fetchStats();
                      }}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-2 text-sm font-medium rounded-md transition-colors",
                        activeTab === tab.id
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
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
              <span className="text-xs sm:text-sm text-muted-foreground hidden md:inline">
                {t('common.welcome')}, <span className="font-medium">{user.username}</span>
              </span>
              <ThemeSwitcher />
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 sm:flex-wrap">
              {/* Device Selector */}
              <div className="relative" ref={deviceDropdownRef}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDeviceDropdownOpen(!deviceDropdownOpen)}
                  className="w-full sm:w-auto sm:min-w-[160px] justify-between"
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
                  <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-background border rounded-md shadow-lg py-1">
                    <button
                      onClick={() => {
                        setSelectedDevice(null);
                        setDeviceDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2",
                        !selectedDevice && "bg-accent/50 font-medium"
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
                          "w-full px-3 py-2 text-left text-sm hover:bg-accent truncate",
                          selectedDevice === device && "bg-accent/50 font-medium"
                        )}
                      >
                        {device}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Divider - desktop only */}
              <div className="h-6 w-px bg-border hidden sm:block" />

              {/* Date Range Picker - Desktop */}
              <div className="hidden sm:block sm:w-auto">
                <ConfigProvider locale={locale === 'zh' ? antdZhCN : undefined} theme={{ algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm }}>
                  <DatePicker.RangePicker
                    presets={rangePresets}
                    value={dateRange}
                    onChange={(dates) => {
                      if (dates && dates[0] && dates[1]) {
                        const from = dates[0].startOf('day');
                        const to = dates[1].startOf('day');
                        setDateRange([from, to]);
                        setActivePresetKey(findMatchingPresetKey(from, to));
                        setShowCustomPicker(false);
                      }
                    }}
                    disabledDate={(current) => current.isAfter(dayjs(), 'day')}
                    allowClear={false}
                    style={{ width: '100%' }}
                  />
                </ConfigProvider>
              </div>

              {/* Date Preset Chips - Mobile */}
              <div className="sm:hidden w-full space-y-2">
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4">
                  {datePresets.map((preset) => (
                    <Button
                      key={preset.key}
                      size="sm"
                      variant={activePresetKey === preset.key ? 'default' : 'outline'}
                      onClick={() => {
                        setDateRange([preset.from, preset.to]);
                        setActivePresetKey(preset.key);
                        setShowCustomPicker(false);
                      }}
                      className="shrink-0 h-7 px-2.5 text-xs"
                    >
                      {preset.key === 'today'
                        ? t('dashboard.timeRange.today')
                        : t(`dashboard.timeRange.presets.${preset.key}`)}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant={activePresetKey === null ? 'default' : 'outline'}
                    onClick={() => {
                      setActivePresetKey(null);
                      setShowCustomPicker(true);
                    }}
                    className="shrink-0 h-7 px-2.5 text-xs"
                  >
                    {t('dashboard.timeRange.custom')}
                  </Button>
                </div>
                {showCustomPicker && (
                  <ConfigProvider locale={locale === 'zh' ? antdZhCN : undefined} theme={{ algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm }}>
                    <DatePicker.RangePicker
                      value={dateRange}
                      onChange={(dates) => {
                        if (dates && dates[0] && dates[1]) {
                          const from = dates[0].startOf('day');
                          const to = dates[1].startOf('day');
                          setDateRange([from, to]);
                          const matched = findMatchingPresetKey(from, to);
                          if (matched) {
                            setActivePresetKey(matched);
                            setShowCustomPicker(false);
                          }
                        }
                      }}
                      disabledDate={(current) => current.isAfter(dayjs(), 'day')}
                      allowClear={false}
                      style={{ width: '100%' }}
                    />
                  </ConfigProvider>
                )}
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>{t('common.loading')}</span>
                </div>
              </div>
            ) : stats ? (
              <div className="relative">
                {/* Data loading overlay */}
                {dataLoading && (
                  <div className="absolute inset-0 bg-background/70 z-20 flex items-center justify-center rounded-lg backdrop-blur-[1px] transition-opacity duration-200">
                    <div className="flex items-center gap-2 text-muted-foreground bg-background/90 px-4 py-2 rounded-full shadow-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm font-medium">{t('common.loading')}</span>
                    </div>
                  </div>
                )}
                <div className="space-y-6">
                  <StatsOverview stats={stats.totalStats} modelStats={stats.modelStats} />
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
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>{t('common.loading')}</span>
                </div>
              </div>
            ) : stats ? (
              <div className="relative">
                {dataLoading && (
                  <div className="absolute inset-0 bg-background/70 z-20 flex items-center justify-center rounded-lg backdrop-blur-[1px] transition-opacity duration-200">
                    <div className="flex items-center gap-2 text-muted-foreground bg-background/90 px-4 py-2 rounded-full shadow-sm">
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
