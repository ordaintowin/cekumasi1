import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, CameraOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type FeedbackType = "success" | "duplicate" | "error" | null;

interface CameraQRScannerProps {
  onScan: (value: string) => Promise<"success" | "duplicate" | "error">;
  active: boolean;
}

function playBeep(type: "success" | "duplicate" | "error") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "success") {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === "duplicate") {
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } else {
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.setValueAtTime(180, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    }

    osc.onended = () => ctx.close();
  } catch {}
}

function triggerVibration(type: "success" | "duplicate" | "error") {
  if (!navigator.vibrate) return;
  if (type === "success") {
    navigator.vibrate([80, 40, 80]);
  } else if (type === "duplicate") {
    navigator.vibrate([60]);
  } else {
    navigator.vibrate([40, 30, 40, 30, 40]);
  }
}

export function CameraQRScanner({ onScan, active }: CameraQRScannerProps) {
  const containerId = "qr-camera-container";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [state, setState] = useState<"idle" | "starting" | "running" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [camIndex, setCamIndex] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackType>(null);
  const startedRef = useRef(false);
  const processingRef = useRef(false);

  const handleScan = useCallback(async (decodedText: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      const result = await onScan(decodedText.trim());
      playBeep(result);
      triggerVibration(result);
      setFeedback(result);
      setTimeout(() => {
        setFeedback(null);
        processingRef.current = false;
      }, 1500);
    } catch {
      processingRef.current = false;
    }
  }, [onScan]);

  async function startScanner(cameraId?: string) {
    if (startedRef.current) return;
    setState("starting");
    setErrorMsg("");

    try {
      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) {
        setState("error");
        setErrorMsg("No camera found on this device.");
        return;
      }
      setCameras(devices);

      let targetId = cameraId;
      if (!targetId) {
        const backCamera = devices.find(d =>
          /back|rear|environment/i.test(d.label)
        );
        targetId = backCamera?.id ?? devices[devices.length - 1]?.id ?? devices[0].id;
        setCamIndex(devices.indexOf(backCamera ?? devices[devices.length - 1]));
      }

      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(containerId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
      }

      await scannerRef.current.start(
        cameraId ? { deviceId: { exact: cameraId } } : { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 },
        handleScan,
        () => {}
      );

      startedRef.current = true;
      setState("running");
    } catch (err: any) {
      setState("error");
      const msg = err?.message ?? String(err);
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed")) {
        setErrorMsg("Camera permission denied. Please allow camera access and try again.");
      } else {
        setErrorMsg(msg || "Failed to start camera.");
      }
    }
  }

  async function stopScanner() {
    if (scannerRef.current && startedRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      startedRef.current = false;
    }
    setState("idle");
  }

  async function switchCamera() {
    await stopScanner();
    const next = (camIndex + 1) % Math.max(cameras.length, 1);
    setCamIndex(next);
    setTimeout(() => startScanner(cameras[next]?.id), 200);
  }

  useEffect(() => {
    if (active) {
      startScanner();
    } else {
      stopScanner();
    }
    return () => { stopScanner(); };
  }, [active]);

  const flashColor =
    feedback === "success" ? "bg-green-500/40" :
    feedback === "duplicate" ? "bg-yellow-400/40" :
    feedback === "error" ? "bg-red-500/40" : "";

  const frameColor =
    feedback === "success" ? "border-green-400" :
    feedback === "duplicate" ? "border-yellow-400" :
    feedback === "error" ? "border-red-400" :
    "border-purple-400";

  return (
    <div className="space-y-3">
      <div
        className="relative bg-black rounded-xl overflow-hidden"
        style={{ aspectRatio: "1/1", maxWidth: 320, margin: "0 auto" }}
      >
        <div id={containerId} className="w-full h-full" />

        {feedback && (
          <div className={`absolute inset-0 pointer-events-none rounded-xl transition-opacity duration-300 ${flashColor}`} />
        )}

        {state === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900">
            <Camera className="w-12 h-12 text-gray-400" />
            <p className="text-gray-400 text-sm">Camera not started</p>
            <Button size="sm" onClick={() => startScanner()} className="bg-purple-600 hover:bg-purple-700 text-white">
              Start Camera
            </Button>
          </div>
        )}

        {state === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900">
            <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-300 text-sm">Starting camera...</p>
          </div>
        )}

        {state === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900 px-6 text-center">
            <CameraOff className="w-12 h-12 text-red-400" />
            <p className="text-red-300 text-sm leading-snug">{errorMsg}</p>
            <Button size="sm" onClick={() => startScanner()} className="bg-purple-600 hover:bg-purple-700 text-white">
              Retry
            </Button>
          </div>
        )}

        {state === "running" && (
          <>
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className={`w-48 h-48 border-2 rounded-lg opacity-90 relative transition-colors duration-200 ${frameColor}`}>
                <div className={`absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 rounded-tl transition-colors duration-200 ${frameColor}`} />
                <div className={`absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 rounded-tr transition-colors duration-200 ${frameColor}`} />
                <div className={`absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 rounded-bl transition-colors duration-200 ${frameColor}`} />
                <div className={`absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 rounded-br transition-colors duration-200 ${frameColor}`} />
              </div>
            </div>
            {!feedback && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-400 opacity-70 animate-scan-line" />
            )}

            {feedback && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                <span className={`text-sm font-bold px-4 py-1.5 rounded-full shadow-lg ${
                  feedback === "success" ? "bg-green-500 text-white" :
                  feedback === "duplicate" ? "bg-yellow-400 text-yellow-900" :
                  "bg-red-500 text-white"
                }`}>
                  {feedback === "success" ? "✓ Registered!" :
                   feedback === "duplicate" ? "Already registered" :
                   "✗ Not found"}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {state === "running" && cameras.length > 1 && (
        <Button size="sm" variant="outline" onClick={switchCamera} className="w-full flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Switch Camera
        </Button>
      )}

      {state === "running" && !feedback && (
        <p className="text-center text-xs text-gray-400">
          Hold the QR code steady inside the frame
        </p>
      )}
    </div>
  );
}
