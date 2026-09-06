export const NUTRILEAF_GA4_MEASUREMENT_ID = "G-8V7YT8ELZ2";

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

export function initializeGa4({ runtime = globalThis.window, documentRef = globalThis.document } = {}) {
  if (!runtime || !documentRef || !MEASUREMENT_ID_PATTERN.test(NUTRILEAF_GA4_MEASUREMENT_ID)) return false;

  runtime.NUTRILEAF_GA4_MEASUREMENT_ID = NUTRILEAF_GA4_MEASUREMENT_ID;
  runtime.dataLayer = runtime.dataLayer || [];
  if (typeof runtime.gtag !== "function") {
    runtime.gtag = function gtag() { runtime.dataLayer.push(arguments); };
  }

  runtime.gtag("js", new Date());
  runtime.gtag("config", NUTRILEAF_GA4_MEASUREMENT_ID);

  if (!documentRef.querySelector("script[data-nutrileaf-ga4]")) {
    const script = documentRef.createElement("script");
    script.async = true;
    script.dataset.nutrileafGa4 = "1";
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(NUTRILEAF_GA4_MEASUREMENT_ID)}`;
    documentRef.head.appendChild(script);
  }
  return true;
}

if (typeof globalThis.window === "object" && typeof globalThis.document === "object") {
  initializeGa4();
}
