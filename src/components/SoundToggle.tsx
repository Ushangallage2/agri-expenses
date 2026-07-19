import { useEffect, useState } from "react";
import { isMuted, play, setMuted, unlockAudio } from "../utils/sounds";

export default function SoundToggle({ className = "" }: { className?: string }) {
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    setMutedState(isMuted());
  }, []);

  function toggle() {
    void unlockAudio();
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) play("click");
  }

  return (
    <button
      type="button"
      className={`glass-btn ${className}`}
      onClick={toggle}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      title={muted ? "Unmute" : "Mute"}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
