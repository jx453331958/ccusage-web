'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Activity, Database, Cpu } from 'lucide-react';
import StatsOverview from './StatsOverview';
import DeviceList from './DeviceList';
import ApiKeyManager from './ApiKeyManager';
import UsageTrend from './UsageTrend';

interface User {
  id: number;
  username: string;
}

export default function DashboardClient({ user }: { user: User }) {
  const router = useRouter();
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
                <h1 className="text-2xl font-bold text-gray-900">CCUsage Web</h1>
                <p className="text-sm text-gray-500">Claude Code Usage Monitor</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                Welcome, <span className="font-medium">{user.username}</span>
              </span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
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
              Overview
            </TabsTrigger>
            <TabsTrigger value="devices">
              <Cpu className="h-4 w-4 mr-2" />
              Devices
            </TabsTrigger>
            <TabsTrigger value="api-keys">
              API Keys
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={range === '1d' ? 'default' : 'outline'}
                onClick={() => setRange('1d')}
              >
                1 Day
              </Button>
              <Button
                size="sm"
                variant={range === '7d' ? 'default' : 'outline'}
                onClick={() => setRange('7d')}
              >
                7 Days
              </Button>
              <Button
                size="sm"
                variant={range === '30d' ? 'default' : 'outline'}
                onClick={() => setRange('30d')}
              >
                30 Days
              </Button>
              <Button
                size="sm"
                variant={range === 'all' ? 'default' : 'outline'}
                onClick={() => setRange('all')}
              >
                All Time
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="text-gray-500">Loading...</div>
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
