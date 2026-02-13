'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import type { User } from '@/lib/db';

interface SettingsClientProps {
  user: User;
}

export default function SettingsClient({ user }: SettingsClientProps) {
  const router = useRouter();
  const t = useTranslations();
  const locale = useLocale();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [recordCount, setRecordCount] = useState<number | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: t('settings.password.passwordsNotMatch') });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: t('settings.password.passwordTooShort') });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: t('settings.password.passwordChanged') });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: data.error || t('settings.password.passwordChangeFailed') });
      }
    } catch (error) {
      setMessage({ type: 'error', text: t('settings.password.errorOccurred') });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenClearDialog = useCallback(async () => {
    setClearMessage(null);
    try {
      const res = await fetch('/api/usage/stats?range=all');
      if (res.ok) {
        const data = await res.json();
        setRecordCount(data.totalStats?.totalRecords ?? 0);
      } else {
        setRecordCount(0);
      }
    } catch {
      setRecordCount(0);
    }
    setClearDialogOpen(true);
  }, []);

  const handleClearUsageData = async () => {
    setIsClearing(true);
    setClearMessage(null);
    try {
      const res = await fetch('/api/usage/clear', { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setClearMessage({
          type: 'success',
          text: t('settings.dangerZone.clearSuccess', { count: data.deletedCount }),
        });
        setRecordCount(0);
      } else {
        setClearMessage({
          type: 'error',
          text: data.error || t('settings.dangerZone.clearFailed'),
        });
      }
    } catch {
      setClearMessage({ type: 'error', text: t('settings.dangerZone.clearFailed') });
    } finally {
      setIsClearing(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-muted/50">
      <header className="bg-background border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t('settings.title')}</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">{t('settings.description')}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <ThemeSwitcher />
              <LanguageSwitcher currentLocale={locale} />
              <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')} className="flex-shrink-0">
                {t('common.backToDashboard')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout} className="flex-shrink-0">
                {t('common.logout')}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.account.title')}</CardTitle>
              <CardDescription>{t('settings.account.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <Label className="text-sm text-muted-foreground">{t('settings.account.username')}</Label>
                  <p className="text-lg font-medium">{user.username}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">{t('settings.account.userId')}</Label>
                  <p className="text-lg font-medium">{user.id}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">{t('settings.account.accountCreated')}</Label>
                  <p className="text-lg font-medium">
                    {new Date(user.created_at * 1000).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.password.title')}</CardTitle>
              <CardDescription>{t('settings.password.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">{t('settings.password.currentPassword')}</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">{t('settings.password.newPassword')}</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    minLength={6}
                  />
                  <p className="text-sm text-muted-foreground">{t('settings.password.minChars')}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t('settings.password.confirmPassword')}</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    minLength={6}
                  />
                </div>

                {message && (
                  <div
                    className={`p-3 rounded-md ${
                      message.type === 'success'
                        ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                        : 'bg-red-500/10 text-red-500 border border-red-500/20'
                    }`}
                  >
                    {message.text}
                  </div>
                )}

                <Button type="submit" disabled={isLoading}>
                  {isLoading ? t('settings.password.changing') : t('settings.password.changePassword')}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-red-200 dark:border-red-900/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <CardTitle className="text-red-600 dark:text-red-400">{t('settings.dangerZone.title')}</CardTitle>
              </div>
              <CardDescription>{t('settings.dangerZone.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <p className="font-medium text-sm">{t('settings.dangerZone.clearUsageData')}</p>
                  <p className="text-xs text-muted-foreground">{t('settings.dangerZone.clearUsageDescription')}</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleOpenClearDialog}
                  className="flex-shrink-0"
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  {t('settings.dangerZone.clearUsageData')}
                </Button>
              </div>

              {clearMessage && (
                <div
                  className={`mt-4 p-3 rounded-md ${
                    clearMessage.type === 'success'
                      ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                      : 'bg-red-500/10 text-red-500 border border-red-500/20'
                  }`}
                >
                  {clearMessage.text}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
                {t('settings.dangerZone.clearConfirmTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('settings.dangerZone.clearConfirmDescription', { count: recordCount ?? 0 })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setClearDialogOpen(false)}
                disabled={isClearing}
              >
                {t('settings.dangerZone.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleClearUsageData}
                disabled={isClearing || recordCount === 0}
              >
                {isClearing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    {t('settings.dangerZone.clearing')}
                  </>
                ) : (
                  t('settings.dangerZone.confirmText')
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
