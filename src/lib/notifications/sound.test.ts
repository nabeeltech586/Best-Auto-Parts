import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  BAP_SOUND_STORAGE_KEY,
  BAP_SOUND_CHANGE_EVENT,
  isSoundEnabled,
  setSoundEnabled,
  toggleSoundEnabled,
  playWhatsAppNotificationSound,
  _resetAudioContextForTesting,
} from './sound';

describe('WhatsApp Notification Sound Engine', () => {
  let store: Map<string, string>;
  let dispatchedEvents: string[];

  beforeEach(() => {
    _resetAudioContextForTesting();
    store = new Map<string, string>();
    dispatchedEvents = [];

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      dispatchEvent: (e: { type: string }) => {
        dispatchedEvents.push(e.type);
        return true;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    vi.stubGlobal('CustomEvent', class {
      constructor(public type: string, public detail?: unknown) {}
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to sound enabled (true) when storage is empty', () => {
    expect(isSoundEnabled()).toBe(true);
  });

  it('persists enabled state correctly in localStorage and dispatches event', () => {
    setSoundEnabled(false);
    expect(store.get(BAP_SOUND_STORAGE_KEY)).toBe('false');
    expect(isSoundEnabled()).toBe(false);
    expect(dispatchedEvents).toContain(BAP_SOUND_CHANGE_EVENT);

    setSoundEnabled(true);
    expect(store.get(BAP_SOUND_STORAGE_KEY)).toBe('true');
    expect(isSoundEnabled()).toBe(true);
  });

  it('toggles sound preference state cleanly', () => {
    expect(isSoundEnabled()).toBe(true);
    const toggled1 = toggleSoundEnabled();
    expect(toggled1).toBe(false);
    expect(isSoundEnabled()).toBe(false);

    const toggled2 = toggleSoundEnabled();
    expect(toggled2).toBe(true);
    expect(isSoundEnabled()).toBe(true);
  });

  it('plays notification sound without throwing', () => {
    const mockOscillator = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    const mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };

    const mockAudioContext = {
      state: 'running',
      currentTime: 0,
      createOscillator: vi.fn().mockReturnValue(mockOscillator),
      createGain: vi.fn().mockReturnValue(mockGain),
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
    };

    // Attach AudioContext constructor to window mock
    const win = window as unknown as Record<string, unknown>;
    win.AudioContext = vi.fn(function (this: unknown) {
      return mockAudioContext;
    });

    expect(() => playWhatsAppNotificationSound(true)).not.toThrow();
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2);
    expect(mockAudioContext.createGain).toHaveBeenCalledTimes(2);
  });

  it('suppresses sound when disabled and force is false', () => {
    setSoundEnabled(false);
    const mockAudioContext = {
      createOscillator: vi.fn(),
      createGain: vi.fn(),
    };

    const win = window as unknown as Record<string, unknown>;
    win.AudioContext = vi.fn().mockImplementation(() => mockAudioContext);

    playWhatsAppNotificationSound(false);
    expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
  });
});
