'use strict';
/* ============================================================
   ECHOES ON THE THRESHOLD — main.js
   CSE 358 Introduction to Artificial Intelligence

   ARCHITECTURE OVERVIEW
   ─────────────────────────────────────────────────────────────
   STATE MACHINE   → 6 screens, linear progression
   AI (NLP)        → TensorFlow.js Universal Sentence Encoder
                     maps user text → 512-dim vector →
                     cosine similarity → chosen door index
   WEB AUDIO API   → procedural knock sound, door creak sound,
                     reverb ambience drone (godlike voice effect),
                     procedural final-room music synthesis
   SPEECH API      → SpeechSynthesisUtterance, pitch=0.1, rate=0.75
   FLASK BACKEND   → POST /generate → Groq LLM + Pollinations image
   ─────────────────────────────────────────────────────────────
*/

/* ============================================================
   SECTION 1 — CONSTANTS
   ============================================================ */

/*
  QUESTION_POOL — tüm sorular buraya gelir.
  Her oyun başında 3 tanesi rastgele seçilir (tekrarsız).
  Soru bankasını buraya ekle.
*/
const QUESTION_POOL = [
  // ── Letting Go & Burdens ─────────────────────────────────
  'Are you ready to take off your badge? What was the true burden you were carrying?',
  'Who did you find hardest to say goodbye to in the world you left behind?',
  'What heavy secret, carried on your shoulders, would you like to leave at this threshold?',
  'Do you have the courage to lay down your weapons, your strongest defenses?',
  'Why do the walls you built to protect yourself now feel like a prison?',
  'What did losing your most prized possession teach you about life?',
  'Whose invisible blood on your hands have you still not washed away?',
  'What lie did you cling to that ultimately couldn\'t keep you alive?',
  'When it was time to go, what did you realize was holding you back the most?',

  // ── Regret & The Past ────────────────────────────────────
  'What was the biggest sentence in your life that ended with "if only"?',
  'Who do you think it is too late to ask for forgiveness?',
  'If you could turn back time, which path would you choose at the exact moment your heart was broken?',
  'What weighed heavier: the words you couldn\'t say, or the ones you shouted in anger?',
  'How much of your own life did you steal to live someone else\'s?',
  'What unfinished story has followed you all the way here?',
  'Which past mistake actually became your greatest teacher?',
  'Whose wound is still bleeding, even though you know you can never heal it?',

  // ── Identity & Truth ─────────────────────────────────────
  'The last time you looked in the mirror, did the face you saw truly belong to you?',
  'When your titles, achievements, and name are erased, who is left behind?',
  'How much of your soul was consumed by being the person others expected you to be?',
  'What was the greatest act of kindness you performed when no one was watching?',
  'Which of your own faces were you most afraid to confront when left alone in the dark?',
  'Did you defend what you believed in, or were you just trying to survive?',
  'What was the hidden desire you kept in the deepest corner of your heart, known to no one?',
  'When you take off your mask, will you be able to face the silence underneath?',

  // ── War, 1973 & The Badge ────────────────────────────────
  // The Vietnam War is ending. A generation is laying down weapons
  // they were handed before they understood what carrying them meant.
  'Which of your wars did you realize too late you were never supposed to win?',
  'How much of your soul did you sacrifice to find peace?',
  'Have you ever noticed your own reflection in the person you saw as your enemy?',
  'Who did you unjustly sacrifice for the sake of the truths you believed in?',
  'Did staying silent against the world\'s injustices make you an accomplice?',
  'Who actually paid the price for that great victory you thought you won?',
  'Do you really think you can pass through this door without ending the war inside yourself?',
  'You were handed a weapon before you understood what carrying it would cost. Did you ever truly choose it?',
  'When the order came that made no sense, did you follow it — and what part of yourself did that cost?',
  'Have you ever worn a uniform — a title, a role, a way of being — that you knew, long before the end, you could no longer use?',
  'The badge is heavy. What were you protecting when you put it on? Is that thing still worth protecting?',
  'A friend stood on the other side of a line and you chose the line. Was the line worth it?',
  'Vietnam ended. The soldiers came home. Nobody knew how to look at them. Have you ever come home to a silence like that?',
  'Was there a cause you believed in completely, until the moment you saw what was done in its name?',
  'If you could send one message back to the person you were before the war — before whichever war was yours — what would it say?',

  // ── Love & Loss ──────────────────────────────────────────
  'Whose love healed you the most, and how did you wound them?',
  'Have you ever saved someone you loved simply by letting them go?',
  'Who did you love completely, purely, and without expecting anything in return — even just once?',
  'Who inflicted the first betrayal that turned your heart to stone?',
  'What feeling did you cling to, calling it love, when it was really just a habit?',
  'Did you live without ever finding something you would die for?',
  'Do you truly know who you shed your tears for?',

  // ── Mortality & Legacy ───────────────────────────────────
  'When you felt the darkness falling, what was the first thing you remembered?',
  'Do you think the mark you left on the world is a scar or a healing touch?',
  'When your story is told by someone else, will they make you the hero or the victim?',
  'What was the first moment you truly felt, deep in your bones, that you were mortal?',
  'Are you afraid of being forgotten, or of being remembered forever?',
  'What was that small, beautiful memory known only to you?',
  'In that chaotic game called life, did you ever question who made the rules?',
  'Did you also believe the lie that suffering makes life more profound?',
  'Is the echo you hear while knocking on the door the sound of your own heart, or your fear?',
  'Are you at the final note of a finished song, or at the beginning of a new silence?',
  'And now, as you stand before this door… Do you really feel like you have lived?',
];

/* Her oyun başında 3 benzersiz soru seçer */
function getRandomQuestions() {
  const pool    = [...QUESTION_POOL];
  const picked  = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push({ round: i + 1, english: pool.splice(idx, 1)[0] });
  }
  return picked;
}

/* Aktif 3 soru — her restart'ta yenilenir */
let QUESTIONS = getRandomQuestions();

/*
  Door definitions.
  symbol   → Unicode glyph shown above each door (visual, not labeled)
  name     → internal name used in backend payload
  anchor   → semantic anchor text fed to Universal Sentence Encoder.
             These phrases define the "semantic centre" of each door.
             IDW / cosine-similarity maps user answers toward one anchor.
*/
const DOORS = [
  {
    symbol: '☽',
    name:   'Moon',
    anchor: 'loss emptiness darkness longing grief sorrow absence mourning fallen soldier ' +
            'missing home widow farewell homeland the dead who did not come back',
  },
  {
    symbol: '△',
    name:   'Flame',
    anchor: 'anger rage defiance resistance protest fury burning fight counterculture ' +
            'draft refusal revolt injustice power battle the war that was wrong',
  },
  {
    symbol: '∿',
    name:   'Feather',
    anchor: 'peace letting go acceptance release surrender laying down the weapon ceasefire ' +
            'forgiveness gentle armistice the badge you can no longer use rest breath',
  },
  {
    symbol: '⊗',
    name:   'Key',
    anchor: 'past secrets memory locked identity hidden truth burden regret allegiance ' +
            'classified mission the name you carried the self you buried the road not taken',
  },
];

/* ============================================================
   SECTION 2 — APPLICATION STATE
   ============================================================ */

let currentRound   = 0;           // 0-indexed, 0–2
let currentState   = 'intro';
let choices        = [];           // [{ round, door_index, door_symbol, answer }, ...]
let chosenDoorIdx  = -1;           // set after NLP runs

/* ============================================================
   SECTION 3 — WEB AUDIO ENGINE
   ============================================================ */

let audioCtx       = null;
let dylanAudio     = null;         // <audio> element for the cover
let noiseSource    = null;         // looping white-noise buffer (for creak)

/* AudioContext must be created inside a user-gesture handler. */
function initAudioContext() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  /* Start Dylan cover (may fail silently if file is missing) */
  dylanAudio = document.getElementById('dylan-audio');
  dylanAudio.volume = 0.22;
  dylanAudio.play().catch(() => {});
}

/* ── KNOCK SOUND ────────────────────────────────────────────
   Three short impulses of band-passed noise simulate
   knuckles striking wood. Each impulse is a short white-noise
   burst with exponential decay, filtered around 180 Hz.
   ──────────────────────────────────────────────────────────── */
function playKnock() {
  if (!audioCtx) return;
  const delays = [0, 0.32, 0.64];

  delays.forEach(delayS => {
    const dur    = 0.13;
    const sr     = audioCtx.sampleRate;
    const buf    = audioCtx.createBuffer(1, Math.floor(sr * dur), sr);
    const data   = buf.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      /* White noise * exponential decay envelope */
      data[i] = (Math.random() * 2 - 1)
              * Math.pow(1 - i / data.length, 5)
              * 0.9;
    }

    const src    = audioCtx.createBufferSource();
    src.buffer   = buf;

    /* Bandpass filter: wood resonance is in the 150-250 Hz range */
    const bpf    = audioCtx.createBiquadFilter();
    bpf.type     = 'bandpass';
    bpf.frequency.value = 180;
    bpf.Q.value  = 1.2;

    const gain   = audioCtx.createGain();
    gain.gain.value = 1.8;

    src.connect(bpf);
    bpf.connect(gain);
    gain.connect(audioCtx.destination);
    src.start(audioCtx.currentTime + delayS);
  });
}

/* ── DOOR OPEN SOUND ────────────────────────────────────────
   Heavy wooden door physics — no oscillators (oscillators
   cause the squeaky tone). Instead: filtered noise only.

   Layer 1 — deep thud: low-pass noise burst (hinge weight)
   Layer 2 — wood creak: two resonant high-Q bandpass noise
             sources whose centre frequencies sweep slowly
             through the 80-200 Hz range (wood under stress)
   ──────────────────────────────────────────────────────────── */
function playDoorCreak() {
  if (!audioCtx) return;
  const sr  = audioCtx.sampleRate;
  const now = audioCtx.currentTime;

  /* ── Layer 1: deep thud ─────────────────────────────── */
  const thudDur  = 0.5;
  const thudBuf  = audioCtx.createBuffer(1, Math.round(sr * thudDur), sr);
  const thudData = thudBuf.getChannelData(0);
  for (let i = 0; i < thudData.length; i++) {
    thudData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / thudData.length, 2.5);
  }
  const thudSrc  = audioCtx.createBufferSource();
  thudSrc.buffer = thudBuf;

  const thudLpf       = audioCtx.createBiquadFilter();
  thudLpf.type        = 'lowpass';
  thudLpf.frequency.value = 110;
  thudLpf.Q.value     = 1.8;

  const thudGain      = audioCtx.createGain();
  thudGain.gain.setValueAtTime(1.1, now);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + thudDur);

  thudSrc.connect(thudLpf);
  thudLpf.connect(thudGain);
  thudGain.connect(audioCtx.destination);
  thudSrc.start(now);
  thudSrc.stop(now + thudDur);

  /* ── Layer 2a: primary wood creak ───────────────────── */
  const creakDur   = 2.6;
  const nBuf1      = audioCtx.createBuffer(1, Math.round(sr * creakDur), sr);
  const nData1     = nBuf1.getChannelData(0);
  for (let i = 0; i < nData1.length; i++) nData1[i] = Math.random() * 2 - 1;
  const nSrc1      = audioCtx.createBufferSource();
  nSrc1.buffer     = nBuf1;

  /* High-Q bandpass: centre frequency drifts slowly — wood under stress */
  const bpf1       = audioCtx.createBiquadFilter();
  bpf1.type        = 'bandpass';
  bpf1.frequency.setValueAtTime(85,  now + 0.08);
  bpf1.frequency.linearRampToValueAtTime(155, now + 1.1);
  bpf1.frequency.linearRampToValueAtTime(90,  now + 2.2);
  bpf1.Q.value     = 14;

  const gCreak1    = audioCtx.createGain();
  gCreak1.gain.setValueAtTime(0,    now);
  gCreak1.gain.linearRampToValueAtTime(0.26, now + 0.22);
  gCreak1.gain.setValueAtTime(0.20, now + 1.9);
  gCreak1.gain.linearRampToValueAtTime(0,    now + creakDur);

  nSrc1.connect(bpf1);
  bpf1.connect(gCreak1);
  gCreak1.connect(audioCtx.destination);
  nSrc1.start(now + 0.08);
  nSrc1.stop(now + creakDur);

  /* ── Layer 2b: secondary resonance ─────────────────── */
  const nBuf2      = audioCtx.createBuffer(1, Math.round(sr * creakDur), sr);
  const nData2     = nBuf2.getChannelData(0);
  for (let i = 0; i < nData2.length; i++) nData2[i] = Math.random() * 2 - 1;
  const nSrc2      = audioCtx.createBufferSource();
  nSrc2.buffer     = nBuf2;

  const bpf2       = audioCtx.createBiquadFilter();
  bpf2.type        = 'bandpass';
  bpf2.frequency.setValueAtTime(125, now + 0.12);
  bpf2.frequency.linearRampToValueAtTime(195, now + 1.3);
  bpf2.frequency.linearRampToValueAtTime(105, now + 2.3);
  bpf2.Q.value     = 9;

  const gCreak2    = audioCtx.createGain();
  gCreak2.gain.setValueAtTime(0,    now);
  gCreak2.gain.linearRampToValueAtTime(0.12, now + 0.30);
  gCreak2.gain.linearRampToValueAtTime(0,    now + creakDur);

  nSrc2.connect(bpf2);
  bpf2.connect(gCreak2);
  gCreak2.connect(audioCtx.destination);
  nSrc2.start(now + 0.12);
  nSrc2.stop(now + creakDur);
}

/* ── WHOOSH SOUND (walk-through transition) ─────────────────
   Bandpass-filtered noise that sweeps from high to low —
   the acoustic signature of air rushing past as you move
   through the doorway.
   ──────────────────────────────────────────────────────────── */
function playWhoosh() {
  if (!audioCtx) return;
  const sr  = audioCtx.sampleRate;
  const now = audioCtx.currentTime;
  const dur = 1.6;

  const buf  = audioCtx.createBuffer(2, Math.round(sr * dur), sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  /* High → low sweep: the classic air-rush signature */
  const bpf        = audioCtx.createBiquadFilter();
  bpf.type         = 'bandpass';
  bpf.frequency.setValueAtTime(2200, now);
  bpf.frequency.exponentialRampToValueAtTime(140, now + dur);
  bpf.Q.value      = 0.45;

  const gain       = audioCtx.createGain();
  gain.gain.setValueAtTime(0,    now);
  gain.gain.linearRampToValueAtTime(0.55, now + 0.12);
  gain.gain.linearRampToValueAtTime(0,    now + dur);

  const src        = audioCtx.createBufferSource();
  src.buffer       = buf;
  src.connect(bpf);
  bpf.connect(gain);
  gain.connect(audioCtx.destination);
  src.start(now);
  src.stop(now + dur);
}

/* ── WALK-THROUGH DOOR (transition helper) ──────────────────
   Zooms the active screen outward (camera rushes forward)
   and fades a dark overlay in to black, then fires callback
   to switch the screen, then fades the overlay back out.
   ──────────────────────────────────────────────────────────── */
/* targetEl: the door element to zoom toward (null = center) */
function walkThroughDoor(targetEl, callback) {
  const overlay      = document.getElementById('walk-overlay');
  const activeScreen = document.querySelector('.screen.active');

  /* Zoom origin = centre of the chosen door in viewport coordinates */
  if (activeScreen) {
    let originX = '50%';
    let originY = '50%';
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      originX = ((rect.left + rect.width  / 2) / window.innerWidth  * 100).toFixed(1) + '%';
      originY = ((rect.top  + rect.height / 2) / window.innerHeight * 100).toFixed(1) + '%';
    }
    activeScreen.style.transformOrigin = `${originX} ${originY}`;
    activeScreen.style.transition      = 'transform 1.1s ease-in';
    activeScreen.style.transform       = 'scale(2.5)';
  }

  playWhoosh();

  setTimeout(() => {
    overlay.style.transition = 'opacity 0.65s ease-in';
    overlay.style.opacity    = '1';
  }, 300);

  setTimeout(() => {
    callback();
    if (activeScreen) {
      activeScreen.style.transition      = 'none';
      activeScreen.style.transform       = '';
      activeScreen.style.transformOrigin = '';
    }
    setTimeout(() => {
      overlay.style.transition = 'opacity 0.7s ease-out';
      overlay.style.opacity    = '0';
    }, 120);
  }, 1000);
}

/* ── REVERB AMBIENCE (Godlike Voice Companion) ──────────────
   Plays a very low drone (A1 = 55 Hz) through a procedurally
   generated convolution reverb. The reverb impulse response
   is exponentially-decaying noise — identical to the IR of a
   large stone cathedral. This drone underpins the TTS voice
   and gives it an otherworldly, reverberant quality even though
   the SpeechSynthesis output cannot be routed through Web Audio.
   ──────────────────────────────────────────────────────────── */
function playReverbAmbience(durationS = 5) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  const convolver = buildReverb(3, 2.5);

  /* Low drone oscillator */
  const osc          = audioCtx.createOscillator();
  osc.type           = 'sine';
  osc.frequency.value = 55;   // A1

  /* Second harmonic — very quiet */
  const osc2         = audioCtx.createOscillator();
  osc2.type          = 'sine';
  osc2.frequency.value = 82.5; // E2
  const osc2Gain     = audioCtx.createGain();
  osc2Gain.gain.value = 0.18;

  const masterGain   = audioCtx.createGain();
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(0.12, now + 1.2);
  masterGain.gain.setValueAtTime(0.12, now + durationS - 1.5);
  masterGain.gain.linearRampToValueAtTime(0,    now + durationS);

  osc.connect(convolver);
  osc2.connect(osc2Gain);
  osc2Gain.connect(convolver);
  convolver.connect(masterGain);
  masterGain.connect(audioCtx.destination);

  osc.start(now);  osc.stop(now + durationS);
  osc2.start(now); osc2.stop(now + durationS);
}

/* ── REVERB BUILDER (shared helper) ─────────────────────────
   Generates a convolution reverb impulse response procedurally:
   exponentially-decaying stereo white noise.
   decay controls how fast the tail fades (higher = shorter tail).
   ──────────────────────────────────────────────────────────── */
function buildReverb(durationS = 3, decay = 2) {
  const len = audioCtx.sampleRate * durationS;
  const buf = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  const conv = audioCtx.createConvolver();
  conv.buffer = buf;
  return conv;
}

/* ── FINAL-ROOM AMBIENT MUSIC ────────────────────────────────
   GENERATIVE AMBIENT SOUNDSCAPE
   ─────────────────────────────────────────────────────────────
   İki katman:

   1. DRONE PAD — 3 sine oscillator (sub-bas, temel, beşinci)
      Her biri yavaş LFO ile titreşir → organik "nefes" efekti
      Staggered fade-in (5-9 saniye) → sessizlikten yükselir

   2. SPARSE KARPLUS-STRONG MELODY — her 5-18 saniyede bir
      rastgele nota çalar; hiçbir zaman aynı sırayla tekrar etmez.
      Kapı seçimi → modal gam → karakter değişir:
        Moon    → Aeolian (doğal minör, kasvetli)
        Flame   → Phrygian (egzotik, gergin)
        Feather → Lydian   (aydınlık, uhrevi)
        Key     → Dorian   (modal, gizemli)

   Sonuç: her oyun benzersiz, sinemasal, tekrarsız.
   ──────────────────────────────────────────────────────────── */
function playFinalRoomMusic(musicMood) {
  if (!audioCtx) return;
  const now  = audioCtx.currentTime;
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  /* ── Door → tonal identity ────────────────────────────── */
  const DOOR_ROOT   = [50, 52, 55, 57]; // D3, E3, G3, A3 (MIDI)
  const DOOR_SCALES = [
    [0, 2, 3, 7, 8, 10],  // Moon:    Aeolian
    [0, 1, 3, 7, 8, 10],  // Flame:   Phrygian
    [0, 2, 4, 6, 7, 9 ],  // Feather: Lydian
    [0, 2, 3, 7, 9, 10],  // Key:     Dorian
  ];

  const counts   = [0, 0, 0, 0];
  choices.forEach(c => counts[c.door_index]++);
  const dominant = counts.indexOf(Math.max(...counts));
  const root     = DOOR_ROOT[dominant];
  const scale    = DOOR_SCALES[dominant];

  /* ── Shared reverb (6 s long tail) ───────────────────── */
  const reverb     = buildReverb(6, 0.75);
  const reverbGain = audioCtx.createGain();
  reverbGain.gain.value = 0.70;
  reverb.connect(reverbGain);
  reverbGain.connect(audioCtx.destination);

  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0,    now);
  master.gain.linearRampToValueAtTime(0.55, now + 7);
  master.connect(audioCtx.destination);
  master.connect(reverb);

  /* ── Layer 1: Drone pad ───────────────────────────────── */
  const droneNotes = [root - 12, root, root + 7]; // sub, fund, fifth
  const droneVols  = [0.24, 0.16, 0.11];
  const droneFades = [3.5, 5.5, 8.5];              // staggered attack

  droneNotes.forEach((n, i) => {
    const freq = midi(n) * (1 + (i - 1) * 0.0015); // slight detune
    const osc  = audioCtx.createOscillator();
    osc.type   = 'sine';
    osc.frequency.value = freq;

    /* Gentle LFO pitch wobble — organic breathing quality */
    const lfo      = audioCtx.createOscillator();
    lfo.type       = 'sine';
    lfo.frequency.value = 0.06 + i * 0.04;
    const lfoDepth = audioCtx.createGain();
    lfoDepth.gain.value = freq * 0.0025;
    lfo.connect(lfoDepth);
    lfoDepth.connect(osc.frequency);

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0,             now);
    g.gain.linearRampToValueAtTime(droneVols[i], now + droneFades[i]);

    osc.connect(g);
    g.connect(master);
    osc.start(now);
    lfo.start(now);
    /* Oscillators stopped automatically when audioCtx.close() is called */
  });

  /* ── Layer 2: Karplus-Strong sparse plucks ────────────── */
  function buildString(freq, dur) {
    const sr     = audioCtx.sampleRate;
    const period = Math.max(2, Math.round(sr / freq));
    const len    = Math.round(sr * (dur + 0.6));
    const buf    = audioCtx.createBuffer(1, len, sr);
    const data   = buf.getChannelData(0);
    const ring   = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
    for (let i = 0; i < len; i++) {
      const idx  = i % period;
      const next = (idx + 1) % period;
      data[i]    = ring[idx];
      ring[idx]  = 0.4985 * (ring[idx] + ring[next]);
    }
    return buf;
  }

  function pluck(midiNote, startT, dur, vel) {
    const buf = buildString(midi(midiNote), dur);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const g   = audioCtx.createGain();
    g.gain.value = vel;
    src.connect(g);
    g.connect(master);
    src.start(startT);
  }

  /* Build 2-octave note pool from the chosen scale */
  const notePool = [];
  for (const interval of scale) {
    notePool.push(root + interval);
    notePool.push(root + interval + 12);
  }
  notePool.push(root - 12); // deep bass touch

  /* Schedule ~28 sparse notes over ~3 minutes (never the same twice) */
  let t = now + 11; // let drone breathe first
  for (let i = 0; i < 28; i++) {
    const note = notePool[Math.floor(Math.random() * notePool.length)];
    const dur  = 2.8 + Math.random() * 5.5;
    const vel  = 0.15 + Math.random() * 0.30;
    pluck(note, t, dur, vel);
    t += 5 + Math.random() * 13; // 5–18 s gap → long silences are intentional
  }
}

/* ============================================================
   SECTION 4 — TF.JS UNIVERSAL SENTENCE ENCODER (NLP ENGINE)

   ALGORITHM:
     1. At startup, embed 4 anchor texts (one per door) → 4×512 matrix
     2. When user submits an answer, embed the answer → 1×512 vector
     3. Compute cosine similarity between answer and each anchor
     4. Softmax the similarities (temperature=8 to sharpen)
     5. Highest-probability index = chosen door

   WHY COSINE SIMILARITY?
     Cosine similarity measures the angle between two vectors in
     512-dimensional embedding space, ignoring magnitude.
     Semantically similar sentences cluster nearby; dissimilar ones
     are orthogonal or opposite. This is the same operation used
     in nearest-neighbour semantic search (e.g., RAG pipelines).
   ============================================================ */

let useModel        = null;
let anchorEmbeddings = null;   // tf.Tensor2D [4, 512]
let nlpReady        = false;

async function loadNLP() {
  try {
    document.getElementById('nlp-status').textContent = 'NLP MODEL LOADING…';

    await tf.ready();

    useModel         = await use.load();
    anchorEmbeddings = await useModel.embed(DOORS.map(d => d.anchor));
    nlpReady         = true;
    document.getElementById('nlp-status').textContent = '';
  } catch (err) {
    console.warn('USE model failed to load:', err);
    document.getElementById('nlp-status').textContent = 'NLP OFFLINE — RANDOM DOOR';
  }
}

/*
  Returns { doorIndex, scores } where:
    doorIndex — winning door (0-3)
    scores    — { Moon, Flame, Feather, Key } softmax probabilities (0-1)
  These scores are forwarded to the LLM so it can feel the full
  emotional weight distribution, not just the winning door.
*/
async function getDoorIndex(answerText) {
  if (!nlpReady || !answerText.trim()) {
    const doorIndex = Math.floor(Math.random() * 4);
    return { doorIndex, scores: null };
  }

  document.getElementById('nlp-status').textContent = 'READING YOUR SOUL…';

  const userEmb = await useModel.embed([answerText.trim()]);
  const userVec = userEmb.squeeze();

  const similarities = [];
  for (let i = 0; i < 4; i++) {
    const anchor = anchorEmbeddings.slice([i, 0], [1, 512]).squeeze();
    const dot    = tf.sum(tf.mul(userVec, anchor)).dataSync()[0];
    const normU  = tf.norm(userVec).dataSync()[0];
    const normA  = tf.norm(anchor).dataSync()[0];
    similarities.push(dot / (normU * normA + 1e-8));
    anchor.dispose();
  }

  userEmb.dispose();
  userVec.dispose();
  document.getElementById('nlp-status').textContent = '';

  const probs     = softmax(similarities, 8);
  const doorIndex = probs.indexOf(Math.max(...probs));

  /* Named score map sent to LLM */
  const scores = {};
  DOORS.forEach((d, i) => { scores[d.name] = parseFloat(probs[i].toFixed(3)); });

  return { doorIndex, scores };
}

/* Standard softmax with temperature parameter */
function softmax(arr, temperature = 1) {
  const max  = Math.max(...arr);
  const exps = arr.map(x => Math.exp((x - max) * temperature));
  const sum  = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

/* ============================================================
   SECTION 5 — SPEECH SYNTHESIS  (Godlike Voice)

   We use the Web Speech API's SpeechSynthesisUtterance.
   pitch=0.1 (very low) + rate=0.75 (slow) produces a deep,
   measured voice. We simultaneously trigger playReverbAmbience()
   so the low drone underpins the speech, giving it the feel
   of a voice heard in a reverberant stone chamber.
   ============================================================ */
function speakQuestion(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const utt   = new SpeechSynthesisUtterance(text);
  utt.pitch   = 0.1;    // lowest possible
  utt.rate    = 0.78;   // slow and deliberate
  utt.volume  = 1.0;

  /* Prefer a deep British male voice if available */
  const voices = window.speechSynthesis.getVoices();
  const deep   = voices.find(v =>
    v.name.includes('Daniel') ||
    v.name.includes('Google UK English Male') ||
    (v.lang === 'en-GB' && v.name.toLowerCase().includes('male'))
  ) || voices.find(v => v.lang.startsWith('en'));

  if (deep) utt.voice = deep;

  /* The reverb drone lasts the length of the speech (approx 6 s) */
  playReverbAmbience(6);
  window.speechSynthesis.speak(utt);
}

/* ============================================================
   SECTION 6 — STATE MACHINE

   States (linear):
     intro → scene0 → question[0] → doors[0]
          → question[1] → doors[1]
          → question[2] → doors[2]
          → loading → final
   ============================================================ */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
  });
  document.getElementById(`screen-${id}`).classList.add('active');
  currentState = id;
}

/* ── INTRO ──────────────────────────────────────────────────── */
document.getElementById('screen-intro').addEventListener('click', () => {
  initAudioContext();
  loadNLP();                     // start downloading USE in background
  showScreen('scene0');
  setTimeout(animateDoorLight, 600);
});

/* ── SCENE 0 (single entrance door) ─────────────────────────── */
function animateDoorLight() {
  /* already animated by CSS; nothing extra needed */
}

const singleDoor    = document.getElementById('single-door');
const doorKnocker   = singleDoor.querySelector('.door-knocker');
let   knockingDone  = false;

singleDoor.addEventListener('click', () => {
  if (knockingDone) return;
  knockingDone = true;

  /* 1. Visual knock animation */
  doorKnocker.classList.add('knocking');

  /* 2. Audio: three knock sounds */
  playKnock();

  /* 3. After knocks, open the door */
  setTimeout(() => {
    doorKnocker.classList.remove('knocking');
    singleDoor.classList.add('opening');
    playDoorCreak();

    /* 4. Walk through the entrance — zooms toward the door's position */
    setTimeout(() => {
      walkThroughDoor(singleDoor, () => {
        knockingDone = false;
        singleDoor.classList.remove('opening');
        currentRound = 0;
        enterQuestionScreen(currentRound);
      });
    }, 900);
  }, 1100);
});

/* ── QUESTION SCREEN ─────────────────────────────────────────── */
function enterQuestionScreen(roundIndex) {
  const q = QUESTIONS[roundIndex];

  document.getElementById('round-indicator').textContent =
    `${'I II III'.split(' ')[roundIndex]} / III`;
  document.getElementById('question-text').textContent = q.english;
  document.getElementById('answer-input').value = '';
  document.getElementById('nlp-status').textContent = '';

  showScreen('question');

  /* Speak the question after a short dramatic pause */
  setTimeout(() => speakQuestion(q.english), 900);
}

/* Submit answer button */
document.getElementById('answer-submit').addEventListener('click', submitAnswer);
document.getElementById('answer-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.shiftKey === false) {
    e.preventDefault();
    submitAnswer();
  }
});

async function submitAnswer() {
  const answer = document.getElementById('answer-input').value.trim();
  if (!answer) return;

  window.speechSynthesis.cancel();

  /* NLP returns winning door + full similarity score map */
  const { doorIndex, scores } = await getDoorIndex(answer);
  chosenDoorIdx = doorIndex;

  choices.push({
    round:       currentRound + 1,
    door_index:  doorIndex,
    door_symbol: DOORS[doorIndex].name,
    answer:      answer,
    scores:      scores,   // {Moon: 0.72, Flame: 0.18, ...} → sent to LLM
  });

  enterDoorsScreen(doorIndex);
}

/* ── DOORS SCREEN ────────────────────────────────────────────── */
function enterDoorsScreen(chosenIdx) {
  const row = document.getElementById('doors-row');
  row.innerHTML = '';   // clear from previous round

  DOORS.forEach((door, i) => {
    /* Wrapper div (symbol + door) */
    const wrapper = document.createElement('div');
    wrapper.className = 'door-4';
    wrapper.id = `door-wrapper-${i}`;

    /* Symbol badge */
    const sym = document.createElement('div');
    sym.className = 'door-symbol';
    sym.textContent = door.symbol;

    /* Door element */
    const d = document.createElement('div');
    d.className = 'door';
    d.innerHTML = `
      <div class="door-panel top"></div>
      <div class="door-panel bottom"></div>
      <div class="door-knob"></div>
    `;

    wrapper.appendChild(sym);
    wrapper.appendChild(d);
    row.appendChild(wrapper);
  });

  showScreen('doors');

  /* After a dramatic pause, highlight the chosen door */
  setTimeout(() => {
    const chosenWrapper = document.getElementById(`door-wrapper-${chosenIdx}`);
    chosenWrapper.classList.add('chosen-door');
    chosenWrapper.querySelector('.door').classList.add('chosen');

    document.getElementById('doors-hint').textContent =
      `The ${DOORS[chosenIdx].symbol} door opens for you…`;

    /* User clicks the glowing door to proceed */
    chosenWrapper.style.cursor = 'pointer';
    chosenWrapper.addEventListener('click', () => openChosenDoor(chosenIdx, chosenWrapper));
  }, 1400);
}

function openChosenDoor(chosenIdx, wrapper) {
  const doorEl = wrapper.querySelector('.door');

  playKnock();

  setTimeout(() => {
    doorEl.classList.add('opening');
    playDoorCreak();

    /* Walk-through: zoom toward the chosen door's position */
    setTimeout(() => {
      walkThroughDoor(doorEl, () => {
        currentRound++;
        doorEl.classList.remove('opening');
        if (currentRound < QUESTIONS.length) {
          enterQuestionScreen(currentRound);
        } else {
          enterLoadingScreen();
        }
      });
    }, 900);
  }, 400);
}

/* ── LOADING SCREEN → BACKEND CALL ──────────────────────────── */
function enterLoadingScreen() {
  showScreen('loading');
  animateLoadingBar();
  fetchGeneratedContent();
}

function animateLoadingBar() {
  const bar = document.getElementById('loading-bar');
  const sub = document.getElementById('loading-sub');
  const msgs = [
    'Reading the weight of what you carried…',
    'Consulting the echoes of 1973…',
    'The badge is almost ready to be laid down…',
    'The door is opening…',
  ];
  let pct = 0;
  let msgIdx = 0;

  const iv = setInterval(() => {
    pct = Math.min(pct + Math.random() * 6, 90);
    bar.style.width = pct + '%';
    if (pct > msgIdx * 22 && msgIdx < msgs.length) {
      sub.textContent = msgs[msgIdx++];
    }
  }, 600);

  /* Store interval ID so we can clear it on completion */
  window._loadingInterval = iv;
}

/*
  POST the 3 choices to the Flask backend.
  Backend runs: Groq LLM → image_prompt → Pollinations URL + story.
*/
async function fetchGeneratedContent() {
  let poem = 'Some echoes never reach the door they came from.';

  try {
    const resp = await fetch('/generate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ choices }),
    });

    if (resp.ok) {
      const data = await resp.json();
      poem = data.poem || poem;
    } else {
      console.warn('Backend error:', resp.status);
    }
  } catch (err) {
    console.warn('Fetch failed (is Flask running?):', err.message);
  }

  clearInterval(window._loadingInterval);
  document.getElementById('loading-bar').style.width = '100%';

  setTimeout(() => enterFinalScreen(poem), 600);
}

/* ── GODLIKE AMBIENCE (final poem) ──────────────────────────
   5-layer drone: A0 sub (felt in chest), A1, E2, A2, A3 shimmer.
   All through a 10-second cathedral reverb tail.
   SpeechSynthesis cannot be routed through Web Audio, but this
   powerful bed underneath creates the illusion of the voice
   resonating in a vast stone chamber.
   ──────────────────────────────────────────────────────────── */
function playGodlikeAmbience() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  const reverb     = buildReverb(10, 0.5);
  const reverbGain = audioCtx.createGain();
  reverbGain.gain.value = 0.55;
  reverb.connect(reverbGain);
  reverbGain.connect(audioCtx.destination);

  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0,    now);
  master.gain.linearRampToValueAtTime(0.10, now + 6);
  master.connect(audioCtx.destination);
  master.connect(reverb);

  const layers = [
    { freq: 27.5,  vol: 0.90, rise: 3  },  // A0 sub — felt, not just heard
    { freq: 55,    vol: 0.55, rise: 5  },  // A1 fundamental
    { freq: 82.5,  vol: 0.25, rise: 7  },  // E2 fifth
    { freq: 110,   vol: 0.10, rise: 9  },  // A2 octave
    { freq: 220,   vol: 0.04, rise: 12 },  // A3 distant shimmer
  ];

  layers.forEach(({ freq, vol, rise }, i) => {
    const osc = audioCtx.createOscillator();
    osc.type  = 'sine';
    osc.frequency.value = freq * (1 + (i % 2 === 0 ? 0.0012 : -0.0012));

    const lfo      = audioCtx.createOscillator();
    lfo.type       = 'sine';
    lfo.frequency.value = 0.05 + i * 0.03;
    const lfoGain  = audioCtx.createGain();
    lfoGain.gain.value = freq * 0.002;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0,   now);
    g.gain.linearRampToValueAtTime(vol, now + rise);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    lfo.start(now);
  });
}

/* ── POEM SPEECH (final room) ────────────────────────────────
   Absolute minimum pitch (0.1) + slowest comfortable rate.
   Godlike drone bed starts 1.5 s before the voice to establish
   the reverberant space, then the poem is spoken into it.
   ──────────────────────────────────────────────────────────── */
function speakPoem(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const spokenText = text
    .replace(/\n\n/g, ' ... ')
    .replace(/\n/g,   ' , ');

  const utt    = new SpeechSynthesisUtterance(spokenText);
  utt.pitch    = 0.1;
  utt.rate     = 0.65;
  utt.volume   = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const deep   = voices.find(v =>
    v.name.includes('Daniel') ||
    v.name.includes('Google UK English Male') ||
    (v.lang === 'en-GB' && v.name.toLowerCase().includes('male'))
  ) || voices.find(v => v.lang.startsWith('en'));
  if (deep) utt.voice = deep;

  /* Drone fills the room first, then the voice enters */
  playGodlikeAmbience();
  setTimeout(() => window.speechSynthesis.speak(utt), 1500);
}

/* ── FINAL SCREEN ────────────────────────────────────────────── */
function enterFinalScreen(poem) {
  document.getElementById('final-story').textContent = poem;
  showScreen('final');

  if (dylanAudio) dylanAudio.volume = 0.06;

  setTimeout(() => speakPoem(poem), 2000);
}

/* Restart button */
document.getElementById('restart-btn').addEventListener('click', () => {
  choices       = [];
  currentRound  = 0;
  chosenDoorIdx = -1;
  knockingDone  = false;

  window.speechSynthesis.cancel();

  /* AudioContext'i kapat → Web Audio synth + reverb drone durur */
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }

  /* Dylan cover'ı sıfırla */
  if (dylanAudio) {
    dylanAudio.volume     = 0.22;
    dylanAudio.currentTime = 0;
    dylanAudio.play().catch(() => {});
  }

  /* Yeni oyun için 3 farklı soru seç */
  QUESTIONS = getRandomQuestions();

  showScreen('intro');
});

/* ============================================================
   SECTION 7 — VOICE LIST POPULATION
   SpeechSynthesis voice list loads asynchronously in Chrome.
   We must wait for the 'voiceschanged' event before selecting
   a voice — otherwise getVoices() returns an empty array.
   ============================================================ */
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();  // pre-cache the list
  };
}
