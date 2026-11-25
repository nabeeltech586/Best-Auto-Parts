'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function PwaRegistrar() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showAndroidInstall, setShowAndroidInstall] = useState(false);
  const [showIosPrompt, setShowIosPrompt] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker in browser
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker registered with scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    }

    // 2. Check if already running in standalone mode (installed PWA)
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsStandalone(Boolean(isStandaloneMode));
      return isStandaloneMode;
    };

    if (checkStandalone()) {
      return; // Already installed, do not show install banners
    }

    // Check if dismissed in this session
    const isDismissed = sessionStorage.getItem('bap_pwa_prompt_dismissed');
    if (isDismissed) {
      return;
    }

    // 3. Android / Chrome beforeinstallprompt handler
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowAndroidInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // 4. iOS Safari Detection
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent);
    const isSafari = userAgent.includes('safari') && !userAgent.includes('crios') && !userAgent.includes('fxios');

    if (isIos && isSafari && !checkStandalone()) {
      // Delay slightly for smooth page load
      const timer = setTimeout(() => {
        setShowIosPrompt(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setShowAndroidInstall(false);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.warn('[PWA] Install prompt error:', err);
    }
  };

  const handleDismiss = () => {
    setShowAndroidInstall(false);
    setShowIosPrompt(false);
    sessionStorage.setItem('bap_pwa_prompt_dismissed', 'true');
  };

  // If running as standalone app, render nothing
  if (isStandalone) {
    return null;
  }

  // 1. Android / Chrome Floating Install Banner
  if (showAndroidInstall) {
    return (
      <aside
        aria-label="App installation banner"
        className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto bg-[#0B1120]/95 backdrop-blur-md border border-amber-500/40 rounded-2xl p-4 shadow-2xl shadow-black/80 flex items-center justify-between gap-3 text-white transition-all animate-in fade-in slide-in-from-bottom-5"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-slate-900 border border-amber-500/30 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
            <Image
              src="/icons/icon-192x192.png"
              alt="Best Auto Parts App"
              width={40}
              height={40}
              className="rounded-lg"
            />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-sm text-slate-100 truncate">Best Auto Parts CRM</h2>
            <p className="text-xs text-amber-400/90 font-medium truncate">
              Install App for instant offline WhatsApp & Inventory
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleInstallClick}
            type="button"
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs tracking-wide shadow-md active:scale-95 transition-all"
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            type="button"
            className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm transition-colors"
            aria-label="Dismiss banner"
          >
            ✕
          </button>
        </div>
      </aside>
    );
  }

  // 2. iOS Safari Add to Home Screen Tip
  if (showIosPrompt) {
    return (
      <aside
        aria-label="iOS installation instructions"
        className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto bg-[#0B1120]/95 backdrop-blur-md border border-amber-500/40 rounded-2xl p-4 shadow-2xl shadow-black/80 text-white transition-all animate-in fade-in slide-in-from-bottom-5"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-amber-500/30 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
              <Image
                src="/apple-touch-icon.png"
                alt="Best Auto Parts App"
                width={36}
                height={36}
                className="rounded-lg"
              />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-100">Best Auto Parts App</h2>
              <p className="text-xs text-amber-400 font-medium">Install on iPhone / iPad</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            type="button"
            className="w-7 h-7 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs transition-colors"
            aria-label="Dismiss iOS install tip"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
          Tap the Safari <span className="font-bold text-amber-400">Share button (⎋ / ⇪)</span> below, then scroll down and tap <span className="font-bold text-amber-400">Add to Home Screen ⊕</span> to install standalone.
        </p>
      </aside>
    );
  }

  return null;
}
