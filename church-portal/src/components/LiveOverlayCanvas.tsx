export interface OverlayImage {
  id: string;
  src: string;
  x: number;       // 0-100, % of container width
  y: number;       // 0-100, % of container height
  size: number;    // 5-80, % of container width
  opacity: number; // 0.0-1.0
  visible: boolean;
}

export interface OverlayState {
  images: OverlayImage[];
  active: boolean;
}

interface Props {
  state: OverlayState | null;
}

/**
 * Renders live overlay images on top of the video player.
 * pointer-events: none — never blocks video interaction.
 * Works in normal mode and custom PiP mode.
 */
export default function LiveOverlayCanvas({ state }: Props) {
  if (!state?.active) return null;

  const visible = state.images.filter(i => i.visible);
  if (!visible.length) return null;

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ pointerEvents: "none", zIndex: 10 }}
      aria-hidden="true"
    >
      {visible.map(img => (
        <img
          key={img.id}
          src={img.src}
          alt=""
          className="absolute block"
          style={{
            left: `${img.x}%`,
            top: `${img.y}%`,
            width: `${img.size}%`,
            opacity: img.opacity,
            transform: "translate(-50%, -50%)",
            objectFit: "contain",
            maxWidth: "none",
            userSelect: "none",
          }}
          draggable={false}
        />
      ))}
    </div>
  );
}
