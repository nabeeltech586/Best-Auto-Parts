'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  initAutoplayUnlock,
  playWhatsAppNotificationSound,
} from '@/lib/notifications/sound';
import { toast } from 'sonner';
import type { Message } from '@/types';

export function WhatsAppSoundListener() {
  const router = useRouter();
  const seenMessagesRef = useRef<Map<string, number>>(new Map());
  const backgroundUnreadRef = useRef<number>(0);
  const originalTitleRef = useRef<string>('Best Auto Parts CRM');

  // 1. Initialize audio unlock and handle background unread title reset
  useEffect(() => {
    initAutoplayUnlock();

    if (typeof document !== 'undefined') {
      originalTitleRef.current = document.title || 'Best Auto Parts CRM';
    }

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        backgroundUnreadRef.current = 0;
        if (originalTitleRef.current) {
          document.title = originalTitleRef.current;
        }
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, []);

  // 2. Realtime listener for incoming WhatsApp customer messages
  useEffect(() => {
    const supabase = createClient();
    let isCancelled = false;

    const handleInboundMessage = async (msg: Message) => {
      // Step A: Immediately play WhatsApp notification chime
      playWhatsAppNotificationSound();

      // Step B: Resolve Sender Name and preview text
      let senderName = 'Valued Customer';
      try {
        const { data } = await supabase
          .from('conversations')
          .select('contact:contacts(name, phone, wa_username)')
          .eq('id', msg.conversation_id)
          .maybeSingle();

        if (!isCancelled && data) {
          const contact = (data as unknown as {
            contact?: { name?: string | null; phone?: string | null; wa_username?: string | null } | null;
          })?.contact;
          if (contact) {
            senderName = contact.name || contact.wa_username || contact.phone || 'Customer';
          }
        }
      } catch {
        // fallback
      }

      const previewText =
        msg.content_text?.trim() ||
        (msg.content_type === 'image'
          ? '📷 Photo'
          : msg.content_type === 'audio'
          ? '🎤 Voice Note'
          : msg.content_type === 'document'
          ? '📄 Document'
          : 'New incoming WhatsApp message');

      // Step C: If tab is in background, update unread count in document title
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        backgroundUnreadRef.current += 1;
        document.title = `(${backgroundUnreadRef.current}) ${originalTitleRef.current || 'Best Auto Parts CRM'}`;
      }

      // Step D: Show in-app sleek toast banner at top-right with quick Reply button
      toast.custom(
        (t) => (
          <div className="flex items-center justify-between gap-3 p-3.5 bg-card text-card-foreground border border-emerald-500/40 rounded-xl shadow-2xl w-full max-w-sm ring-1 ring-emerald-500/20 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-9 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0 border border-emerald-500/30">
                💬
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground truncate flex items-center gap-1.5">
                  <span>{senderName}</span>
                  <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20">
                    WhatsApp
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground truncate">{previewText}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                toast.dismiss(t);
                router.push(`/inbox?c=${msg.conversation_id}`);
              }}
              className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg transition shrink-0 cursor-pointer shadow-sm"
            >
              Reply
            </button>
          </div>
        ),
        {
          duration: 6500,
          position: 'top-right',
        }
      );

      // Step E: Trigger Native Browser / PWA Notification if permission is granted
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          const notification = new Notification(senderName, {
            body: previewText,
            icon: '/icons/icon-192x192.png',
            tag: msg.conversation_id,
          });

          notification.onclick = () => {
            window.focus();
            router.push(`/inbox?c=${msg.conversation_id}`);
            notification.close();
          };
        } catch (notifErr) {
          console.warn('[Notification] Failed to show browser notification:', notifErr);
        }
      }
    };

    const channel = supabase
      .channel('global-whatsapp-sound-listener')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as Message & { direction?: string };
          if (!msg || !msg.id) return;

          // Only trigger for incoming customer messages (ignore outbound agent/bot sends)
          if (msg.sender_type !== 'customer') {
            return;
          }

          // Dedupe by message ID within a 30s sliding window
          const now = Date.now();
          for (const [id, time] of seenMessagesRef.current) {
            if (now - time > 30000) seenMessagesRef.current.delete(id);
          }
          if (seenMessagesRef.current.has(msg.id)) return;
          seenMessagesRef.current.set(msg.id, now);

          void handleInboundMessage(msg);
        }
      )
      .subscribe();

    return () => {
      isCancelled = true;
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
