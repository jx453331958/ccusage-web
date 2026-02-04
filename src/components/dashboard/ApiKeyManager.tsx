'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Key, Trash2, Copy, Check } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface ApiKey {
  id: number;
  key: string;
  device_name: string;
  created_at: number;
  last_used_at: number | null;
}

export default function ApiKeyManager() {
  const t = useTranslations('dashboard.apiKeys');
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [deviceName, setDeviceName] = useState('');
  const [newKey, setNewKey] = useState<ApiKey | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchApiKeys = async () => {
    const res = await fetch('/api/api-keys');
    if (res.ok) {
      const data = await res.json();
      setApiKeys(data.apiKeys);
    }
  };

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const handleCreateKey = async () => {
    if (!deviceName.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_name: deviceName }),
      });

      if (res.ok) {
        const data = await res.json();
        setNewKey(data.apiKey);
        setApiKeys([data.apiKey, ...apiKeys]);
        setDeviceName('');
      }
    } catch (error) {
      console.error('Error creating API key:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKey = async (id: number) => {
    if (!confirm(t('deleteConfirm'))) return;

    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setApiKeys(apiKeys.filter((k) => k.id !== id));
      }
    } catch (error) {
      console.error('Error deleting API key:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <Key className="h-4 w-4 mr-2" />
                {t('createNew')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('createTitle')}</DialogTitle>
                <DialogDescription>
                  {t('createDescription')}
                </DialogDescription>
              </DialogHeader>
              {newKey ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-medium text-green-900 mb-2">
                      {t('successTitle')}
                    </p>
                    <p className="text-xs text-green-700 mb-3">
                      {t('successDescription')}
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-white border rounded text-xs break-all">
                        {newKey.key}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(newKey.key)}
                      >
                        {copiedKey === newKey.key ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      setNewKey(null);
                      setDialogOpen(false);
                    }}
                  >
                    {t('done')}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="device-name">{t('deviceName')}</Label>
                      <Input
                        id="device-name"
                        placeholder={t('deviceNamePlaceholder')}
                        value={deviceName}
                        onChange={(e) => setDeviceName(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={handleCreateKey}
                      disabled={loading || !deviceName.trim()}
                    >
                      {loading ? t('creating') : t('createKey')}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {apiKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('noKeys')}
            </div>
          ) : (
            apiKeys.map((apiKey) => (
              <div
                key={apiKey.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg hover:bg-gray-50 gap-3"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-2 bg-purple-100 rounded-lg flex-shrink-0">
                    <Key className="h-4 w-4 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{apiKey.device_name}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {apiKey.key.substring(0, 20)}...
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 break-words">
                      {t('created')}: {formatDate(apiKey.created_at)}
                      {apiKey.last_used_at && (
                        <span className="block sm:inline"> • {t('lastUsed')}: {formatDate(apiKey.last_used_at)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(apiKey.key)}
                  >
                    {copiedKey === apiKey.key ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteKey(apiKey.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
