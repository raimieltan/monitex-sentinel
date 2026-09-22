interface CameraControlsProps {
  canReconnect: boolean;
  canSnapshot: boolean;
  canFullscreen: boolean;
  onReconnect?: () => void;
  onSnapshot?: () => void;
  onFullscreen?: () => void;
}

const BUTTON_STYLE =
  "rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

export function CameraControls({
  canReconnect,
  canSnapshot,
  canFullscreen,
  onReconnect,
  onSnapshot,
  onFullscreen,
}: CameraControlsProps) {
  return (
    <div className="flex items-center gap-1 border-t border-slate-200 px-3 py-2">
      <button type="button" aria-label="Fullscreen" disabled={!canFullscreen} onClick={onFullscreen} className={BUTTON_STYLE}>
        Fullscreen
      </button>
      <button type="button" aria-label="Reconnect camera" disabled={!canReconnect} onClick={onReconnect} className={BUTTON_STYLE}>
        Reconnect
      </button>
      <button type="button" aria-label="Take snapshot" disabled={!canSnapshot} onClick={onSnapshot} className={BUTTON_STYLE}>
        Snapshot
      </button>
    </div>
  );
}
