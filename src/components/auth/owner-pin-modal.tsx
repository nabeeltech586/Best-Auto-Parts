'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, ShieldCheck, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { verifyOwnerPin } from '@/lib/auth/owner-pin';
import { toast } from 'sonner';

interface OwnerPinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  actionLabel?: string;
  onSuccess: () => void;
}

export function OwnerPinModal({
  open,
  onOpenChange,
  title = 'Owner Security PIN Required',
  description = 'Please enter your 4-digit Owner PIN to proceed with this sensitive action.',
  actionLabel = 'Authorize Action',
  onSuccess,
}: OwnerPinModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [showPin, setShowPin] = useState(false);

  function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();

    if (!pin.trim()) {
      setError(true);
      toast.error('Please enter the 4-digit Owner PIN');
      return;
    }

    if (verifyOwnerPin(pin)) {
      setError(false);
      setPin('');
      onOpenChange(false);
      onSuccess();
    } else {
      setError(true);
      toast.error('Invalid Owner PIN');
    }
  }

  function handleClose(isOpen: boolean) {
    if (!isOpen) {
      setPin('');
      setError(false);
    }
    onOpenChange(isOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-popover border-border sm:max-w-sm text-popover-foreground">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Lock className="size-5" />
            </div>
            <DialogTitle className="text-base font-bold text-foreground">
              {title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="owner-pin-input" className="text-xs font-semibold text-muted-foreground">
                4-Digit Security PIN
              </Label>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                {showPin ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                <span>{showPin ? 'Hide' : 'Show'}</span>
              </button>
            </div>

            <div className="relative">
              <Input
                id="owner-pin-input"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoFocus
                placeholder="••••"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                  if (error) setError(false);
                }}
                className={`text-center font-mono text-lg tracking-widest h-11 bg-muted border ${
                  error
                    ? 'border-red-500 ring-1 ring-red-500 text-red-500'
                    : 'border-border text-foreground'
                }`}
              />
            </div>

            {error && (
              <div className="flex items-center gap-1 text-xs text-red-500 pt-0.5">
                <AlertCircle className="size-3 shrink-0" />
                <span>Incorrect PIN. Default is 7668.</span>
              </div>
            )}
          </div>

          <DialogFooter className="bg-popover border-border pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleClose(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
            >
              <ShieldCheck className="size-4 mr-1.5" />
              {actionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
