'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Handshake,
  Send,
  Loader2,
  ExternalLink,
  MessageSquare,
  Sparkles,
  User,
  Building2,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';

export interface VipGreetingContact {
  id?: string;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  category?: 'Wholesaler' | 'Distributor' | 'Mechanic' | 'Customer' | string | null;
}

interface SendVipGreetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: VipGreetingContact | null;
  conversationId?: string | null;
  onSentSuccess?: () => void;
}

const SALUTATION_PRESETS = [
  { value: 'Assalamu Alaikum', label: 'Assalamu Alaikum' },
  { value: 'Aadab', label: 'Aadab' },
  { value: 'Sir Ji', label: 'Sir Ji' },
];

export function SendVipGreetingDialog({
  open,
  onOpenChange,
  contact,
  conversationId,
  onSentSuccess,
}: SendVipGreetingDialogProps) {
  const [salutation, setSalutation] = useState<string>('Assalamu Alaikum');
  const [recipientName, setRecipientName] = useState<string>('');
  const [recipientPhone, setRecipientPhone] = useState<string>('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (contact) {
      setRecipientName(contact.name || contact.company || '');
      setRecipientPhone(contact.phone || '');
    }
  }, [contact]);

  if (!contact && !recipientPhone) return null;

  const phone = contact?.phone || recipientPhone;
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const phone10 = cleanPhone.slice(-10);
  const targetCategory = contact?.category || 'Customer';

  const previewMessage =
    `🤝 *${salutation} ${recipientName.trim() || 'Valued Partner'}!* 🏍️\n\n` +
    `Warm greetings from *Best Auto Parts*, Saharanpur!\n` +
    `Thank you for your valued partnership and trust with us for genuine motorcycle spare parts.\n\n` +
    `📍 Best Auto Parts, Kailashpur, Saharanpur, UP 247001\n` +
    `⏰ Shop Timings: 09:00 AM – 09:00 PM (Daily)\n` +
    `📞 Saud Khan • +91 96347 22174`;

  const waWebLink = phone10
    ? `https://wa.me/91${phone10}?text=${encodeURIComponent(previewMessage)}`
    : null;

  const handleSendGreeting = async () => {
    if (!phone10 || phone10.length !== 10) {
      toast.error('Recipient phone must be a valid 10-digit mobile number');
      return;
    }

    const cleanName = recipientName.trim();
    if (!cleanName) {
      toast.error('Please enter the recipient name or title');
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/send-vip-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientPhone: phone,
          recipientName: cleanName,
          salutation,
          category: targetCategory,
          company: contact?.company || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch VIP greeting');
      }

      toast.success(
        `🤝 VIP Greeting sent to ${cleanName}! Outbound message logged in CRM Inbox.`,
        {
          description:
            data.method === 'template'
              ? 'Delivered via Meta approved template: vip_greeting_message'
              : 'Delivered via direct WhatsApp greeting text',
        }
      );

      onOpenChange(false);
      onSentSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error sending VIP greeting via WhatsApp');
    } finally {
      setSending(false);
    }
  };

  const getCategoryIcon = () => {
    switch (targetCategory) {
      case 'Distributor':
      case 'Wholesaler':
        return <Building2 className="size-3.5 text-blue-500" />;
      case 'Mechanic':
        return <Wrench className="size-3.5 text-amber-500" />;
      default:
        return <User className="size-3.5 text-emerald-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-card border-border">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-transparent p-5 border-b border-border/80">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <Handshake className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                Send VIP Greeting
                <Badge
                  variant="outline"
                  className="text-[10px] gap-1 py-0.5 border-border bg-background"
                >
                  {getCategoryIcon()}
                  <span>{targetCategory}</span>
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Dispatch personalized VIP welcome greeting via Meta WhatsApp Cloud API
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Salutation selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">
              Salutation Preset (Meta Template Parameter {'{{1}}'}):
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {SALUTATION_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setSalutation(preset.value)}
                  className={cn(
                    'py-2 px-2.5 rounded-lg border text-xs font-medium transition-colors text-center truncate',
                    salutation === preset.value
                      ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold'
                      : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recipient Name & Title */}
          <div className="space-y-1.5">
            <Label htmlFor="vip-recipient-name" className="text-xs font-medium text-foreground">
              Recipient Name & Title (Meta Template Parameter {'{{2}}'}):
            </Label>
            <Input
              id="vip-recipient-name"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="e.g. Nabeel Bhai, Pal Agency, Rajesh Ji, Saud Bhai"
              className="h-9 text-xs"
            />
            <div className="text-[10px] text-muted-foreground flex items-center justify-between">
              <span>Personalized name or firm title</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                {phone}
              </span>
            </div>
          </div>

          {/* Live Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-foreground">
                Message Preview:
              </span>
              <span className="text-[10px] text-muted-foreground">
                Template: vip_greeting_message
              </span>
            </div>
            <div className="p-3 rounded-lg bg-background border border-border/80 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {previewMessage}
            </div>
          </div>

          {/* CRM Thread Notice */}
          <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-start gap-2 text-blue-600 dark:text-blue-400 text-[11px]">
            <Sparkles className="size-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Instant CRM Sync:</span> This VIP Greeting will immediately appear inside the recipient&apos;s conversation thread in <span className="font-semibold">/inbox</span>.
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <DialogFooter className="p-4 bg-muted/20 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2">
          {waWebLink && (
            <a
              href={waWebLink}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'text-xs gap-1 border-border w-full sm:w-auto'
              )}
            >
              <ExternalLink className="size-3.5 text-muted-foreground" />
              <span>Open in WhatsApp Web</span>
            </a>
          )}

          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSendGreeting}
              disabled={sending || !recipientName.trim()}
              className="text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium"
            >
              {sending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              <span>Send VIP Greeting</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
