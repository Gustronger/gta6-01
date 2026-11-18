// VELMORA — Sunset Streets: sound.
//
// Everything is synthesized with WebAudio — no audio files, no network. The
// AudioContext is created lazily inside ensure(), so calling any of these
// before the first user gesture is a safe no-op instead of a throw. Every
// public method is wrapped so a missing or denied AudioContext can never
// crash the game loop.
export function createAudio() {
  let ctx = null;
  let master = null;
  let mutedFlag = false;
  let musicTimer = null;
  let musicStep = 0;
  let nextNoteTime = 0;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenLfo = null;
  let sirenGain = null;

  // Create (or resume) the context. Returns it, or null when audio is
  // unavailable — callers treat null as "stay silent".
  function ensure() {
    try {
      if (typeof window === 'undefined') return null;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = mutedFlag ? 0 : 0.5;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  function tone(freq, freqEnd, dur, type, vol, delay) {
    if (!ctx || !master) return;
    try {
      const t0 = ctx.currentTime + (delay || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (freqEnd && freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // A single effect must never take the game down with it.
    }
  }

  function noise(dur, vol, filterFreq, filterType, delay) {
    if (!ctx || !master) return;
    try {
      const t0 = ctx.currentTime + (delay || 0);
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = filterType || 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch {
      // As above: silence is better than a crash.
    }
  }

  const SFX = {
    shot() {
      noise(0.12, 0.5, 1800);
      tone(180, 60, 0.1, 'square', 0.25);
    },
    punch() {
      tone(120, 50, 0.12, 'sine', 0.5);
      noise(0.06, 0.25, 900);
    },
    pickup() {
      tone(660, 660, 0.07, 'sine', 0.3);
      tone(880, 880, 0.1, 'sine', 0.3, 0.07);
    },
    siren() {
      tone(750, 750, 0.16, 'triangle', 0.25);
      tone(950, 950, 0.16, 'triangle', 0.25, 0.16);
    },
    crash() {
      noise(0.3, 0.5, 420);
      tone(90, 40, 0.25, 'sine', 0.4);
    },
    mission() {
      tone(440, 440, 0.12, 'triangle', 0.3);
      tone(523, 523, 0.12, 'triangle', 0.3, 0.12);
      tone(659, 659, 0.12, 'triangle', 0.3, 0.24);
      tone(880, 880, 0.22, 'triangle', 0.3, 0.36);
    },
    wasted() {
      tone(330, 330, 0.25, 'sawtooth', 0.25);
      tone(262, 262, 0.25, 'sawtooth', 0.25, 0.25);
      tone(196, 130, 0.5, 'sawtooth', 0.25, 0.5);
    },
    busted() {
      tone(220, 220, 0.2, 'square', 0.25);
      tone(175, 175, 0.35, 'square', 0.25, 0.2);
    },
    click() {
      tone(1000, 1000, 0.03, 'square', 0.15);
    },
    steal() {
      tone(300, 700, 0.15, 'sawtooth', 0.25);
    },
    cash() {
      tone(988, 988, 0.08, 'sine', 0.3);
      tone(1319, 1319, 0.14, 'sine', 0.3, 0.08);
    },
    buy() {
      tone(784, 784, 0.08, 'triangle', 0.3);
      tone(1047, 1047, 0.14, 'triangle', 0.3, 0.08);
    },
  };

  function sfx(name) {
    try {
      if (!ensure()) return;
      const fn = SFX[name];
      if (fn) fn();
    } catch {
      // Never throw from a sound effect.
    }
  }

  // Engine hum: one sawtooth whose pitch follows speed, audible only while
  // driving. Created once, then only its frequency and gain move.
  function engine(speed, driving) {
    try {
      if (!ensure()) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 55;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      const targetFreq = 50 + Math.max(0, speed || 0) * 0.14;
      engineOsc.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(driving ? 0.05 : 0, ctx.currentTime, 0.1);
    } catch {
      // Silence on failure.
    }
  }

  // Two-tone police siren loop: a triangle wave wobbling between ~700 and
  // ~1000 Hz on a slow square LFO. `on` false fades it out.
  function siren(on) {
    try {
      if (!ensure()) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 850;
        sirenLfo = ctx.createOscillator();
        sirenLfo.type = 'square';
        sirenLfo.frequency.value = 0.7;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 150;
        sirenLfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        sirenLfo.start();
      }
      if (sirenGain) {
        sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, ctx.currentTime, 0.15);
      }
    } catch {
      // Silence on failure.
    }
  }

  // Music: a minor-key bassline (A minor: A1, C2, G1, Bb1) with hats on the
  // off-beats, ~100 bpm, scheduled a little ahead of playback.
  const BASS_STEPS = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 58.27, 0, 65.41, 0];
  const EIGHTH = 60 / 100 / 2;

  function scheduleStep(step, when) {
    const delay = Math.max(0, when - ctx.currentTime);
    const bass = BASS_STEPS[step % BASS_STEPS.length];
    if (bass) tone(bass, bass, 0.26, 'triangle', 0.32, delay);
    if (step % 2 === 1) noise(0.03, 0.08, 7000, 'highpass', delay);
  }

  function musicStart() {
    try {
      if (musicTimer !== null) return;
      if (!ensure()) return;
      musicStep = 0;
      nextNoteTime = ctx.currentTime + 0.1;
      musicTimer = setInterval(() => {
        try {
          if (!ctx) return;
          while (nextNoteTime < ctx.currentTime + 0.3) {
            scheduleStep(musicStep, nextNoteTime);
            musicStep += 1;
            nextNoteTime += EIGHTH;
          }
        } catch {
          // A missed scheduling tick just skips a note.
        }
      }, 100);
    } catch {
      // Silence on failure.
    }
  }

  function musicStop() {
    try {
      if (musicTimer !== null) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    } catch {
      // Nothing to do.
    }
  }

  function setMuted(b) {
    try {
      mutedFlag = !!b;
      if (master) master.gain.setTargetAtTime(mutedFlag ? 0 : 0.5, ctx.currentTime, 0.05);
    } catch {
      // Mute state is kept even if the context is gone.
    }
  }

  return {
    ensure,
    sfx,
    engine,
    siren,
    musicStart,
    musicStop,
    setMuted,
    get muted() {
      return mutedFlag;
    },
  };
}
