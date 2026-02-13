'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Key, Trash2, Copy, Check, Terminal, Download, RefreshCw, Activity, XCircle } from 'lucide-react';
import { formatDate } from '@/lib/utils';

function getServerUrl() {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

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
  const [installDialogKey, setInstallDialogKey] = useState<ApiKey | null>(null);

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

  const [copiedCommandId, setCopiedCommandId] = useState<string | null>(null);

  const copyCommand = (command: string, id: string) => {
    navigator.clipboard.writeText(command);
    setCopiedCommandId(id);
    setTimeout(() => setCopiedCommandId(null), 2000);
  };

  const SETUP_BASE_URL = 'https://raw.githubusercontent.com/jx453331958/ccusage-web/main/agent/setup.sh';

  const getSetupUrl = () => `${SETUP_BASE_URL}?t=${Date.now()}`;

  const getCommands = (apiKey: string) => {
    const serverUrl = getServerUrl();
    const url = getSetupUrl();
    return [
      {
        id: 'install',
        labelKey: 'cmdInstall' as const,
        descKey: 'cmdInstallDesc' as const,
        icon: Download,
        command: `curl -sL "${url}" | CCUSAGE_SERVER=${serverUrl} CCUSAGE_API_KEY=${apiKey} bash -s install`,
      },
      {
        id: 'update',
        labelKey: 'cmdUpdate' as const,
        descKey: 'cmdUpdateDesc' as const,
        icon: RefreshCw,
        command: `curl -sL "${url}" | bash -s update`,
      },
      {
        id: 'reset',
        labelKey: 'cmdReset' as const,
        descKey: 'cmdResetDesc' as const,
        icon: Activity,
        command: `curl -sL "${url}" | bash -s reset`,
      },
      {
        id: 'status',
        labelKey: 'cmdStatus' as const,
        descKey: 'cmdStatusDesc' as const,
        icon: Terminal,
        command: `curl -sL "${url}" | bash -s status`,
      },
      {
        id: 'uninstall',
        labelKey: 'cmdUninstall' as const,
        descKey: 'cmdUninstallDesc' as const,
        icon: XCircle,
        command: `curl -sL "${url}" | bash -s uninstall`,
      },
    ];
  };

  const getInstallCommand = (apiKey: string) => {
    const serverUrl = getServerUrl();
    const url = getSetupUrl();
    return `curl -sL "${url}" | CCUSAGE_SERVER=${serverUrl} CCUSAGE_API_KEY=${apiKey} bash -s install`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
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
                  <div className="p-4 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800/50 rounded-lg">
                    <p className="text-sm font-medium text-green-900 dark:text-green-100 mb-2">
                      {t('successTitle')}
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300 mb-3">
                      {t('successDescription')}
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-background border rounded text-xs break-all">
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
                  <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Terminal className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        {t('installTitle')}
                      </p>
                    </div>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                      {t('installDescription')}
                    </p>
                    <div className="relative">
                      <pre className="p-3 bg-gray-900 dark:bg-[#141926] text-gray-100 dark:text-gray-300 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all">
                        {getInstallCommand(newKey.key)}
                      </pre>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="absolute top-2 right-2"
                        onClick={() => copyCommand(getInstallCommand(newKey.key), 'new-install')}
                      >
                        {copiedCommandId === 'new-install' ? (
                          <>
                            <Check className="h-3 w-3 mr-1" />
                            {t('copied')}
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 mr-1" />
                            {t('copyCommand')}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      setNewKey(null);
                      setCopiedCommandId(null);
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
                className="p-4 border rounded-lg hover:bg-accent space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-purple-100 dark:bg-purple-950/50 rounded-lg flex-shrink-0">
                      <Key className="h-4 w-4 text-purple-600 dark:text-purple-400" />
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
                      onClick={() => setInstallDialogKey(apiKey)}
                      title={t('installTitle')}
                    >
                      <Terminal className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(apiKey.key)}
                      title={t('copyKey')}
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
                      title={t('delete')}
                    >
                      <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </Button>
                  </div>
                </div>
                {/* Inline quick-action buttons */}
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/50">
                  {getCommands(apiKey.key).map((cmd) => {
                    const Icon = cmd.icon;
                    const quickId = `quick-${apiKey.id}-${cmd.id}`;
                    const isQuickCopied = copiedCommandId === quickId;
                    return (
                      <button
                        key={cmd.id}
                        onClick={() => copyCommand(cmd.command, quickId)}
                        title={t(cmd.descKey)}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-all duration-200 ${
                          isQuickCopied
                            ? 'bg-green-100 dark:bg-green-950/50 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
                            : cmd.id === 'uninstall'
                              ? 'bg-background border-border/70 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-700'
                              : 'bg-background border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground hover:border-border'
                        }`}
                      >
                        {isQuickCopied ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Icon className="h-3 w-3" />
                        )}
                        <span>{isQuickCopied ? t('copied') : t(cmd.labelKey)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>

      {/* Quick Commands Dialog */}
      <Dialog open={!!installDialogKey} onOpenChange={(open) => { if (!open) { setInstallDialogKey(null); setCopiedCommandId(null); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              {t('installTitle')}
            </DialogTitle>
            <DialogDescription>
              {installDialogKey?.device_name} — {t('installDescription')}
            </DialogDescription>
          </DialogHeader>
          {installDialogKey && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {getCommands(installDialogKey.key).map((cmd) => {
                const Icon = cmd.icon;
                const isCopied = copiedCommandId === cmd.id;
                return (
                  <div key={cmd.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium">{t(cmd.labelKey)}</span>
                        <span className="text-xs text-muted-foreground hidden sm:inline">— {t(cmd.descKey)}</span>
                      </div>
                      <Button
                        size="sm"
                        variant={isCopied ? 'default' : 'outline'}
                        className="flex-shrink-0 h-7 px-2 text-xs"
                        onClick={() => copyCommand(cmd.command, cmd.id)}
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3 w-3 mr-1" />
                            {t('copied')}
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 mr-1" />
                            {t('copyCommand')}
                          </>
                        )}
                      </Button>
                    </div>
                    <pre className="p-2 bg-gray-900 dark:bg-[#141926] text-gray-100 dark:text-gray-300 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all">
                      {cmd.command}
                    </pre>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
