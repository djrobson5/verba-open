'use client';

import { useEffect, useRef } from 'react';
import type { AvatarState, AvatarVendor } from '@/lib/avatar/types';
import { AVATAR_VENDORS } from '@/config/avatars';

interface AvatarStageProps {
  elements: { video: HTMLVideoElement; audio: HTMLAudioElement } | null;
  state: AvatarState;
  error: string | null;
  speaking: boolean;
  vendor: AvatarVendor;
}

export function AvatarStage({
  elements,
  state,
  error,
  speaking,
  vendor,
}: AvatarStageProps) {
  const videoHostRef = useRef<HTMLDivElement | null>(null);
  const audioHostRef = useRef<HTMLDivElement | null>(null);

  // The media elements are created and owned by the AvatarProvider (WebRTC
  // attaches tracks to them directly), so React only adopts them into layout.
  useEffect(() => {
    const videoHost = videoHostRef.current;
    const audioHost = audioHostRef.current;
    if (!elements || !videoHost || !audioHost) return;

    const { video, audio } = elements;
    video.className = 'w-full h-full object-cover';
    videoHost.appendChild(video);
    audioHost.appendChild(audio);

    return () => {
      if (video.parentNode === videoHost) videoHost.removeChild(video);
      if (audio.parentNode === audioHost) audioHost.removeChild(audio);
    };
  }, [elements]);

  const isConnecting = state === 'connecting';
  const showError = state === 'error';
  const vendorLabel = AVATAR_VENDORS.find((v) => v.id === vendor)?.label ?? vendor;
  // Simli renders a square 512x512 frame; LiveAvatar publishes 16:9 video.
  // Width is also capped by viewport height so the pinned stage never takes
  // more than ~40% of the screen and leaves room for the transcript.
  const frameClass =
    vendor === 'simli'
      ? 'aspect-square w-[min(100%,28rem,40svh)]'
      : 'aspect-video w-[min(100%,42rem,calc(40svh*16/9))]';

  return (
    // Pinned under the sticky AppHeader (h-16) so the partner stays in view
    // while the transcript scrolls; bg-page hides messages passing beneath.
    <div className="sticky top-16 z-10 bg-page pt-2 pb-4 mb-2">
      <div
        className={`relative rounded-ui border border-rule overflow-hidden bg-ink ${frameClass} mx-auto transition-shadow duration-300`}
        style={speaking ? { boxShadow: '0 0 0 3px var(--color-brand)' } : undefined}
      >
        <div ref={videoHostRef} className="absolute inset-0" />
        <div ref={audioHostRef} className="hidden" />

        <span className="absolute top-3 left-3 font-mono text-[11px] uppercase tracking-[0.16em] text-white/75 pointer-events-none">
          {vendorLabel}
        </span>

        {isConnecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <span className="w-3 h-3 rounded-full bg-accent animate-pulse" />
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/75">
              Connecting your partner…
            </span>
          </div>
        )}

        {showError && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center p-3">
            <span className="inline-flex items-center gap-1.5 rounded-ui bg-surface border border-rule px-3 py-1.5 text-xs text-ink-soft">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-bad">
                Audio only
              </span>
              {error && <span className="truncate max-w-[18rem]">{error}</span>}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
