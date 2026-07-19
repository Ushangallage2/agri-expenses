import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API } from "../utils/api";
import { play, unlockAudio } from "../utils/sounds";
import SoundToggle from "../components/SoundToggle";
import ConfirmModal from "../components/ConfirmModal";

type Note = {
  id: number;
  crop_name: string;
  note: string;
  created_at: string;
};

export default function CropNotes() {
  const { cropName = "" } = useParams();
  const crop = decodeURIComponent(cropName);
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<number | null>(null);

  async function load() {
    try {
      const res = await fetch(
        `${API}/getCropNotes?crop=${encodeURIComponent(crop)}`,
        { credentials: "include" }
      );
      if (res.status === 401) {
        navigate("/login");
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      setNotes(await res.json());
    } catch (err: any) {
      setError(err.message || "Failed to load notes");
    }
  }

  useEffect(() => {
    load();
  }, [crop]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    void unlockAudio();
    play("click");
    try {
      const res = await fetch(`${API}/addCropNote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ crop, note: text }),
      });
      if (!res.ok) throw new Error(await res.text());
      play("save");
      setText("");
      await load();
    } catch (err: any) {
      play("error");
      setError(err.message || "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  async function removeNote(id: number) {
    void unlockAudio();
    await fetch(`${API}/deleteCropNote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id }),
    });
    play("delete");
    setNoteToDelete(null);
    await load();
  }

  return (
    <div className="page-container animate-rise">
      <header className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <button type="button" className="glass-btn" onClick={() => navigate("/dashboard")}>
          ← Back
        </button>
        <div className="text-center flex-1">
          <p className="eyebrow">Crop ledger</p>
          <h1 className="font-display text-3xl md:text-4xl text-gold glow-text">{crop}</h1>
        </div>
        <SoundToggle />
      </header>

      <form onSubmit={addNote} className="glass-card max-w-2xl mx-auto mb-6 space-y-3">
        <h2 className="font-display text-xl text-gold">Add note</h2>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <textarea
          className="glass-input min-h-[120px] resize-y"
          placeholder="Field observations, harvest notes, vendor details…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
        />
        <button className="glass-btn gold-btn" disabled={loading}>
          {loading ? "Saving…" : "Save note"}
        </button>
      </form>

      <div className="max-w-2xl mx-auto space-y-3">
        {notes.length === 0 && (
          <div className="glass-panel text-center text-gold-muted py-10">
            No notes yet for this crop.
          </div>
        )}
        {notes.map((n, i) => (
          <article
            key={n.id}
            className="glass-card relative animate-rise"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <button
              type="button"
              className="absolute top-4 right-4 text-red-400/80 hover:text-red-300"
              onClick={() => setNoteToDelete(n.id)}
              aria-label="Delete note"
            >
              ✕
            </button>
            <p className="text-sm text-gold-muted mb-2">
              {new Date(n.created_at).toLocaleString()}
            </p>
            <p className="whitespace-pre-wrap leading-relaxed pr-6">{n.note}</p>
          </article>
        ))}
      </div>

      <ConfirmModal
        open={noteToDelete != null}
        title="Delete note?"
        message="This note will be removed permanently."
        confirmLabel="Delete"
        onCancel={() => setNoteToDelete(null)}
        onConfirm={() => {
          if (noteToDelete != null) void removeNote(noteToDelete);
        }}
      />
    </div>
  );
}
