"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AppScene } from "@/lib/app-scenes";

function join(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

/**
 * A muted background video for the one or two surfaces where motion is worth
 * the download. The still image underneath is always present, so a refused
 * autoplay or a reduced-motion preference leaves a finished photograph.
 *
 * `width` and `height` are explicit: an unloaded video otherwise reports
 * 300×150, which can keep it outside the viewport and shift layout when it
 * arrives. Reduced motion is checked after hydration: the video is not in the
 * server or first client render at all, so nobody sees a flash of movement
 * before their preference is known.
 */
function SceneVideo({ src, poster }: { src: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [motionAllowed, setMotionAllowed] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      const allowed = !query.matches;
      setMotionAllowed(allowed);
      if (!allowed) return;
      const video = ref.current;
      if (!video) return;
      const attempt = video.play();
      if (attempt && typeof attempt.catch === "function") attempt.catch(() => undefined);
    };

    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  if (!motionAllowed) return null;

  return (
    <video
      ref={ref}
      width={1280}
      height={720}
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      disablePictureInPicture
      tabIndex={-1}
      aria-hidden="true"
      className="absolute inset-0 size-full object-cover"
    />
  );
}

/**
 * The photographic plate behind an authenticated page's opening.
 *
 * No gradients and no squared-line textures: a solid, high-opacity scrim
 * keeps white type readable over any photograph and across all five themes.
 * The image is an `<Image>` rather than a CSS background so the browser's
 * preload scanner can discover what is usually the largest paint on the
 * page.
 */
export function SceneBackdrop({
  scene,
  priority = false,
  className,
  minHeight = "clamp(220px, 24vw, 320px)",
  children,
}: {
  scene: AppScene;
  priority?: boolean;
  className?: string;
  minHeight?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={join(
        "app-scene relative isolate overflow-hidden rounded-app-xl border border-app-border bg-app-elevated",
        className,
      )}
      style={{ minHeight }}
    >
      <Image
        src={scene.src}
        alt={scene.alt}
        fill
        priority={priority}
        sizes="(max-width: 1024px) 100vw, 1440px"
        className="object-cover object-center"
      />
      {scene.video ? <SceneVideo src={scene.video} poster={scene.poster} /> : null}
      <div aria-hidden="true" className="absolute inset-0 bg-[#07070c]/72" />
      <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-8 lg:p-10">
        {children}
      </div>
      {scene.caption ? (
        <p className="pointer-events-none absolute top-4 right-5 hidden font-mono text-[0.6rem] tracking-[0.14em] text-white/55 uppercase sm:block">
          {scene.caption}
        </p>
      ) : null}
    </section>
  );
}
