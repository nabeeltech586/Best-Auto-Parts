/**
 * Zero-dependency Web Audio API dual-tone notification sound engine
 * for Best Auto Parts CRM.
 * Plays a crisp, pleasant WhatsApp-style double-chime.
 * Handles browser autoplay restrictions and user preference in localStorage.
 */

export const BAP_SOUND_STORAGE_KEY = 'bap_sound_enabled';
export const BAP_SOUND_CHANGE_EVENT = 'bap_sound_preference_change';

let sharedAudioCtx: AudioContext | null = null;
let autoplayUnlocked = false;

export function _resetAudioContextForTesting(): void {
  sharedAudioCtx = null;
  autoplayUnlocked = false;
}

/**
 * Returns or creates the shared AudioContext instance.
 */
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!sharedAudioCtx) {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtxClass) {
      sharedAudioCtx = new AudioCtxClass();
    }
  }

  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }

  return sharedAudioCtx;
}

/**
 * Unlocks browser audio autoplay on the user's first gesture anywhere in the app.
 */
export function initAutoplayUnlock(): void {
  if (typeof window === 'undefined' || autoplayUnlocked) return;

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx) {
      ctx.resume().then(() => {
        autoplayUnlocked = true;
      }).catch(() => {});
    }
    window.removeEventListener('click', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };

  window.addEventListener('click', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true, passive: true });
  window.addEventListener('touchstart', unlock, { once: true, passive: true });
}

/**
 * Reads user preference from localStorage. Defaults to true.
 */
export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return true;
  try {
    const stored = window.localStorage.getItem(BAP_SOUND_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

/**
 * Persists user preference and notifies listeners across tabs and components.
 */
export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage) {
      window.localStorage.setItem(BAP_SOUND_STORAGE_KEY, String(enabled));
    }
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent(BAP_SOUND_CHANGE_EVENT, { detail: { enabled } })
      );
    }
  } catch {
    // ignore
  }
}

/**
 * Toggles user preference between enabled and muted.
 */
export function toggleSoundEnabled(): boolean {
  const next = !isSoundEnabled();
  setSoundEnabled(next);
  return next;
}

/**
 * Subscribes to sound preference changes for React useSyncExternalStore.
 */
export function subscribeSoundPref(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === BAP_SOUND_STORAGE_KEY) onChange();
  };

  window.addEventListener(BAP_SOUND_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(BAP_SOUND_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Plays a signature WhatsApp-style ascending dual-tone chime using Web Audio API.
 * Pip 1: G#5 (~830.6Hz) for 70ms with gentle decay
 * Pip 2: E6 (~1318.5Hz) for 240ms with bell exponential decay
 */
export function playWhatsAppNotificationSound(force = false): void {
  if (!force && !isSoundEnabled()) return;
  if (typeof window === 'undefined') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Tone 1: Crisp high pip
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(830.61, now); // G#5
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.3, now + 0.008);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.075);

    // Tone 2: Harmonious bell chime
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.51, now + 0.08); // E6
    gain2.gain.setValueAtTime(0, now + 0.08);
    gain2.gain.linearRampToValueAtTime(0.35, now + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.36);
  } catch (err) {
    console.warn('[Sound] AudioContext chime error:', err);
  }
}
