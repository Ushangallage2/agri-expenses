import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../utils/AuthContext";

const HERO_CLIPS = [
  { src: "/media/hero-1.mp4", poster: "/media/hero-1.jpg", label: "Clip 1" },
  { src: "/media/hero-2.mp4", poster: "/media/hero-2.jpg", label: "Clip 2" },
  { src: "/media/hero-3.mp4", poster: "/media/hero-3.jpg", label: "Clip 3" },
  { src: "/media/hero-4.mp4", poster: "/media/hero-4.jpg", label: "Clip 4" },
] as const;

export default function Landing() {
  const { user, loading } = useAuth();
  const enterTo = !loading && user ? "/dashboard" : "/login";
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [heroReady, setHeroReady] = useState(false);
  const cropsRef = useRef<HTMLElement>(null);
  const ledgerRef = useRef<HTMLElement>(null);
  const [cropsIn, setCropsIn] = useState(false);
  const [ledgerIn, setLedgerIn] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setHeroReady(true), 80);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (e.target === cropsRef.current) setCropsIn(true);
          if (e.target === ledgerRef.current) setLedgerIn(true);
        }
      },
      { threshold: 0.18 }
    );
    if (cropsRef.current) io.observe(cropsRef.current);
    if (ledgerRef.current) io.observe(ledgerRef.current);
    return () => io.disconnect();
  }, []);

  // Play active clip; pause others. Advance on ended.
  useEffect(() => {
    const videos = videoRefs.current;
    videos.forEach((v, i) => {
      if (!v) return;
      if (i === active) {
        v.currentTime = 0;
        void v.play().catch(() => {
          /* autoplay blocked */
        });
      } else {
        v.pause();
      }
    });

    const current = videos[active];
    if (!current) return;

    const onEnded = () => {
      setActive((i) => (i + 1) % HERO_CLIPS.length);
    };
    current.addEventListener("ended", onEnded);
    return () => current.removeEventListener("ended", onEnded);
  }, [active]);

  function pickClip(index: number) {
    if (index === active) {
      const v = videoRefs.current[index];
      if (v) {
        v.currentTime = 0;
        void v.play().catch(() => undefined);
      }
      return;
    }
    setActive(index);
  }

  return (
    <div className="landing-root">
      <header className="landing-top">
        <Link to="/" className="landing-top-brand">
          Agri Ledger
        </Link>
        <Link to={enterTo} className="landing-top-link">
          {user ? "Open ledger" : "Sign in"}
        </Link>
      </header>

      <section className="landing-hero" aria-label="Agri Ledger">
        <div className="landing-hero-media" aria-hidden>
          {HERO_CLIPS.map((clip, i) => (
            <video
              key={clip.src}
              ref={(el) => {
                videoRefs.current[i] = el;
              }}
              className={`landing-hero-video${i === active && heroReady ? " is-active" : ""}`}
              src={clip.src}
              poster={clip.poster}
              muted
              playsInline
              preload={i === active || i === (active + 1) % HERO_CLIPS.length ? "auto" : "metadata"}
            />
          ))}
          <div className="landing-hero-vignette" />
        </div>

        <div
          className={`landing-hero-copy${heroReady ? " is-ready" : ""}`}
        >
          <p className="landing-brand">Agri Ledger</p>
          <h1 className="landing-headline">
            The field, counted clearly.
          </h1>
          <p className="landing-support">
            Private crop finance, fertilizer, and stock — one quiet place
            for pepper, turmeric, and everything between.
          </p>
          <div className="landing-cta-row">
            <Link to={enterTo} className="landing-cta-primary">
              Enter the ledger
            </Link>
            <Link to="/login" className="landing-cta-secondary">
              Sign in
            </Link>
          </div>
        </div>

        <div
          className={`landing-hero-dots${heroReady ? " is-ready" : ""}`}
          role="tablist"
          aria-label="Hero videos"
        >
          {HERO_CLIPS.map((clip, i) => (
            <button
              key={clip.src}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={clip.label}
              className={`landing-hero-dot${i === active ? " is-active" : ""}`}
              onClick={() => pickClip(i)}
            />
          ))}
        </div>
      </section>

      <section
        ref={cropsRef}
        className={`landing-crops${cropsIn ? " is-in" : ""}`}
        aria-label="Crops"
      >
        <div className="landing-crops-copy">
          <p className="landing-section-eyebrow">Crops</p>
          <h2 className="landing-section-title">Pepper & turmeric</h2>
          <p className="landing-section-support">
            Grown with care. Tracked without noise.
          </p>
        </div>
        <div className="landing-crops-split">
          <figure className="landing-crop-panel">
            <img
              src="/media/pepper.jpg"
              alt="Black peppercorns"
              loading="lazy"
            />
            <figcaption>Pepper</figcaption>
          </figure>
          <figure className="landing-crop-panel">
            <img
              src="/media/turmeric.jpg"
              alt="Fresh turmeric root, dried fingers, and powder"
              loading="lazy"
            />
            <figcaption>Turmeric</figcaption>
          </figure>
        </div>
      </section>

      <section
        ref={ledgerRef}
        className={`landing-ledger${ledgerIn ? " is-in" : ""}`}
        aria-label="The ledger"
      >
        <p className="landing-section-eyebrow">The ledger</p>
        <h2 className="landing-section-title">
          Income, expenses, fertilizer — kept clear.
        </h2>
        <p className="landing-section-support landing-ledger-support">
          Sign in to manage seasons, stock, and the week-by-week plan for
          your fields.
        </p>
        <Link to={enterTo} className="landing-cta-primary">
          Enter the ledger
        </Link>
      </section>

      <footer className="landing-foot">
        <span>Agri Ledger</span>
        <span className="landing-foot-sep" aria-hidden>
          ·
        </span>
        <Link to={enterTo}>Management</Link>
      </footer>
    </div>
  );
}
