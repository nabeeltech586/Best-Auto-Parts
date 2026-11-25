'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { Volume2, VolumeX, Bell, BellRing, Play, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  isSoundEnabled,
  toggleSoundEnabled,
  subscribeSoundPref,
  playWhatsAppNotificationSound,
} from '@/lib/notifications/sound';
import {
  getNotificationPermission,
  writeBrowserNotifyPref,
} from '@/lib/notifications/browser-notify';
import { cn } from '@/lib/utils';

export function SoundAlertToggle({ className }: { className?: string }) {
  const enabled = useSyncExternalStore(subscribeSoundPref, isSoundEnabled, () => true);
  const [notificationStatus, setNotificationStatus] = useState<string>('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationStatus(Notification.permission);
    }
  }, []);

  const handleTestSound = () => {
    playWhatsAppNotificationSound(true);
    toast.success('🔔 WhatsApp test chime played!', {
      description: 'Saud Khan, your incoming message alert sound is working crisply.',
    });
  };

  const handleToggleSound = () => {
    const next = toggleSoundEnabled();
    if (next) {
      playWhatsAppNotificationSound(true);
      toast.success('🔊 WhatsApp sound alerts enabled!', {
        description: 'Test chime played. You will hear a double-bell on new customer messages.',
      });
      // Check notification permission if needed
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then((res) => {
          setNotificationStatus(res);
          if (res === 'granted') {
            writeBrowserNotifyPref(true);
            toast.success('🔔 Desktop & PWA notifications enabled!');
          }
        });
      }
    } else {
      toast.info('🔇 Sound alerts muted', {
        description: 'Incoming WhatsApp alerts will stay silent until unmuted.',
      });
    }
  };

  const handleRequestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Web notifications are not supported in this browser.');
      return;
    }

    try {
      const res = await Notification.requestPermission();
      setNotificationStatus(res);
      if (res === 'granted') {
        writeBrowserNotifyPref(true);
        toast.success('🔔 Desktop notifications allowed!', {
          description: 'You will receive pop-up banners on incoming WhatsApp chats.',
        });
      } else if (res === 'denied') {
        toast.error('Notifications blocked by browser settings.', {
          description: 'Please enable notifications from your browser site permissions.',
        });
      }
    } catch {
      // ignore
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors border outline-none cursor-pointer',
          enabled
            ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
            : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
          className
        )}
        title={enabled ? 'Sound Alert: On (Click for options)' : 'Sound Alert: Muted (Click for options)'}
        aria-label="WhatsApp Notification Sound Settings"
      >
        {enabled ? (
          <Volume2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        ) : (
          <VolumeX className="h-4 w-4 shrink-0" />
        )}
        <span className="hidden sm:inline font-medium text-[11px]">
          {enabled ? 'Sound On' : 'Muted'}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-56 bg-popover text-popover-foreground border-border shadow-xl p-1.5"
      >
        <DropdownMenuLabel className="px-2 py-1 text-xs font-bold text-foreground flex items-center justify-between">
          <span>WhatsApp Alerts</span>
          <span
            className={cn(
              'text-[9px] px-1.5 py-0.2 rounded font-mono',
              enabled
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                : 'bg-muted text-muted-foreground border border-border'
            )}
          >
            {enabled ? 'ACTIVE' : 'MUTED'}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border" />

        {/* 1. Test Sound Chime */}
        <DropdownMenuItem
          onClick={handleTestSound}
          className="text-xs cursor-pointer flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted"
        >
          <Play className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          <div className="flex-1">
            <p className="font-semibold text-foreground">Test Sound Chime</p>
            <p className="text-[10px] text-muted-foreground">Play double-bell alert</p>
          </div>
        </DropdownMenuItem>

        {/* 2. Toggle Sound On / Off */}
        <DropdownMenuItem
          onClick={handleToggleSound}
          className="text-xs cursor-pointer flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted"
        >
          {enabled ? (
            <VolumeX className="size-3.5 text-amber-600" />
          ) : (
            <Volume2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          )}
          <div className="flex-1">
            <p className="font-semibold text-foreground">
              {enabled ? 'Mute Sound Alert' : 'Turn Sound On'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {enabled ? 'Silence incoming chimes' : 'Enable audio double-chime'}
            </p>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border" />

        {/* 3. Browser / PWA Notification Permission */}
        <DropdownMenuItem
          onClick={handleRequestNotificationPermission}
          className="text-xs cursor-pointer flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted"
        >
          {notificationStatus === 'granted' ? (
            <Check className="size-3.5 text-emerald-600" />
          ) : (
            <BellRing className="size-3.5 text-blue-500" />
          )}
          <div className="flex-1">
            <p className="font-semibold text-foreground">
              {notificationStatus === 'granted'
                ? 'Desktop Alerts: Allowed'
                : 'Enable Desktop Pop-ups'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {notificationStatus === 'granted'
                ? 'PWA & browser pop-ups active'
                : 'Click to allow browser alerts'}
            </p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
