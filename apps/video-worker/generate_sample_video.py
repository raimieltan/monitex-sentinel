"""
Generates a short synthetic MP4 (a square bouncing around a static
background, with brief pauses) so `worker.py` has a looping sample video to
run motion detection against without needing real camera/RTSP hardware or an
external download. Run once: `python generate_sample_video.py`.
"""
import os

import cv2
import numpy as np

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "sample.mp4")
WIDTH, HEIGHT = 320, 240
FPS = 15
DURATION_SECONDS = 12


def main() -> None:
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(OUTPUT_PATH, fourcc, FPS, (WIDTH, HEIGHT))

    total_frames = FPS * DURATION_SECONDS
    box_size = 30

    for i in range(total_frames):
        frame = np.full((HEIGHT, WIDTH, 3), 20, dtype=np.uint8)

        # Pause with no motion for the first couple seconds of each loop, so
        # the worker also gets to exercise the "no motion" path.
        if i % (FPS * 6) < FPS * 2:
            x, y = 20, 20
        else:
            t = i / FPS
            x = int((WIDTH - box_size) * (0.5 + 0.5 * np.sin(t * 1.3)))
            y = int((HEIGHT - box_size) * (0.5 + 0.5 * np.cos(t * 1.7)))

        cv2.rectangle(frame, (x, y), (x + box_size, y + box_size), (60, 180, 250), -1)
        writer.write(frame)

    writer.release()
    print(f"wrote {total_frames} frames ({DURATION_SECONDS}s @ {FPS}fps) to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
