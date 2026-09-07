let lastSoundAt = 0;

const sounds = {
  action: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=", // short click
  response: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=", // short blip
};

const audioPool: { action: HTMLAudioElement | null; response: HTMLAudioElement | null } = {
  action: null,
  response: null,
};

function getAudio(type: "action" | "response"): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  if (!audioPool[type]) {
    try {
      const audio = new Audio(sounds[type]);
      audio.volume = 0.15;
      audioPool[type] = audio;
    } catch {
      return null;
    }
  }
  return audioPool[type];
}

export function playSound(type: "action" | "response") {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - lastSoundAt < 45) {
    return;
  }
  lastSoundAt = now;
  const audio = getAudio(type);
  if (audio) {
    try {
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    } catch {
      // Ignore audio playback rejection
    }
  }
}

