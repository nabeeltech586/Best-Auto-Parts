'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import {
  isSoundEnabled,
  toggleSoundEnabled,
  subscribeSoundPref,
  playWhatsAppNotificationSound,
} from '@/lib/notifications/sound';
import { writeBrowserNotifyPref } from '@/lib/notifications/browser-notify';
import { cn } from '@/lib/utils';

export function SoundAlertToggle({ className }: { className?: string }) {
  const enabled = useSyncExternalStore(subscribeSoundPref, isSoundEnabled, () => true);
  const [, setNotificationStatus] = useState<string>('default');

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotificationStatus(Notification.permission);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleToggleSound = () => {
    try {
      const next = toggleSoundEnabled();

      if (next) {
        // 1. Play safe test chime on unmute
        try {
          playWhatsAppNotificationSound(true);
        } catch (soundErr) {
          console.warn('[SoundAlertToggle] Error playing test chime:', soundErr);
        }

        toast.success('🔊 WhatsApp sound alerts enabled!', {
          description: 'Test chime played. You will hear an alert on incoming customer messages.',
        });

        // 2. Safely request notification permission if supported and not yet decided
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          typeof Notification.requestPermission === 'function' &&
          Notification.permission === 'default'
        ) {
          try {
            const req = Notification.requestPermission();
            if (req && typeof (req as Promise<NotificationPermission>).then === 'function') {
              (req as Promise<NotificationPermission>)
                .then((res) => {
                  setNotificationStatus(res);
                  if (res === 'granted') {
                    try {
                      writeBrowserNotifyPref(true);
                      toast.success('🔔 Desktop & PWA notifications enabled!');
                    } catch {}
                  }
                })
                .catch(() => {});
            } else if (typeof req === 'string') {
              // Legacy synchronous / callback return
              setNotificationStatus(req);
              if (req === 'granted') {
                try {
                  writeBrowserNotifyPref(true);
                  toast.success('🔔 Desktop & PWA notifications enabled!');
                } catch {}
              }
            }
          } catch {
            // Ignore permission request errors in restricted environments
          }
        }
      } else {
        toast.info('🔇 Sound alerts muted', {
          description: 'Incoming WhatsApp alerts will stay silent until unmuted.',
        });
      }
    } catch (err) {
      console.warn('[SoundAlertToggle] Toggle error:', err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggleSound}
      className={cn(
        'flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors border outline-none cursor-pointer select-none',
        enabled
          ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95'
          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95',
        className
      )}
      title={
        enabled
          ? 'WhatsApp Sound: ON (Click to mute)'
          : 'WhatsApp Sound: MUTED (Click to enable)'
      }
      aria-label={
        enabled
          ? 'WhatsApp notification sound is enabled. Click to mute.'
          : 'WhatsApp notification sound is muted. Click to enable.'
      }
    >
      {enabled ? (
        <Volume2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
      ) : (
        <VolumeX className="h-4 w-4 shrink-0" />
      )}
      <span className="hidden sm:inline font-medium text-[11px]">
        {enabled ? 'Sound On' : 'Muted'}
      </span>
      <span
        className={cn(
          'size-1.5 rounded-full shrink-0',
          enabled ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40'
        )}
      />
    </button>
  );
}
