'use client';

import type { VideoPair } from '@/lib/videos';
import { useEffect, useRef, useState } from 'react';

/**
 * Real video footage as a section background.
 * - Picks the portrait clip on phones and the landscape clip elsewhere.
 * - Always starts muted (browsers block autoplay with sound); a button turns the sound on when the clip has audio.
 * - Plays only while visible, and not at all for visitors who ask for reduced motion (the poster stays).
 */
export function VideoBackdrop({ pair, className = '', soundOn, soundOff }: { pair: VideoPair; className?: string; soundOn: string; soundOff: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [hasAudio, setHasAudio] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 700px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const chosen = mobile === null ? null : mobile ? (pair.mobile ?? pair.desktop) : (pair.desktop ?? pair.mobile);

  useEffect(() => {
    const video = ref.current;
    const box = wrap.current;
    if (!video || !box || !chosen) return;
    setReady(false);
    setMuted(true);
    video.muted = true;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (reduce) return;
        if (entry?.isIntersecting) void video.play().catch(() => undefined);
        else video.pause();
      },
      { threshold: 0.15 },
    );
    io.observe(box);
    // Start at once when the section is already on screen (the observer can report late).
    const r = box.getBoundingClientRect();
    if (!reduce && r.bottom > 0 && r.top < window.innerHeight) void video.play().catch(() => undefined);
    return () => io.disconnect();
  }, [chosen]);

  if (!pair.desktop && !pair.mobile) return null;

  const detectAudio = () => {
    const v = ref.current as (HTMLVideoElement & { mozHasAudio?: boolean; webkitAudioDecodedByteCount?: number; audioTracks?: { length: number } }) | null;
    if (!v) return;
    const audio = Boolean(v.mozHasAudio) || (v.webkitAudioDecodedByteCount ?? 0) > 0 || (v.audioTracks?.length ?? 0) > 0;
    if (audio) setHasAudio(true);
  };

  return (
    <div ref={wrap} className={`vbd ${ready ? 'vbd-ready' : ''} ${className}`}>
      {chosen?.poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="vbd-poster" src={chosen.poster} alt="" aria-hidden="true" />
      ) : null}
      {chosen ? (
        <video
          key={chosen.src}
          ref={ref}
          className="vbd-video"
          src={chosen.src}
          poster={chosen.poster ?? undefined}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          onCanPlay={() => setReady(true)}
          onTimeUpdate={detectAudio}
        />
      ) : null}
      <div className="vbd-shade" aria-hidden="true" />
      {hasAudio ? (
        <button
          type="button"
          className="vbd-sound"
          aria-pressed={!muted}
          aria-label={muted ? soundOn : soundOff}
          title={muted ? soundOn : soundOff}
          onClick={() => {
            const v = ref.current;
            if (!v) return;
            v.muted = !muted;
            setMuted(!muted);
            if (v.paused) void v.play().catch(() => undefined);
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9h4l5-4v14l-5-4H4Z" fill="currentColor" stroke="none" />
            {muted ? <path d="m16 9 5 6M21 9l-5 6" /> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}
          </svg>
        </button>
      ) : null}
    </div>
  );
}
