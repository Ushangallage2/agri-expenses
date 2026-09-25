const CSS_HREF = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const JS_SRC = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

export type LeafletNS = any;

let loading: Promise<LeafletNS> | null = null;

export function loadLeaflet(): Promise<LeafletNS> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Leaflet needs a browser"));
  }
  const existing = (window as any).L;
  if (existing?.map) return Promise.resolve(existing);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${CSS_HREF}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = CSS_HREF;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = JS_SRC;
    script.async = true;
    script.onload = () => {
      const L = (window as any).L;
      if (!L?.map) {
        reject(new Error("Leaflet failed to load"));
        return;
      }
      resolve(L);
    };
    script.onerror = () => reject(new Error("Could not load map library"));
    document.head.appendChild(script);
  });

  return loading;
}
