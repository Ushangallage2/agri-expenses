import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API } from "../utils/api";
import { play, unlockAudio } from "../utils/sounds";
import { compressImageFile } from "../utils/imageCompress";
import SoundToggle from "../components/SoundToggle";
import ConfirmModal from "../components/ConfirmModal";
import { useAuth } from "../utils/AuthContext";
import { deferWork, invalidateCache, swrLoad } from "../utils/clientCache";

type EntryType = "note" | "todo";

type Note = {
  id: number;
  crop_name: string;
  note: string;
  entry_type?: EntryType;
  completed?: number;
  source?: string | null;
  plant_number?: number | null;
  created_at: string;
};

type CropImage = {
  id: number;
  crop_name: string;
  note_id: number | null;
  image_data: string;
  mime_type: string;
  created_at: string;
};

export default function PlantDetail() {
  const { cropName = "", plantNumber: plantParam = "" } = useParams();
  const crop = decodeURIComponent(cropName);
  const plantNumber = Number(plantParam);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const { isAdmin } = useAuth();

  const [notes, setNotes] = useState<Note[]>([]);
  const [images, setImages] = useState<CropImage[]>([]);
  const [text, setText] = useState("");
  const [entryType, setEntryType] = useState<EntryType>("note");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<number | null>(null);
  const [imageToDelete, setImageToDelete] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<CropImage | null>(null);

  const validPlant = Number.isInteger(plantNumber) && plantNumber >= 1;
  const openTodoCount = notes.filter(
    (n) => (n.entry_type || "note") === "todo" && !Number(n.completed)
  ).length;
  const filteredNotes = notes.filter((n) => {
    const type: EntryType = n.entry_type === "todo" ? "todo" : "note";
    return type === entryType;
  });

  const mapPath = `/crops/${encodeURIComponent(crop)}/plants`;

  async function loadNotes() {
    const res = await fetch(
      `${API}/getCropNotes?crop=${encodeURIComponent(crop)}&plant=${plantNumber}`,
      { credentials: "include" }
    );
    if (res.status === 401) {
      navigate("/login");
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    setNotes(await res.json());
  }

  async function loadImages() {
    const res = await fetch(
      `${API}/getCropImages?crop=${encodeURIComponent(crop)}&plant=${plantNumber}`,
      { credentials: "include" }
    );
    if (res.status === 401) {
      navigate("/login");
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    setImages(await res.json());
  }

  async function loadAll() {
    setError(null);
    try {
      await swrLoad({
        key: `cropNotes:${crop}:p:${plantNumber}`,
        freshMaxAgeMs: 45_000,
        fetcher: async () => {
          const res = await fetch(
            `${API}/getCropNotes?crop=${encodeURIComponent(crop)}&plant=${plantNumber}`,
            { credentials: "include" }
          );
          if (res.status === 401) {
            navigate("/login");
            throw new Error("Unauthorized");
          }
          if (!res.ok) throw new Error(await res.text());
          return res.json() as Promise<Note[]>;
        },
        apply: (rows) => setNotes(rows),
      });
    } catch (err: any) {
      if (err?.message !== "Unauthorized") {
        setError(err.message || "Failed to load notes");
      }
    }
    deferWork(() => {
      void loadImages().catch((err: any) => {
        console.error(err);
        setError(
          (prev) =>
            prev ||
            "Images unavailable — restart npm run dev if you're local."
        );
      });
    }, 80);
  }

  useEffect(() => {
    if (!validPlant) return;
    void loadAll();
  }, [crop, plantNumber, validPlant]);

  async function onPickFile(file: File | null) {
    if (!isAdmin || !file) return;
    try {
      setError(null);
      const { dataUrl } = await compressImageFile(file);
      setPendingImage(dataUrl);
    } catch (err: any) {
      setError(err.message || "Could not read image");
    }
  }

  async function uploadGalleryImage(e: React.ChangeEvent<HTMLInputElement>) {
    if (!isAdmin) return;
    const file = e.target.files?.[0] || null;
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    void unlockAudio();
    try {
      const { dataUrl, mimeType } = await compressImageFile(file);
      const res = await fetch(`${API}/addCropImage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          crop,
          imageData: dataUrl,
          mimeType,
          plantNumber,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      play("save");
      invalidateCache(`plantMap:${crop}`);
      await loadImages();
    } catch (err: any) {
      play("error");
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    if (!text.trim() && !pendingImage) return;
    setLoading(true);
    setError(null);
    void unlockAudio();
    play("click");
    try {
      let noteId: number | null = null;
      if (text.trim()) {
        const res = await fetch(`${API}/addCropNote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            crop,
            note: text.trim() || "(photo)",
            entryType,
            plantNumber,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const row = await res.json();
        noteId = row.id;
      }

      if (pendingImage) {
        const imgRes = await fetch(`${API}/addCropImage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            crop,
            imageData: pendingImage,
            mimeType: "image/jpeg",
            noteId,
            plantNumber,
          }),
        });
        if (!imgRes.ok) throw new Error(await imgRes.text());
      }

      play("save");
      setText("");
      setPendingImage(null);
      invalidateCache(`cropNotes:${crop}:p:${plantNumber}`);
      invalidateCache(`plantMap:${crop}`);
      await loadAll();
    } catch (err: any) {
      play("error");
      setError(err.message || "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  async function toggleTodo(id: number, completed: boolean) {
    if (!isAdmin) return;
    void unlockAudio();
    play("click");
    try {
      const res = await fetch(`${API}/updateCropNote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, completed }),
      });
      if (!res.ok) throw new Error(await res.text());
      play("save");
      invalidateCache(`cropNotes:${crop}:p:${plantNumber}`);
      invalidateCache(`plantMap:${crop}`);
      await loadNotes();
    } catch (err: any) {
      play("error");
      setError(err.message || "Failed to update todo");
    }
  }

  async function removeNote(id: number) {
    if (!isAdmin) return;
    void unlockAudio();
    await fetch(`${API}/deleteCropNote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id }),
    });
    play("delete");
    setNoteToDelete(null);
    invalidateCache(`cropNotes:${crop}:p:${plantNumber}`);
    invalidateCache(`plantMap:${crop}`);
    await loadAll();
  }

  async function removeImage(id: number) {
    if (!isAdmin) return;
    void unlockAudio();
    const res = await fetch(`${API}/deleteCropImage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      play("error");
      return;
    }
    play("delete");
    setImageToDelete(null);
    if (lightbox?.id === id) setLightbox(null);
    invalidateCache(`plantMap:${crop}`);
    await loadImages();
  }

  const noteImages = (noteId: number) =>
    images.filter((img) => img.note_id === noteId);

  if (!validPlant) {
    return (
      <div className="page-container animate-rise">
        <div className="glass-card max-w-lg mx-auto text-center">
          <p className="font-display text-2xl text-gold mb-2">Invalid plant</p>
          <p className="text-sm text-gold-muted mb-4">
            Plant numbers start at 1.
          </p>
          <button type="button" className="glass-btn gold-btn" onClick={() => navigate(mapPath)}>
            Back to plant map
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container animate-rise">
      <header className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <button type="button" className="glass-btn" onClick={() => navigate(mapPath)}>
          ← Map
        </button>
        <div className="text-center flex-1">
          <p className="eyebrow">{crop}</p>
          <h1 className="font-display text-3xl md:text-4xl text-gold glow-text">
            Plant {plantNumber}
          </h1>
          <div className="mt-3 flex justify-center">
            <span
              className={`todo-ripple ${openTodoCount === 0 ? "todo-ripple--quiet" : ""}`}
              title={
                openTodoCount === 0
                  ? "No open todos"
                  : `${openTodoCount} open todo${openTodoCount === 1 ? "" : "s"}`
              }
            >
              <span className="todo-ripple__icon" aria-hidden>
                ✓
              </span>
              <span className="todo-ripple__count">{openTodoCount}</span>
              <span>todos</span>
            </span>
          </div>
        </div>
        <SoundToggle />
      </header>

      <section className="glass-card max-w-3xl mx-auto mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <p className="eyebrow">Media</p>
            <h2 className="font-display text-xl text-gold">Plant photos</h2>
            <p className="text-sm text-gold-muted mt-1">
              Field shots for this plant only — not mixed with the crop gallery.
            </p>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={uploadGalleryImage}
        />

        {isAdmin && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="w-full mb-4 rounded-2xl border-2 border-dashed border-[var(--gold-dim)]/70
                       bg-[rgba(212,175,55,0.06)] hover:bg-[rgba(212,175,55,0.12)]
                       transition px-4 py-8 text-center cursor-pointer"
          >
            <p className="font-display text-2xl text-gold mb-1">
              {uploading ? "Uploading…" : "Insert image"}
            </p>
            <p className="text-sm text-gold-muted">
              Tap to choose a photo of this plant
            </p>
          </button>
        )}

        {images.length === 0 && (
          <p className="text-gold-muted text-sm text-center pb-2">
            No photos yet for plant {plantNumber}.
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img) => (
            <div
              key={img.id}
              className="group relative aspect-square overflow-hidden rounded-xl border border-[var(--glass-border)] bg-black/40"
            >
              <button
                type="button"
                className="absolute inset-0 w-full h-full"
                onClick={() => setLightbox(img)}
                aria-label="View image"
              >
                <img
                  src={img.image_data}
                  alt=""
                  className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                />
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/75 text-red-300 text-sm
                             hover:bg-black/90 hover:text-red-200 border border-white/10"
                  onClick={() => setImageToDelete(img.id)}
                  aria-label="Delete image"
                >
                  X
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {isAdmin && (
        <form
          onSubmit={addNote}
          className="glass-card max-w-3xl mx-auto mb-6 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl text-gold">
              Add {entryType === "todo" ? "todo" : "note"}
            </h2>
            <div className="entry-type-toggle" role="tablist" aria-label="Notes or todos">
              <button
                type="button"
                role="tab"
                aria-selected={entryType === "note"}
                className={entryType === "note" ? "is-active" : ""}
                onClick={() => setEntryType("note")}
              >
                Note
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={entryType === "todo"}
                className={entryType === "todo" ? "is-active is-todo" : ""}
                onClick={() => setEntryType("todo")}
              >
                Todo
              </button>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <textarea
            className="glass-input min-h-[120px] resize-y"
            placeholder={
              entryType === "todo"
                ? `Task for plant ${plantNumber}…`
                : `Observation on plant ${plantNumber}…`
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="glass-btn gold-btn cursor-pointer inline-flex items-center gap-2">
              Attach image
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void onPickFile(e.target.files?.[0] || null);
                  e.target.value = "";
                }}
              />
            </label>
            {pendingImage && (
              <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-[var(--glass-border)]">
                <img src={pendingImage} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-red-300 text-xs"
                  onClick={() => setPendingImage(null)}
                >
                  ✕
                </button>
              </div>
            )}
            <button
              className="glass-btn gold-btn ml-auto"
              disabled={loading || (!text.trim() && !pendingImage)}
            >
              {loading
                ? "Saving…"
                : entryType === "todo"
                  ? "Save todo"
                  : "Save note"}
            </button>
          </div>
        </form>
      )}

      {!isAdmin && (
        <div className="max-w-3xl mx-auto mb-4 flex justify-end">
          <div className="entry-type-toggle" role="tablist" aria-label="Notes or todos">
            <button
              type="button"
              role="tab"
              aria-selected={entryType === "note"}
              className={entryType === "note" ? "is-active" : ""}
              onClick={() => setEntryType("note")}
            >
              Note
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={entryType === "todo"}
              className={entryType === "todo" ? "is-active is-todo" : ""}
              onClick={() => setEntryType("todo")}
            >
              Todo
            </button>
          </div>
        </div>
      )}

      {!isAdmin && error && (
        <p className="text-red-400 text-sm text-center mb-4">{error}</p>
      )}

      <div className="max-w-3xl mx-auto space-y-3">
        {filteredNotes.length === 0 && (
          <div className="glass-panel text-center text-gold-muted py-10">
            {entryType === "todo"
              ? `No todos yet for plant ${plantNumber}`
              : `No notes yet for plant ${plantNumber}`}
          </div>
        )}
        {filteredNotes.map((n, i) => {
          const type: EntryType = n.entry_type === "todo" ? "todo" : "note";
          const done = type === "todo" && !!Number(n.completed);
          return (
            <article
              key={n.id}
              className={`glass-card relative animate-rise ${done ? "note-todo-done" : ""}`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {isAdmin && (
                <button
                  type="button"
                  className="absolute top-4 right-4 text-red-400/80 hover:text-red-300"
                  onClick={() => setNoteToDelete(n.id)}
                  aria-label="Delete entry"
                >
                  X
                </button>
              )}
              <div className={`flex flex-wrap items-center gap-2 mb-2 ${isAdmin ? "pr-8" : ""}`}>
                <span
                  className={`entry-type-badge ${
                    done
                      ? "entry-type-badge--done"
                      : type === "todo"
                        ? "entry-type-badge--todo"
                        : "entry-type-badge--note"
                  }`}
                >
                  {done ? "Done" : type === "todo" ? "Todo" : "Note"}
                </span>
                <p className="text-sm text-gold-muted">
                  {new Date(n.created_at).toLocaleString()}
                </p>
                {type === "todo" && isAdmin && (
                  <button
                    type="button"
                    className="glass-btn text-xs py-1 px-2 ml-auto mr-6"
                    onClick={() => void toggleTodo(n.id, !done)}
                  >
                    {done ? "Reopen" : "Mark done"}
                  </button>
                )}
              </div>
              <p className="note-body whitespace-pre-wrap leading-relaxed pr-6">
                {n.note}
              </p>
              {noteImages(n.id).length > 0 && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {noteImages(n.id).map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      className="aspect-video rounded-lg overflow-hidden border border-[var(--glass-border)]"
                      onClick={() => setLightbox(img)}
                    >
                      <img
                        src={img.image_data}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <ConfirmModal
        open={noteToDelete != null}
        title="Delete entry?"
        message="This note or todo will be removed permanently."
        confirmLabel="Delete"
        onCancel={() => setNoteToDelete(null)}
        onConfirm={() => {
          if (noteToDelete != null) void removeNote(noteToDelete);
        }}
      />

      <ConfirmModal
        open={imageToDelete != null}
        title="Delete image?"
        message="This photo will be removed permanently."
        confirmLabel="Delete"
        onCancel={() => setImageToDelete(null)}
        onConfirm={() => {
          if (imageToDelete != null) void removeImage(imageToDelete);
        }}
      />

      {lightbox && (
        <div
          className="confirm-overlay"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-3xl max-h-[85dvh] flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightbox.image_data}
              alt=""
              className="w-full max-h-[75dvh] object-contain rounded-2xl border border-[var(--glass-border)] shadow-[0_0_40px_rgba(212,175,55,0.15)] bg-black/80"
            />
            <div className="flex flex-wrap justify-between gap-2">
              <p className="text-sm text-gold-muted self-center">
                {new Date(lightbox.created_at).toLocaleString()}
              </p>
              <div className="flex gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    className="glass-btn text-red-300"
                    onClick={() => setImageToDelete(lightbox.id)}
                  >
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  className="glass-btn gold-btn"
                  onClick={() => setLightbox(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
