'use client';

import { useMemo } from 'react';
import {
  Phone,
  Video,
  MoreVertical,
  ArrowLeft,
  CheckCheck,
  CheckCircle2,
  MessageCircle,
  ExternalLink,
  Wrench,
  Smartphone,
  Sparkles,
} from 'lucide-react';

interface WhatsAppButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
}

interface WhatsAppPhonePreviewProps {
  businessName?: string;
  bodyText: string;
  headerType?: string | null;
  headerMediaUrl?: string | null;
  footerText?: string | null;
  buttons?: WhatsAppButton[] | null;
  recipientName?: string;
  className?: string;
}

/**
 * Formats WhatsApp text markup:
 * *bold* -> <strong>
 * _italic_ -> <em>
 * ~strike~ -> <del>
 * `code` -> <code>
 */
function renderWhatsAppFormatted(text: string) {
  if (!text) return null;

  // Split into paragraphs / lines
  const lines = text.split('\n');

  return lines.map((line, lineIdx) => {
    // Process formatting tokens
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let keyIdx = 0;

    // Regex for *bold*, _italic_, ~strike~, `code`
    const regex = /(\*([^*]+)\*|_([^_]+)_|~([^~]+)~|`([^`]+)`)/;

    while (remaining.length > 0) {
      const match = remaining.match(regex);
      if (!match || match.index === undefined) {
        parts.push(remaining);
        break;
      }

      if (match.index > 0) {
        parts.push(remaining.substring(0, match.index));
      }

      const fullMatch = match[0];
      if (fullMatch.startsWith('*') && fullMatch.endsWith('*')) {
        parts.push(
          <strong key={`${lineIdx}-${keyIdx++}`} className="font-semibold text-foreground">
            {match[2]}
          </strong>
        );
      } else if (fullMatch.startsWith('_') && fullMatch.endsWith('_')) {
        parts.push(
          <em key={`${lineIdx}-${keyIdx++}`} className="italic">
            {match[3]}
          </em>
        );
      } else if (fullMatch.startsWith('~') && fullMatch.endsWith('~')) {
        parts.push(
          <del key={`${lineIdx}-${keyIdx++}`} className="line-through opacity-75">
            {match[4]}
          </del>
        );
      } else if (fullMatch.startsWith('`') && fullMatch.endsWith('`')) {
        parts.push(
          <code
            key={`${lineIdx}-${keyIdx++}`}
            className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 font-mono text-[11px]"
          >
            {match[5]}
          </code>
        );
      }

      remaining = remaining.substring(match.index + fullMatch.length);
    }

    return (
      <span key={lineIdx} className="block min-h-[1.2em]">
        {parts.length > 0 ? parts : ' '}
      </span>
    );
  });
}

export function WhatsAppPhonePreview({
  businessName = 'Best Auto Parts',
  bodyText,
  headerType,
  headerMediaUrl,
  footerText = 'Best Auto Parts (Saharanpur) | +91 96347 22174',
  buttons,
  recipientName = 'Customer',
  className = '',
}: WhatsAppPhonePreviewProps) {
  // Normalize default action buttons if none provided
  const activeButtons: WhatsAppButton[] = useMemo(() => {
    if (buttons && buttons.length > 0) return buttons;
    return [
      { type: 'QUICK_REPLY', text: 'Check Part Rate' },
      { type: 'QUICK_REPLY', text: 'Order Parts on WhatsApp' },
      { type: 'PHONE_NUMBER', text: 'Call Saud Bhai', phone_number: '+919634722174' },
    ];
  }, [buttons]);

  return (
    <div className={`relative mx-auto w-full max-w-[340px] select-none ${className}`}>
      {/* Device Frame */}
      <div className="relative rounded-[40px] border-[8px] border-zinc-800 dark:border-zinc-700 bg-zinc-950 p-2 shadow-2xl ring-1 ring-zinc-700/50">
        {/* Notch / Speaker Ear */}
        <div className="absolute left-1/2 top-3 h-4 w-28 -translate-x-1/2 rounded-full bg-zinc-800 dark:bg-zinc-900 flex items-center justify-center gap-2 z-30">
          <div className="h-1.5 w-10 rounded-full bg-zinc-700 dark:bg-zinc-800" />
          <div className="h-2 w-2 rounded-full bg-zinc-900 dark:bg-zinc-950" />
        </div>

        {/* Inner Screen */}
        <div className="relative flex flex-col h-[560px] overflow-hidden rounded-[30px] bg-[#efeae2] dark:bg-[#0b141a] text-zinc-900 dark:text-zinc-100">
          {/* Status Bar */}
          <div className="flex items-center justify-between px-6 pt-2 pb-1 text-[11px] font-medium text-white bg-[#008069] dark:bg-[#1f2c34] z-20">
            <span>9:41</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px]">5G</span>
              <div className="h-2 w-3 border border-white/80 rounded-[2px] p-[1px]">
                <div className="h-full w-2 bg-white rounded-[1px]" />
              </div>
            </div>
          </div>

          {/* WhatsApp Chat App Header */}
          <div className="flex items-center justify-between gap-1.5 px-3 py-2 bg-[#008069] dark:bg-[#1f2c34] text-white shadow-md z-20">
            <div className="flex items-center gap-1.5 min-w-0">
              <ArrowLeft className="h-4 w-4 shrink-0 opacity-90 cursor-pointer" />
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 dark:bg-emerald-800 border border-emerald-400/30 text-white font-bold text-xs">
                <Wrench className="h-4 w-4" />
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-[#008069] dark:border-[#1f2c34]" />
              </div>
              <div className="min-w-0 leading-tight">
                <div className="flex items-center gap-1">
                  <span className="truncate text-xs font-semibold text-white">
                    {businessName}
                  </span>
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-300 fill-emerald-300/30" />
                </div>
                <p className="truncate text-[10px] text-emerald-100/80">
                  Official Business Account • Online
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-white/90">
              <Video className="h-3.5 w-3.5 opacity-80" />
              <Phone className="h-3.5 w-3.5 opacity-80" />
              <MoreVertical className="h-3.5 w-3.5 opacity-80" />
            </div>
          </div>

          {/* WhatsApp Wallpaper & Chat Bubble Area */}
          <div className="relative flex-1 overflow-y-auto p-3 space-y-2 bg-[radial-gradient(#008069_1px,transparent_1px)] dark:bg-[radial-gradient(#1f2c34_1px,transparent_1px)] [background-size:16px_16px]">
            {/* Timestamp Pill */}
            <div className="flex justify-center my-1">
              <span className="rounded-md bg-white/70 dark:bg-[#182229]/80 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-400 shadow-xs backdrop-blur-xs">
                TODAY
              </span>
            </div>

            {/* Verified Business Banner Info */}
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 p-2 text-center text-[10px] text-emerald-800 dark:text-emerald-300">
              <span className="font-semibold">Messages are end-to-end encrypted.</span> No one outside of this chat, not even WhatsApp, can read or listen to them.
            </div>

            {/* Outgoing Message Bubble (Official WhatsApp Business Format) */}
            <div className="ml-auto max-w-[92%] relative">
              <div className="overflow-hidden rounded-xl bg-white dark:bg-[#202c33] text-zinc-900 dark:text-zinc-100 shadow-sm border border-black/5 dark:border-white/5">
                {/* Media Header (if any) */}
                {headerMediaUrl && (
                  <div className="relative w-full aspect-video bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={headerMediaUrl}
                      alt="Broadcast Header"
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] text-white flex items-center gap-1 backdrop-blur-xs">
                      <Sparkles className="h-2.5 w-2.5 text-amber-300" />
                      <span>Best Auto Parts</span>
                    </div>
                  </div>
                )}

                {/* Message Body Content */}
                <div className="p-2.5 space-y-1.5 text-xs leading-relaxed">
                  <div className="text-[12px] break-words">
                    {renderWhatsAppFormatted(bodyText || 'Welcome to Best Auto Parts! Reply with your bike model or part name to check live rates.')}
                  </div>

                  {/* Footer Text */}
                  {footerText && (
                    <div className="pt-1 text-[10px] text-zinc-500 dark:text-zinc-400 border-t border-black/5 dark:border-white/5">
                      {footerText}
                    </div>
                  )}

                  {/* Time & Read Receipts */}
                  <div className="flex items-center justify-end gap-1 pt-0.5 text-[9px] text-zinc-400 dark:text-zinc-500">
                    <span>10:42 AM</span>
                    <CheckCheck className="h-3 w-3 text-sky-500 dark:text-sky-400" />
                  </div>
                </div>

                {/* WhatsApp Interactive Quick-Reply Buttons */}
                {activeButtons.length > 0 && (
                  <div className="border-t border-zinc-200 dark:border-zinc-700/60 divide-y divide-zinc-200 dark:divide-zinc-700/60 bg-zinc-50/50 dark:bg-zinc-800/30">
                    {activeButtons.map((btn, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-center gap-1.5 py-2 px-3 text-center text-xs font-semibold text-[#00a884] dark:text-[#00a884] hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors"
                      >
                        {btn.type === 'URL' ? (
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        ) : btn.type === 'PHONE_NUMBER' ? (
                          <Phone className="h-3 w-3 shrink-0" />
                        ) : (
                          <MessageCircle className="h-3 w-3 shrink-0" />
                        )}
                        <span className="truncate">{btn.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Fake Bottom Message Bar */}
          <div className="flex items-center gap-2 p-2 bg-[#f0f2f5] dark:bg-[#202c33] border-t border-zinc-200 dark:border-zinc-700 text-zinc-400 text-xs">
            <div className="flex-1 rounded-full bg-white dark:bg-[#2a3942] px-3 py-1.5 text-zinc-400 text-[11px]">
              Reply directly on WhatsApp...
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00a884] text-white shadow-xs">
              <MessageCircle className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* WhatsApp-First Badge */}
      <div className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <Smartphone className="h-3.5 w-3.5" />
        <span>100% WhatsApp-First (No external website required)</span>
      </div>
    </div>
  );
}
