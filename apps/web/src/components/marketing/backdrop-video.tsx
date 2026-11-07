"use client";

import { useEffect, useRef } from "react";

/**
 * A background video that plays.
 *
 * The `autoPlay` attribute is a request, not a promise: browsers on
 * phones require the video to be muted *and* to receive a play() call
 * from a user gesture's aftermath, and a video that silently fails
 * leaves a hero looking like a still image with nothing behind it. This
 * asks on every signal the browser offers — loadeddata, canplay, the tab
 * becoming visible — and quietly gives up if the platform refuses.
 */
export function BackdropVideo({
  src,
  poster,
  className,
}: {
  src: string;
  poster?: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const play = () => {
      const attempt = video.play();
      if (attempt && typeof attempt.catch === "function") {
        attempt.catch(() => {
          /* Autoplay refused: the poster and the CSS background stay. */
        });
      }
    };

    if (video.readyState >= 3) play();
    video.addEventListener("loadeddata", play);
    video.addEventListener("canplay", play);
    document.addEventListener("visibilitychange", play);

    return () => {
      video.removeEventListener("loadeddata", play);
      video.removeEventListener("canplay", play);
      document.removeEventListener("visibilitychange", play);
    };
  }, []);

  return (
    <video
      ref={ref}
      className={className}
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      tabIndex={-1}
      aria-hidden="true"
    />
  );
}
