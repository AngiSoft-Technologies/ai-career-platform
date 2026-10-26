"use client";

import { useRef, useEffect, useState, type ReactNode } from "react";
import { Play, Pause, X, Expand } from "lucide-react";
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
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.loop = loop;
    video.playsInline = playsInline;
    video.preload = "metadata";

    const onCanPlay = () => setLoaded(true);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => { if (!loop) setPlaying(false); };

    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    };
  }, [muted, loop, playsInline]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  return (
    <div className={clsx("mk-video-hero", className)}>
      <div className="mk-video-hero__bg" aria-hidden="true">
        <video
          ref={videoRef}
          poster={poster}
          className="mk-video-hero__video"
          muted={muted}
          loop={loop}
          playsInline={playsInline}
          aria-hidden={true}
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
        {!loaded && <div className="mk-video-hero__poster" style={{ backgroundImage: `url(${poster})` }} aria-hidden="true" />}
      </div>

      {children && <div className="mk-video-hero__content">{children}</div>}

      <button
        className={clsx("mk-video-hero__play", playing && "is-playing")}
        onClick={toggle}
        aria-label={playing ? "Pause background video" : "Play background video"}
        aria-pressed={playing}
      >
        {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </button>

      {children && (
        <button
          className="mk-video-hero__expand"
          onClick={() => setShowModal(true)}
          aria-label="Watch full demo"
        >
          <Expand aria-hidden="true" />
          <span>Watch demo</span>
        </button>
      )}

      {showModal && (
        <div className="mk-video-modal" role="dialog" aria-modal="true" aria-label="Video demo">
          <div className="mk-video-modal__inner" onClick={() => setShowModal(false)}>
            <button className="mk-video-modal__close" onClick={() => setShowModal(false)} aria-label="Close video">
              <X aria-hidden="true" />
            </button>
            <video
              controls
              autoPlay
              muted={muted}
              loop={loop}
              playsInline={playsInline}
              poster={poster}
              className="mk-video-modal__video"
            >
              <source src={videoSrc} type="video/mp4" />
            </video>
          </div>
        </div>
      )}
    </div>
  );
}