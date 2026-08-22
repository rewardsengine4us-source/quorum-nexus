"use client";

import { useEffect, useRef, useState } from "react";
import RequireEntered from "@/components/RequireEntered";
import NavBar from "@/components/NavBar";

interface PortalBoost {
  name: string;
  rate: number | null;
  multiplier: number | null;
  verified: boolean;
  notes: string | null;
}

interface CardHit {
  cardId: number;
  cardName: string;
  bankName: string;
  rate: number;
  isAccelerated: boolean;
  notes: string | null;
  portal: PortalBoost | null;
}

interface Resolution {
  mcc: string | null;
  category: string | null;
  description: string | null;
  merchantName: string | null;
  source: string;
  explanation: string;
}

interface Parsed {
  vpa: string | null;
  payeeName: string | null;
  amount: string | null;
  mccInQr: string | null;
}

const SOURCE_LABEL: Record<string, string> = {
  qr_mcc: "read from QR",
  merchant_name: "matched on merchant name",
  vpa_handle: "matched on UPI address",
  unresolved: "not identified",
};

const SAMPLES = [
  {
    label: "Zepto (Paytm QR, no MCC)",
    value: "upi://pay?pa=paytmqr2810@paytm&pn=Zepto",
  },
  {
    label: "Local store (PhonePe, MCC 0000)",
    value: "upi://pay?pa=merchant9932@ybl&pn=Sharma%20General%20Store&mc=0000",
  },
  {
    label: "Supermarket (proper MCC)",
    value: "upi://pay?pa=store@hdfcbank&pn=DMart&mc=5411&am=1450",
  },
  {
    label: "Swiggy (VPA only)",
    value: "swiggy@icici",
  },
];

export default function ScanPage() {
  return (
    <RequireEntered>
      <NavBar />
      <ScanBody />
    </RequireEntered>
  );
}

function ScanBody() {
  const [qr, setQr] = useState("");
  const [scope, setScope] = useState<"mine" | "all">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [cards, setCards] = useState<CardHit[]>([]);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [scanEngine, setScanEngine] = useState<"native" | "jsqr" | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const jsQrRef = useRef<any>(null);

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // jsQR is loaded from a CDN on first use rather than bundled, so browsers
  // that DO have the native BarcodeDetector (Chrome/Edge/Android) never pay
  // for it. Safari and Firefox have no BarcodeDetector at all, so without
  // this fallback camera scanning simply doesn't work there.
  function loadJsQr(): Promise<any> {
    return new Promise((resolvePromise, rejectPromise) => {
      if (jsQrRef.current) return resolvePromise(jsQrRef.current);
      if ((window as any).jsQR) {
        jsQrRef.current = (window as any).jsQR;
        return resolvePromise(jsQrRef.current);
      }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.js";
      script.async = true;
      script.onload = () => {
        jsQrRef.current = (window as any).jsQR;
        if (jsQrRef.current) resolvePromise(jsQrRef.current);
        else rejectPromise(new Error("QR library failed to initialize"));
      };
      script.onerror = () => rejectPromise(new Error("Could not load QR library"));
      document.head.appendChild(script);
    });
  }

  function stopCamera() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function startCamera() {
    setError(null);
    setCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setCameraOn(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const hasNative = typeof window !== "undefined" && "BarcodeDetector" in window;

      if (hasNative) {
        setScanEngine("native");
        const Detector = (window as any).BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });

        const tick = async () => {
          if (!streamRef.current || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes?.length) {
              const value = codes[0].rawValue as string;
              setQr(value);
              stopCamera();
              void resolve(value);
              return;
            }
          } catch {
            // Detection can throw on a frame that isn't ready yet; keep going.
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Fallback path: decode frames ourselves via jsQR on an offscreen
        // canvas. Slower than native detection but works in every browser
        // that can open a camera at all.
        const jsQR = await loadJsQr();
        setScanEngine("jsqr");
        const canvas = canvasRef.current ?? document.createElement("canvas");
        canvasRef.current = canvas;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        const tick = () => {
          const video = videoRef.current;
          if (!streamRef.current || !video || !ctx) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(frame.data, frame.width, frame.height, {
              inversionAttempts: "dontInvert",
            });
            if (code?.data) {
              setQr(code.data);
              stopCamera();
              void resolve(code.data);
              return;
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }
    } catch (e: any) {
      setError(
        e?.name === "NotAllowedError"
          ? "Camera permission was denied. You can paste the QR text instead."
          : `Could not start the camera: ${e.message}`
      );
      stopCamera();
    } finally {
      setCameraStarting(false);
    }
  }

  async function resolve(value?: string) {
    const payload = value ?? qr;
    if (!payload.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scan/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr: payload, scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read that QR");
      setParsed(data.parsed);
      setResolution(data.resolution);
      setCards(data.cards || []);
    } catch (e: any) {
      setError(e.message ?? "Could not read that QR");
      setParsed(null);
      setResolution(null);
      setCards([]);
    } finally {
      setLoading(false);
    }
  }

  const best = cards[0];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-50">Scan to Pay</h1>
      <p className="mt-1 text-sm text-slate-500">
        Scan a merchant&rsquo;s UPI QR to see which of your cards earns most
        there.
      </p>

      <div className="card-surface mt-6 rounded-xl p-5">
        <div className="flex flex-wrap items-center gap-2">
          {!cameraOn && (
            <button
              onClick={startCamera}
              disabled={cameraStarting}
              className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-40"
            >
              {cameraStarting ? "Starting camera…" : "Scan with camera"}
            </button>
          )}
          {cameraOn && (
            <button
              onClick={stopCamera}
              className="rounded-md border border-base-700 px-4 py-2 text-sm text-slate-300"
            >
              Stop camera
            </button>
          )}
          {cameraOn && scanEngine && (
            <span className="text-xs text-slate-600">
              {scanEngine === "native" ? "native scanner" : "compatibility scanner"}
            </span>
          )}
          <div className="flex overflow-hidden rounded-md border border-base-700 text-xs">
            <button
              onClick={() => setScope("all")}
              className={`px-3 py-2 ${scope === "all" ? "bg-accent-500 text-base-950" : "text-slate-300"}`}
            >
              All cards
            </button>
            <button
              onClick={() => setScope("mine")}
              className={`px-3 py-2 ${scope === "mine" ? "bg-accent-500 text-base-950" : "text-slate-300"}`}
            >
              My cards
            </button>
          </div>
        </div>

        {cameraOn && (
          <video
            ref={videoRef}
            playsInline
            muted
            className="mt-4 w-full max-w-sm rounded-lg border border-base-700"
          />
        )}

        <div className="mt-4">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">
            Or paste the QR contents
          </span>
          <div className="flex gap-2">
            <input
              value={qr}
              onChange={(e) => setQr(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && resolve()}
              placeholder="upi://pay?pa=merchant@bank&pn=Merchant"
              className="w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 font-mono text-xs text-slate-100 focus:border-accent-500 focus:outline-none"
            />
            <button
              onClick={() => resolve()}
              disabled={loading || !qr.trim()}
              className="shrink-0 rounded-md bg-accent-500 px-5 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-40"
            >
              {loading ? "…" : "Check"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              onClick={() => {
                setQr(s.value);
                void resolve(s.value);
              }}
              className="rounded-md border border-base-700 px-2.5 py-1 text-xs text-slate-500 hover:text-slate-200"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {resolution && (
        <section className="mt-6">
          <div className="card-surface rounded-xl p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="text-lg font-medium text-slate-100">
                  {resolution.merchantName ?? parsed?.payeeName ?? "Unknown merchant"}
                </div>
                <div className="mt-0.5 font-mono text-xs text-slate-500">
                  {parsed?.vpa}
                  {parsed?.amount ? ` · ₹${parsed.amount}` : ""}
                </div>
              </div>
              <span
                className={`pill text-xs ${
                  resolution.source === "qr_mcc"
                    ? "border border-emerald-900 bg-emerald-950 text-emerald-300"
                    : resolution.source === "unresolved"
                    ? "border border-amber-900 bg-amber-950 text-amber-300"
                    : "border border-base-600 bg-base-700 text-slate-300"
                }`}
              >
                {SOURCE_LABEL[resolution.source] ?? resolution.source}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {resolution.category && (
                <span className="pill border border-base-600 bg-base-700 text-slate-300">
                  {resolution.category}
                </span>
              )}
              {resolution.mcc && (
                <span className="pill border border-base-600 bg-base-700 font-mono text-slate-400">
                  MCC {resolution.mcc}
                </span>
              )}
              {resolution.description && (
                <span className="text-slate-500">{resolution.description}</span>
              )}
            </div>

            <p className="mt-3 border-t border-base-700 pt-3 text-xs text-slate-500">
              {resolution.explanation}
            </p>
          </div>
        </section>
      )}

      {best && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-medium text-slate-100">Use this card</h2>
          <div className="card-surface rounded-xl border-l-2 border-l-accent-500 p-5">
            <div className="text-xs text-slate-500">{best.bankName}</div>
            <div className="text-lg font-medium text-slate-100">{best.cardName}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-accent-400">
                {best.rate}× per ₹100
              </span>
              {best.isAccelerated && (
                <span className="pill border border-emerald-900 bg-emerald-950 text-xs text-emerald-300">
                  accelerated category
                </span>
              )}
            </div>
            {best.notes && (
              <p className="mt-2 text-xs text-slate-500">{best.notes}</p>
            )}

            {best.portal && (
              <div className="mt-3 rounded-md border border-gold-400/30 bg-base-800/60 p-3">
                <div className="text-xs font-medium text-gold-400">
                  {best.portal.rate != null
                    ? `${best.portal.rate}× per ₹100 via ${best.portal.name}`
                    : `${best.portal.name} partner`}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {best.portal.verified
                    ? "Tapping the card here earns the rate above. Routing the same purchase through the portal earns this instead."
                    : "This merchant is a listed portal partner, but we haven't confirmed the multiplier — check the portal before assuming a higher rate."}
                  {best.portal.notes ? ` ${best.portal.notes}` : ""}
                </p>
              </div>
            )}
          </div>

          {cards.length > 1 && (
            <div className="mt-4 overflow-hidden rounded-xl border border-base-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-base-800 text-slate-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Card</th>
                    <th className="px-4 py-2 text-right font-medium">Rate</th>
                    <th className="px-4 py-2 font-medium">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.slice(1).map((c) => (
                    <tr key={c.cardId} className="border-t border-base-700/60">
                      <td className="px-4 py-2">
                        <div className="text-slate-200">{c.cardName}</div>
                        <div className="text-xs text-slate-500">{c.bankName}</div>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-slate-300">
                        {c.rate}×
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {c.isAccelerated ? "accelerated" : "base rate"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {resolution && !best && resolution.category && (
        <div className="card-surface mt-6 rounded-xl p-6 text-center text-sm text-slate-500">
          No earning rates recorded for {resolution.category} yet.
        </div>
      )}
    </main>
  );
}
