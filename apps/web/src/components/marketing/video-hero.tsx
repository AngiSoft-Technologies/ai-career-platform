"use client";

import { useRef, useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";

interface VideoHeroProps {
  poster: string;
  videoSrc: string;
  children?: ReactNode;
  className?: string;
  muted?: boolean;
  loop?: boolean;
  playsInline?: boolean;
}

export function VideoHero({
  poster,
  videoSrc,
  children,
  className,
  muted = true,
  loop = true,
  playsInline = true,
}: VideoHeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.loop = loop;
    video.playsInline = playsInline;
    video.preload = "metadata";

    const onCanPlay = () => setLoaded(true);

    video.addEventListener("canplay", onCanPlay);

    return () => {
      video.removeEventListener("canplay", onCanPlay);
    };
  }, [muted, loop, playsInline]);

  return (
    <div className={clsx("mk-video-hero", className)}>
      <div className="mk-video-hero__bg" aria-hidden="true">
        <video
          ref={videoRef}
          poster={poster}
          className="mk-video-hero__video"
          autoPlay
          muted={muted}
          loop={loop}
          playsInline={playsInline}
          aria-hidden={true}
          disablePictureInPicture
          disableRemotePlayback
          preload="metadata"
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
        {!loaded && <div className="mk-video-hero__poster" style={{ backgroundImage: `url(${poster})` }} aria-hidden="true" />}
      </div>

      {children && <div className="mk-video-hero__content">{children}</div>}
    </div>
  );
}