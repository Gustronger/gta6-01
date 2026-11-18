// audio.js — all-synthesised WebAudio sound for VELMORA: Sunset Streets.
// No audio files: every effect is an oscillator or filtered noise burst,
// and the music is a minor-key bassline with hats at about 100 bpm.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let musicTimer = null;
  let musicStep = 0;
  let nextNoteTime = 0;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let sirenHigh = false;

  const api = {
    muted: false,
    ensure,
    sfx,
    sfxAt,
    engine,
    siren,
    musicStart,
    musicStop,
    setMuted,
  };

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = api.muted ? 0 : 0.8;
      master.connect(ctx.destination);
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (err) {
      ctx = null;
    }
  }

  function setMuted(b) {
    api.muted = !!b;
    if (master) master.gain.value = api.muted ? 0 : 0.8;
  }

  function tone(freq, dur, type, vol, slideTo, when) {
    if (!ctx || !master) return;
    const t0 = when || ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, type, when) {
    if (!ctx || !master || !noiseBuf) return;
    const t0 = when || ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type || 'bandpass';
    filter.frequency.value = filterFreq || 1200;
    filter.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.25, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function sfx(name) {
    ensure();
    if (!ctx || api.muted) return;
    switch (name) {
      case 'shot':
        noise(0.12, 0.5, 1800, 'highpass');
        tone(160, 0.09, 'square', 0.25, 60);
        break;
      case 'punch':
        noise(0.08, 0.35, 300, 'lowpass');
        tone(110, 0.08, 'sine', 0.3, 55);
        break;
      case 'pickup':
        tone(660, 0.09, 'sine', 0.22);
        tone(990, 0.14, 'sine', 0.22, null, ctx.currentTime + 0.08);
        break;
      case 'cash':
        tone(880, 0.07, 'triangle', 0.22);
        tone(1174, 0.07, 'triangle', 0.22, null, ctx.currentTime + 0.07);
        tone(1568, 0.12, 'triangle', 0.22, null, ctx.currentTime + 0.14);
        break;
      case 'buy':
        tone(520, 0.08, 'triangle', 0.22);
        tone(780, 0.12, 'triangle', 0.22, null, ctx.currentTime + 0.08);
        break;
      case 'crash':
        noise(0.3, 0.5, 500, 'lowpass');
        tone(90, 0.25, 'sawtooth', 0.25, 40);
        break;
      case 'mission':
        tone(523, 0.12, 'triangle', 0.22);
        tone(659, 0.12, 'triangle', 0.22, null, ctx.currentTime + 0.11);
        tone(784, 0.22, 'triangle', 0.24, null, ctx.currentTime + 0.22);
        break;
      case 'wasted':
        tone(220, 0.35, 'sawtooth', 0.22, 110);
        tone(110, 0.6, 'sawtooth', 0.22, 55, ctx.currentTime + 0.3);
        break;
      case 'busted':
        tone(392, 0.18, 'square', 0.18, 370);
        tone(311, 0.3, 'square', 0.18, 294, ctx.currentTime + 0.18);
        break;
      case 'siren':
        tone(700, 0.4, 'sine', 0.12, 950);
        break;
      case 'click':
        tone(1200, 0.04, 'square', 0.12);
        break;
      case 'steal':
        tone(300, 0.1, 'sawtooth', 0.2, 520);
        break;
      default:
        tone(440, 0.08, 'sine', 0.15);
        break;
    }
  }

  // Positional effect: volume falls with distance from the listener (lx, ly),
  // stereo pan follows the relative x, and anything past ~900 units is silent.
  function sfxAt(name, x, y, lx, ly) {
    ensure();
    if (!ctx || !master || api.muted) return;
    const d = Math.hypot(x - lx, y - ly);
    if (d > 900) return;
    const vol = 1 - d / 900;
    if (vol <= 0.02) return;
    const pan = Math.max(-1, Math.min(1, (x - lx) / 450));
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = pan;
      panner.connect(master);
    }
    // Distance shapes the gain inside playAtVolume; the panner carries pan.
    playAtVolume(name, vol, panner);
  }

  function playAtVolume(name, vol, panner) {
    if (!ctx) return;
    const g = ctx.createGain();
    g.gain.value = vol;
    if (panner) {
      g.connect(panner);
    } else {
      g.connect(master);
    }
    const out = g;
    const t0 = ctx.currentTime;
    if (name === 'shot') {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1800;
      const eg = ctx.createGain();
      eg.gain.setValueAtTime(0.5, t0);
      eg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
      src.connect(f);
      f.connect(eg);
      eg.connect(out);
      src.start(t0);
      src.stop(t0 + 0.14);
    } else if (name === 'crash') {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 500;
      const eg = ctx.createGain();
      eg.gain.setValueAtTime(0.5, t0);
      eg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
      src.connect(f);
      f.connect(eg);
      eg.connect(out);
      src.start(t0);
      src.stop(t0 + 0.32);
    } else {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = name === 'punch' ? 110 : 660;
      const eg = ctx.createGain();
      eg.gain.setValueAtTime(0.25, t0);
      eg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
      osc.connect(eg);
      eg.connect(out);
      osc.start(t0);
      osc.stop(t0 + 0.11);
    }
    setTimeout(() => { try { g.disconnect(); } catch (err) { /* already gone */ } }, 600);
  }

  function engine(speed, driving) {
    ensure();
    if (!ctx || !master) return;
    if (!driving || api.muted) {
      if (engineGain) engineGain.gain.value = 0;
      return;
    }
    if (!engineOsc) {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 700;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    }
    const ratio = Math.max(0, Math.min(1, Math.abs(speed) / 520));
    engineOsc.frequency.value = 55 + ratio * 165;
    engineFilter.frequency.value = 400 + ratio * 900;
    engineGain.gain.value = 0.05 + ratio * 0.07;
  }

  function siren(on) {
    ensure();
    if (!ctx || !master) return;
    if (!on) {
      if (sirenGain) sirenGain.gain.value = 0;
      if (sirenTimer) {
        clearInterval(sirenTimer);
        sirenTimer = null;
      }
      return;
    }
    if (!sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.05;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    }
    sirenGain.gain.value = api.muted ? 0 : 0.05;
    if (!sirenTimer) {
      sirenTimer = setInterval(() => {
        if (!sirenOsc) return;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.value = sirenHigh ? 950 : 700;
      }, 420);
    }
  }

  // Minor-key loop: A minor bassline (A1–E2 walk) with a hat on every beat.
  // Scheduled a bar ahead so it stays steady at ~100 bpm (beat = 0.6 s).
  const BASS = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
  function musicStart() {
    ensure();
    if (!ctx || musicTimer) return;
    musicStep = 0;
    nextNoteTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(() => {
      if (!ctx || api.muted) return;
      while (nextNoteTime < ctx.currentTime + 0.35) {
        const beat = 0.6;
        const note = BASS[musicStep % BASS.length];
        tone(note, beat * 0.9, 'triangle', 0.16, null, nextNoteTime);
        tone(note * 2, beat * 0.4, 'sine', 0.05, null, nextNoteTime);
        noise(0.03, 0.06, 8000, 'highpass', nextNoteTime + beat / 2);
        nextNoteTime += beat;
        musicStep += 1;
      }
    }, 100);
  }

  function musicStop() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return api;
}
