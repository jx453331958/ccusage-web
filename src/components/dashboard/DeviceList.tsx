'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Cpu } from 'lucide-react';
import { formatNumber, formatRelativeTime } from '@/lib/utils';

interface Device {
  device_name: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_create_tokens: number;
  cache_read_tokens: number;
  record_count: number;
  last_report: number;
  cost?: number;
}

function formatCost(cost: number): string {
  if (cost >= 1000) return `$${(cost / 1000).toFixed(1)}K`;
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(4)}`;
}

interface DeviceListProps {
  devices: Device[];
}

export default function DeviceList({ devices }: DeviceListProps) {
  const t = useTranslations('dashboard.devices');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {devices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('noDevices')}
            </div>
          ) : (
            devices.map((device) => (
              <div
                key={device.device_name}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg hover:bg-accent gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-blue-100 dark:bg-blue-950/50 rounded-lg flex-shrink-0">
                    <Cpu className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{device.device_name}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {t('lastReport')}: {formatRelativeTime(device.last_report)}
                    </div>
                  </div>
                </div>
                <div className="text-left sm:text-right flex-shrink-0">
                  <div className="font-semibold text-lg">
                    {formatNumber(device.total_tokens)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatNumber(device.input_tokens)} {t('in')} / {formatNumber(device.output_tokens)} {t('out')}
                  </div>
                  {(device.cache_create_tokens > 0 || device.cache_read_tokens > 0) && (
                    <div className="text-sm text-muted-foreground">
                      {formatNumber(device.cache_create_tokens)} {t('cacheWrite')} / {formatNumber(device.cache_read_tokens)} {t('cacheRead')}
                    </div>
                  )}
                  {device.cost != null && device.cost > 0 && (
                    <div className="text-sm font-medium text-amber-600 dark:text-amber-400">
                      {formatCost(device.cost)}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
