// Procedural Web Audio synthesis for the Zurich Bullion & Custody Clearinghouse console.
// Implemented as a closure-based factory function (no ES class) modeling physical
// mechanical vault bolts (low-pass filtered triangle thud + high-Q metallic ping).

export interface VaultAcousticsController {
  readonly engageBolt: () => void;
  readonly relayTick: (pitchHz?: number) => void;
  readonly thresholdSweep: () => void;
  readonly releaseChime: () => void;
  readonly breachAlarm: () => void;
  readonly toggleMute: () => boolean;
  readonly isActive: () => boolean;
}

export function createVaultAcoustics(): VaultAcousticsController {
  let audioCtx: AudioContext | null = null;
  let active = true;

  function acquireContext(): AudioContext | null {
    if (!active || typeof window === 'undefined') {
      return null;
    }
    if (!audioCtx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        audioCtx = new Ctor();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function engageBolt(): void {
    const ctx = acquireContext();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime;

      // 1. Low-frequency filtered triangle thud (heavy steel bolt seating)
      const thudOsc = ctx.createOscillator();
      const thudFilter = ctx.createBiquadFilter();
      const thudGain = ctx.createGain();

      thudOsc.type = 'triangle';
      thudOsc.frequency.setValueAtTime(118, t0);
      thudOsc.frequency.exponentialRampToValueAtTime(38, t0 + 0.14);

      thudFilter.type = 'lowpass';
      thudFilter.frequency.setValueAtTime(240, t0);
      thudFilter.Q.setValueAtTime(3.2, t0);

      thudGain.gain.setValueAtTime(0.16, t0);
      thudGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);

      thudOsc.connect(thudFilter);
      thudFilter.connect(thudGain);
      thudGain.connect(ctx.destination);

      thudOsc.start(t0);
      thudOsc.stop(t0 + 0.16);

      // 2. Metallic resonance ping (titanium locking pin overtone)
      const pingOsc = ctx.createOscillator();
      const pingFilter = ctx.createBiquadFilter();
      const pingGain = ctx.createGain();

      pingOsc.type = 'sine';
      pingOsc.frequency.setValueAtTime(1480, t0 + 0.035);
      pingOsc.frequency.exponentialRampToValueAtTime(1120, t0 + 0.26);

      pingFilter.type = 'bandpass';
      pingFilter.frequency.setValueAtTime(1350, t0 + 0.035);
      pingFilter.Q.setValueAtTime(8.5, t0 + 0.035);

      pingGain.gain.setValueAtTime(0.06, t0 + 0.035);
      pingGain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.27);

      pingOsc.connect(pingFilter);
      pingFilter.connect(pingGain);
      pingGain.connect(ctx.destination);

      pingOsc.start(t0 + 0.035);
      pingOsc.stop(t0 + 0.28);
    } catch {
      // Ignore Web Audio restriction errors in headless environments
    }
  }

  function relayTick(pitchHz = 520): void {
    const ctx = acquireContext();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const env = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(pitchHz, t0);
      osc.frequency.exponentialRampToValueAtTime(pitchHz * 0.42, t0 + 0.032);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1100, t0);

      env.gain.setValueAtTime(0.075, t0);
      env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.035);

      osc.connect(filter);
      filter.connect(env);
      env.connect(ctx.destination);

      osc.start(t0);
      osc.stop(t0 + 0.038);
    } catch {
      // Ignore audio errors
    }
  }

  function thresholdSweep(): void {
    const ctx = acquireContext();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const env = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(145, t0);
      osc.frequency.linearRampToValueAtTime(390, t0 + 0.28);
      osc.frequency.linearRampToValueAtTime(290, t0 + 0.42);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(620, t0);

      env.gain.setValueAtTime(0.04, t0);
      env.gain.linearRampToValueAtTime(0.065, t0 + 0.22);
      env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.44);

      osc.connect(filter);
      filter.connect(env);
      env.connect(ctx.destination);

      osc.start(t0);
      osc.stop(t0 + 0.45);
    } catch {
      // Ignore audio errors
    }
  }

  function releaseChime(): void {
    const ctx = acquireContext();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime;
      const partials = [440, 554.37, 659.25, 880];
      partials.forEach((hz, idx) => {
        const start = t0 + idx * 0.055;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(hz, start);
        env.gain.setValueAtTime(0.055, start);
        env.gain.exponentialRampToValueAtTime(0.0009, start + 0.26);
        osc.connect(env);
        env.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.27);
      });
    } catch {
      // Ignore audio errors
    }
  }

  function breachAlarm(): void {
    const ctx = acquireContext();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime;
      [165, 130].forEach((hz, idx) => {
        const start = t0 + idx * 0.09;
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const env = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(hz, start);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(360, start);

        env.gain.setValueAtTime(0.08, start);
        env.gain.exponentialRampToValueAtTime(0.001, start + 0.085);

        osc.connect(filter);
        filter.connect(env);
        env.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.09);
      });
    } catch {
      // Ignore audio errors
    }
  }

  function toggleMute(): boolean {
    active = !active;
    return active;
  }

  function isActive(): boolean {
    return active;
  }

  return {
    engageBolt,
    relayTick,
    thresholdSweep,
    releaseChime,
    breachAlarm,
    toggleMute,
    isActive,
  };
}
