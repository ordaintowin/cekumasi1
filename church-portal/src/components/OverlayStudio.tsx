import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Layers, Eye, EyeOff, X, Upload, Loader2, ImagePlus } from "lucide-react";

export interface OverlayImage {
  id: string;
  src: string;      // base64 data URL
  name: string;     // filename
  x: number;        // 0-100, % of container width
  y: number;        // 0-100, % of container height
  size: number;     // 5-150, % of container width (>100 = oversized/fills screen)
  opacity: number;  // 0.0-1.0
  visible: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: number;
  onPushed?: () => void;
}

const MAX_IMAGES = 3;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function storageKey(videoId: number) {
  return `overlay_studio_v${videoId}`;
}

function saveToStorage(videoId: number, images: OverlayImage[]) {
  try {
    localStorage.setItem(storageKey(videoId), JSON.stringify(images));
  } catch {
    // localStorage quota exceeded — silently ignore
  }
}

function loadFromStorage(videoId: number): OverlayImage[] {
  try {
    const raw = localStorage.getItem(storageKey(videoId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as OverlayImage[];
  } catch { /* ignore parse errors */ }
  return [];
}

export default function OverlayStudio({ open, onOpenChange, videoId, onPushed }: Props) {
  const [images, setImages] = useState<OverlayImage[]>(() => loadFromStorage(videoId));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string; startX: number; startY: number; imgX: number; imgY: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceSlotRef = useRef<number | null>(null);

  // ── Persist images to localStorage whenever they change ──────────────────
  useEffect(() => {
    saveToStorage(videoId, images);
  }, [videoId, images]);

  // ── When videoId changes, load that video's saved state ──────────────────
  useEffect(() => {
    const saved = loadFromStorage(videoId);
    setImages(saved);
    setSelectedId(null);
    setError(null);
  }, [videoId]);

  // ── helpers ───────────────────────────────────────────────────────────────
  const updateImage = useCallback((id: string, patch: Partial<OverlayImage>) => {
    setImages(prev => prev.map(img => img.id === id ? { ...img, ...patch } : img));
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages(prev => prev.filter(i => i.id !== id));
    setSelectedId(prev => prev === id ? null : prev);
  }, []);

  // ── file upload ───────────────────────────────────────────────────────────
  const triggerUpload = (slotIdx: number | null) => {
    if (slotIdx === null && images.length >= MAX_IMAGES) return;
    replaceSlotRef.current = slotIdx;
    fileInputRef.current?.click();
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed (PNG, JPG, SVG…).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`"${file.name}" is too large — max 2 MB per image.`);
      return;
    }

    const slotIdx = replaceSlotRef.current;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      setImages(prev => {
        // Replace an existing slot
        if (slotIdx !== null && slotIdx < prev.length) {
          return prev.map((img, i) =>
            i === slotIdx ? { ...img, src, name: file.name } : img,
          );
        }
        // Append new slot
        if (prev.length >= MAX_IMAGES) return prev;
        const newImg: OverlayImage = {
          id: uid(), src, name: file.name,
          x: 50, y: 50, size: 25, opacity: 1, visible: true,
        };
        setSelectedId(newImg.id);
        return [...prev, newImg];
      });
    };
    reader.readAsDataURL(file);
  }, []);

  // ── drag to reposition on preview canvas ──────────────────────────────────
  const startDrag = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const img = images.find(i => i.id === id);
    if (!img) return;
    setSelectedId(id);
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, imgX: img.x, imgY: img.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const dx = ((ev.clientX - dragRef.current.startX) / rect.width) * 100;
      const dy = ((ev.clientY - dragRef.current.startY) / rect.height) * 100;
      const newX = Math.max(0, Math.min(100, dragRef.current.imgX + dx));
      const newY = Math.max(0, Math.min(100, dragRef.current.imgY + dy));
      setImages(prev =>
        prev.map(img => img.id === dragRef.current!.id ? { ...img, x: newX, y: newY } : img),
      );
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [images]);

  // ── push live ─────────────────────────────────────────────────────────────
  const pushLive = async () => {
    setPushing(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/videos/${videoId}/overlay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ images, active: true }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to push overlay");
      }
      onPushed?.();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPushing(false);
    }
  };

  const clearOverlay = async () => {
    const token = localStorage.getItem("token");
    await fetch(`/api/videos/${videoId}/overlay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ images: [], active: false }),
    }).catch(() => {});
    setImages([]);
    setSelectedId(null);
    setError(null);
    onPushed?.();
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden flex flex-col"
        style={{ maxWidth: "min(640px, 96vw)", width: "100%" }}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <span className="w-6 h-6 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Layers className="w-3.5 h-3.5 text-purple-600" />
            </span>
            Live Overlay Studio
          </DialogTitle>
          <p className="text-[11px] text-gray-400 mt-0.5 pl-8">
            Upload up to 3 images · position them on the preview · push live · your images are saved between refreshes
          </p>
        </DialogHeader>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        {/* Fixed height: dialog does NOT grow with image additions */}
        <div className="flex flex-col sm:flex-row flex-1" style={{ height: "clamp(300px, 44vh, 380px)" }}>

          {/* ── Left: Preview canvas ─────────────────────────────────── */}
          <div
            className="bg-gray-950 flex flex-col items-center justify-center flex-shrink-0 relative"
            style={{ width: "min(100%, 300px)" }}
          >
            {/* 16:9 preview — overflow-hidden clips images larger than canvas */}
            <div
              ref={canvasRef}
              className="relative w-full overflow-hidden select-none"
              style={{ aspectRatio: "16/9", touchAction: "none", cursor: "default" }}
            >
              {/* Subtle grid */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px)",
                  backgroundSize: "25% 25%",
                }}
              />

              {/* Draggable overlay images */}
              {images.filter(i => i.visible).map(img => (
                <div
                  key={img.id}
                  onMouseDown={e => startDrag(e, img.id)}
                  className={`absolute transition-none ${selectedId === img.id ? "outline outline-2 outline-offset-1 outline-purple-400" : ""}`}
                  style={{
                    left: `${img.x}%`,
                    top: `${img.y}%`,
                    width: `${img.size}%`,
                    transform: "translate(-50%, -50%)",
                    opacity: img.opacity,
                    cursor: "grab",
                  }}
                  title="Drag to reposition"
                >
                  <img
                    src={img.src}
                    alt={img.name}
                    className="w-full h-auto block"
                    draggable={false}
                    style={{ pointerEvents: "none" }}
                  />
                </div>
              ))}

              {/* Empty state */}
              {images.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 pointer-events-none">
                  <ImagePlus className="w-7 h-7 mb-1.5 opacity-30" />
                  <p className="text-[10px] opacity-50 text-center px-4">
                    Upload images to see a live preview
                  </p>
                </div>
              )}
            </div>

            {/* Hint */}
            <p className="absolute bottom-1 left-0 right-0 text-center text-[9px] text-gray-500 pointer-events-none">
              ↔ Drag images to reposition
            </p>
          </div>

          {/* ── Right: Image slots + controls ─────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col border-t sm:border-t-0 sm:border-l border-gray-100 overflow-hidden bg-white">

            {/* Panel title */}
            <div className="px-3.5 pt-2.5 pb-2 border-b border-gray-100 flex-shrink-0 flex items-center justify-between">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Images
              </p>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${images.length >= MAX_IMAGES ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-400"}`}>
                {images.length}/{MAX_IMAGES}
              </span>
            </div>

            {/* Fixed 3 slots — height never changes */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {Array.from({ length: MAX_IMAGES }).map((_, slotIdx) => {
                const img = images[slotIdx];
                const isSelected = img && selectedId === img.id;

                return (
                  <div
                    key={slotIdx}
                    className={`flex flex-col p-3 transition-colors ${isSelected ? "bg-purple-50/60" : ""}`}
                    style={{ minHeight: "98px" }}
                  >
                    {img ? (
                      /* Filled slot */
                      <div className="flex flex-col gap-2">
                        {/* Row: thumbnail + name + controls */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { triggerUpload(slotIdx); setSelectedId(img.id); }}
                            title="Replace image"
                            className={`w-11 h-8 flex-shrink-0 rounded overflow-hidden bg-gray-100 border ${isSelected ? "border-purple-400" : "border-gray-200"} hover:border-purple-300 transition-colors`}
                          >
                            <img src={img.src} alt={img.name} className="w-full h-full object-contain" />
                          </button>
                          <span
                            className="flex-1 text-[11px] text-gray-700 truncate cursor-pointer"
                            onClick={() => setSelectedId(img.id)}
                            title={img.name}
                          >
                            {img.name}
                          </span>
                          {/* Visibility toggle */}
                          <button
                            onClick={() => updateImage(img.id, { visible: !img.visible })}
                            title={img.visible ? "Hide overlay" : "Show overlay"}
                            className={`w-6 h-6 flex items-center justify-center rounded transition-colors flex-shrink-0 ${img.visible ? "text-purple-600 bg-purple-50 hover:bg-purple-100" : "text-gray-300 hover:text-purple-400 hover:bg-purple-50"}`}
                          >
                            {img.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                          {/* Remove */}
                          <button
                            onClick={() => removeImage(img.id)}
                            title="Remove image"
                            className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Sliders */}
                        <div className="space-y-1.5 px-0.5">
                          {/* Size — 5% (tiny) to 150% (fills/covers entire screen) */}
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-gray-400 uppercase tracking-wide w-10 flex-shrink-0">Size</span>
                            <input
                              type="range" min={5} max={150} step={1}
                              value={img.size}
                              onChange={e => updateImage(img.id, { size: parseInt(e.target.value) })}
                              className="flex-1 h-1 cursor-pointer accent-purple-600"
                              onClick={() => setSelectedId(img.id)}
                            />
                            <span className="text-[9px] text-gray-400 w-8 text-right flex-shrink-0">{img.size}%</span>
                          </div>
                          {/* Opacity */}
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-gray-400 uppercase tracking-wide w-10 flex-shrink-0">Opacity</span>
                            <input
                              type="range" min={0} max={100} step={1}
                              value={Math.round(img.opacity * 100)}
                              onChange={e => updateImage(img.id, { opacity: parseInt(e.target.value) / 100 })}
                              className="flex-1 h-1 cursor-pointer accent-purple-600"
                              onClick={() => setSelectedId(img.id)}
                            />
                            <span className="text-[9px] text-gray-400 w-8 text-right flex-shrink-0">{Math.round(img.opacity * 100)}%</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Empty slot — upload button */
                      <button
                        onClick={() => triggerUpload(null)}
                        disabled={images.length >= MAX_IMAGES}
                        className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-purple-300 hover:text-purple-500 hover:bg-purple-50/40 transition-all disabled:opacity-0 disabled:pointer-events-none"
                      >
                        <Upload className="w-4 h-4" />
                        <span className="text-[10px] font-medium">Upload image</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Format hint */}
            <p className="px-3.5 py-1.5 text-[9px] text-gray-400 border-t border-gray-100 flex-shrink-0">
              PNG · JPG · SVG · WebP · max 2 MB each · images auto-saved locally
            </p>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50/40 flex-shrink-0">
          {error && (
            <p className="flex-1 text-xs text-red-600 truncate min-w-0">{error}</p>
          )}
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            <Button
              type="button" variant="outline" size="sm"
              onClick={clearOverlay}
              disabled={pushing}
              className="text-xs h-8 text-gray-600 hover:text-red-600 hover:border-red-300"
            >
              Clear overlay
            </Button>
            <Button
              type="button" size="sm"
              onClick={pushLive}
              disabled={pushing || images.length === 0}
              className="text-xs h-8 bg-green-600 hover:bg-green-700 text-white gap-1.5 shadow-sm"
            >
              {pushing
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Pushing…</>
                : <><Layers className="w-3.5 h-3.5" /> Push Live</>
              }
            </Button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileChange}
        />
      </DialogContent>
    </Dialog>
  );
}
