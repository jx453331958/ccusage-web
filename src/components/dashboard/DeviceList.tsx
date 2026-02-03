'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Cpu } from 'lucide-react';
import { formatNumber, formatRelativeTime } from '@/lib/utils';

interface Device {
  device_name: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  record_count: number;
  last_report: number;
}

interface DeviceListProps {
  devices: Device[];
}

export default function DeviceList({ devices }: DeviceListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Devices</CardTitle>
        <CardDescription>Token usage per device</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {devices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No devices have reported yet
            </div>
          ) : (
            devices.map((device) => (
              <div
                key={device.device_name}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Cpu className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="font-medium">{device.device_name}</div>
                    <div className="text-sm text-muted-foreground">
                      Last report: {formatRelativeTime(device.last_report)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-lg">
                    {formatNumber(device.total_tokens)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatNumber(device.input_tokens)} in / {formatNumber(device.output_tokens)} out
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
