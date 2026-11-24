'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Lock, ShieldCheck, Check, KeyRound, RotateCcw } from 'lucide-react';
import { getOwnerPin, setOwnerPin, verifyOwnerPin, DEFAULT_OWNER_PIN } from '@/lib/auth/owner-pin';
import { toast } from 'sonner';

export function OwnerPinCard() {
  const [currentSavedPin, setCurrentSavedPin] = useState(DEFAULT_OWNER_PIN);
  const [currentInputPin, setCurrentInputPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setCurrentSavedPin(getOwnerPin());
  }, []);

  function handleSavePin(e: React.FormEvent) {
    e.preventDefault();

    if (!verifyOwnerPin(currentInputPin)) {
      toast.error('Current PIN is incorrect');
      return;
    }

    if (!/^\d{4}$/.test(newPin.trim())) {
      toast.error('New PIN must be exactly 4 digits (0-9)');
      return;
    }

    if (newPin.trim() !== confirmPin.trim()) {
      toast.error('New PIN and Confirm PIN do not match');
      return;
    }

    const success = setOwnerPin(newPin.trim());
    if (success) {
      setCurrentSavedPin(newPin.trim());
      setCurrentInputPin('');
      setNewPin('');
      setConfirmPin('');
      setIsEditing(false);
      toast.success('Owner Security PIN updated successfully!');
    } else {
      toast.error('Failed to update PIN');
    }
  }

  function handleResetDefault() {
    if (!verifyOwnerPin(currentInputPin)) {
      toast.error('Enter current PIN first to reset');
      return;
    }
    setOwnerPin(DEFAULT_OWNER_PIN);
    setCurrentSavedPin(DEFAULT_OWNER_PIN);
    setCurrentInputPin('');
    setNewPin('');
    setConfirmPin('');
    setIsEditing(false);
    toast.success('Owner PIN reset to default (7668)');
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-start justify-between pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Lock className="size-4 text-amber-500" />
              Owner Security PIN
            </CardTitle>
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px]">
              <ShieldCheck className="size-3 mr-1" />
              Active
            </Badge>
          </div>
          <CardDescription className="text-xs text-muted-foreground leading-relaxed">
            Protects sensitive CRM actions: changing customer/mechanic roles, modifying tags, and deleting contacts.
          </CardDescription>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsEditing(!isEditing)}
          className="h-8 text-xs font-medium border-border"
        >
          <KeyRound className="size-3.5 mr-1.5" />
          {isEditing ? 'Cancel' : 'Change PIN'}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Current Status:</span>
            <span className="font-semibold text-foreground">
              {currentSavedPin === DEFAULT_OWNER_PIN ? 'Default PIN (7668)' : 'Custom PIN Enabled (••••)'}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Default: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">7668</code>
          </span>
        </div>

        {isEditing && (
          <form onSubmit={handleSavePin} className="space-y-3 pt-2 border-t border-border/40">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="current-pin" className="text-xs font-medium text-muted-foreground">
                  Current PIN <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="current-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={currentInputPin}
                  onChange={(e) => setCurrentInputPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="h-9 font-mono text-center tracking-widest bg-muted border-border"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-pin" className="text-xs font-medium text-muted-foreground">
                  New 4-Digit PIN <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="new-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="h-9 font-mono text-center tracking-widest bg-muted border-border"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-pin" className="text-xs font-medium text-muted-foreground">
                  Confirm New PIN <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="confirm-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="h-9 font-mono text-center tracking-widest bg-muted border-border"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              {currentSavedPin !== DEFAULT_OWNER_PIN && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetDefault}
                  className="h-8 text-xs text-muted-foreground hover:text-foreground mr-auto"
                >
                  <RotateCcw className="size-3 mr-1" />
                  Reset to 7668
                </Button>
              )}

              <Button
                type="submit"
                size="sm"
                className="h-8 text-xs font-medium bg-primary text-primary-foreground"
              >
                <Check className="size-3.5 mr-1" />
                Update PIN
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
