import type { DetectionOverlay } from "@/types/event";

interface CameraOverlayLayerProps {
  detections: DetectionOverlay[];
  sourceWidth: number;
  sourceHeight: number;
}

/** Bounding boxes are positioned in % of the source frame, so they stay correct as the rendered video size/aspect changes. */
export function CameraOverlayLayer({ detections, sourceWidth, sourceHeight }: CameraOverlayLayerProps) {
  if (detections.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {detections.map((d) => (
        <div
          key={d.id}
          className="absolute border-2 border-red-500"
          style={{
            left: `${(d.bbox.x / sourceWidth) * 100}%`,
            top: `${(d.bbox.y / sourceHeight) * 100}%`,
            width: `${(d.bbox.width / sourceWidth) * 100}%`,
            height: `${(d.bbox.height / sourceHeight) * 100}%`,
          }}
        >
          <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-red-500 px-1.5 py-0.5 text-xs font-semibold text-white">
            {d.label} {d.confidence.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}
