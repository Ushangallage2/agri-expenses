const MUTE_KEY = "agri-ledger-mute";

export type SoundKind = "success" | "save" | "delete" | "error" | "click";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Call from a user gesture so browsers unlock audio. */
export async function unlockAudio() {
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === "suspended") {
    try {
      await audio.resume();
    } catch {
      /* ignore */
    }
  }
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function toggleMuted(): boolean {
  const next = !isMuted();
  setMuted(next);
  return next;
}

type Tone = {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
};

function tone(audio: AudioContext, t: Tone, when: number) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = t.type ?? "sine";
  osc.frequency.value = t.freq;
  const g = t.gain ?? 0.1;
  const start = when + (t.delay ?? 0);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(g, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(start);
  osc.stop(start + t.dur + 0.02);
}

function playSequence(tones: Tone[]) {
  if (isMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  void audio.resume().then(() => {
    const now = audio.currentTime;
    for (const t of tones) tone(audio, t, now);
  });
}

export function play(kind: SoundKind) {
  switch (kind) {
    case "click":
      playSequence([{ freq: 620, dur: 0.04, gain: 0.06, type: "triangle" }]);
      break;
    case "save":
      playSequence([
        { freq: 440, dur: 0.08, gain: 0.09, type: "sine" },
        { freq: 554, dur: 0.1, gain: 0.08, type: "sine", delay: 0.07 },
      ]);
      break;
    case "success":
      playSequence([
        { freq: 523, dur: 0.09, gain: 0.1, type: "sine" },
        { freq: 659, dur: 0.1, gain: 0.09, type: "sine", delay: 0.08 },
        { freq: 784, dur: 0.14, gain: 0.08, type: "sine", delay: 0.16 },
      ]);
      break;
    case "delete":
      playSequence([
        { freq: 320, dur: 0.1, gain: 0.09, type: "triangle" },
        { freq: 220, dur: 0.14, gain: 0.07, type: "triangle", delay: 0.08 },
      ]);
      break;
    case "error":
      playSequence([
        { freq: 260, dur: 0.12, gain: 0.1, type: "square" },
        { freq: 200, dur: 0.16, gain: 0.08, type: "square", delay: 0.1 },
      ]);
      break;
  }
}
