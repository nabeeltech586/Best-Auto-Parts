'use client';

import React from 'react';
import Image from 'next/image';

export default function OfflinePage() {
  const handleRetry = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col items-center justify-center p-6 text-center select-none">
      {/* Brand Emblem */}
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-500/20 to-slate-900 border-2 border-amber-500/40 flex items-center justify-center shadow-2xl shadow-amber-500/10">
          <Image
            src="/icons/icon-192x192.png"
            alt="Best Auto Parts"
            width={72}
            height={72}
            className="rounded-2xl shadow-md"
            priority
          />
        </div>
        <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center text-xs font-bold text-slate-950 shadow">
          ⚡
        </div>
      </div>

      {/* Title & Badge */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold mb-3">
        <span>📶 No Internet Connection</span>
      </div>

      <h1 className="text-2xl font-black tracking-tight text-white mb-2">
        Best Auto Parts — Offline
      </h1>

      <p className="text-sm text-slate-400 max-w-sm mb-8 leading-relaxed">
        Your device seems to be disconnected from mobile data or Wi-Fi. Please check your network and reconnect to continue managing your WhatsApp chats, spare parts inventory, and Udhaar ledger.
      </p>

      {/* Action Buttons */}
      <div className="w-full max-w-xs flex flex-col gap-3">
        <button
          onClick={handleRetry}
          type="button"
          className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          <span>🔄</span>
          <span>Retry Connection</span>
        </button>

        <a
          href="tel:+919634722174"
          className="w-full py-3 px-6 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-300 font-medium text-xs tracking-wide transition-all flex items-center justify-center gap-2"
        >
          <span>📞</span>
          <span>Emergency Support: Saud Bhai (9634722174)</span>
        </a>
      </div>

      {/* Footer Info */}
      <div className="mt-12 text-xs text-slate-500">
        Best Auto Parts • Kailashpur, Saharanpur, UP 247001
      </div>
    </div>
  );
}
