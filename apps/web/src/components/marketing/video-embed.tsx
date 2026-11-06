"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";

/**
 * A YouTube video, loaded only when asked.
 *
 * An `<iframe>` to YouTube costs a few hundred kilobytes of script and a
 * pair of cookies on page load — on a marketing page about job hunting,
 * that is a poor trade. The facade ships a still frame and a play button
 * instead; the player itself is requested after the visitor chooses to
 * watch. `youtube-nocookie` keeps the privacy mode the button promises.
 * No API key is involved at any point.
 */
export function VideoEmbed({
  videoId,
  title,
  channel,
  className,
}: {
  videoId: string;
  title: string;
  channel: string;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const poster = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return (
    <figure className={`mk-video ${className ?? ""}`.trim()} style={{ margin: 0 }}>
      <div className="mk-video__frame">
        {playing ? (
          <iframe
            className="mk-video__iframe"
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <button type="button" className="mk-video__play" onClick={() => setPlaying(true)}>
            <Image
              className="mk-video__poster"
              src={poster}
              alt=""
              fill
              sizes="(max-width: 800px) 100vw, 600px"
              unoptimized
            />
            <span className="mk-video__play-ring" aria-hidden="true">
              <Play fill="currentColor" strokeWidth={0} />
            </span>
            <span className="mk-video__play-label">Watch — {title}</span>
          </button>
        )}
      </div>
      <figcaption className="mk-video__meta">
        <strong>{title}</strong>
        <span>Video by {channel} on YouTube</span>
      </figcaption>
    </figure>
  );
}
