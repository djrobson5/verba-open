'use client';

import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  active: boolean;
  userAnalyser?: AnalyserNode | null;
  aiAnalyser?: AnalyserNode | null;
}

const N_BARS = 14;
const BINS_PER_BAR = 2;
const POWER_THRESHOLD = 400;
const MIN_SCALE = 0.18;

// User speech is the brand color, partner speech is ink-soft, silence is the rule color.
const USER_COLOR = 'var(--color-brand)';
const AI_COLOR = 'var(--color-ink-soft)';
const IDLE_COLOR = 'var(--color-rule)';

export function AudioVisualizer({
  active,
  userAnalyser,
  aiAnalyser,
}: AudioVisualizerProps) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    // Reset when not active.
    if (!active) {
      barsRef.current.forEach((el) => {
        if (!el) return;
        el.style.transform = `scaleY(${MIN_SCALE})`;
        el.style.backgroundColor = IDLE_COLOR;
      });
      return;
    }

    let raf = 0;
    const userBuf = new Uint8Array(N_BARS * BINS_PER_BAR);
    const aiBuf = new Uint8Array(N_BARS * BINS_PER_BAR);

    const tick = () => {
      let userPower = 0;
      let aiPower = 0;

      if (userAnalyser) {
        userAnalyser.getByteFrequencyData(userBuf);
        for (let i = 0; i < userBuf.length; i++) userPower += userBuf[i];
      }
      if (aiAnalyser) {
        aiAnalyser.getByteFrequencyData(aiBuf);
        for (let i = 0; i < aiBuf.length; i++) aiPower += aiBuf[i];
      }

      const userDominant = userPower >= aiPower && userPower > POWER_THRESHOLD;
      const aiDominant = aiPower > userPower && aiPower > POWER_THRESHOLD;
      const data = userDominant ? userBuf : aiDominant ? aiBuf : null;
      const color = userDominant ? USER_COLOR : aiDominant ? AI_COLOR : IDLE_COLOR;

      for (let i = 0; i < N_BARS; i++) {
        const el = barsRef.current[i];
        if (!el) continue;
        let scale = MIN_SCALE;
        if (data) {
          let sum = 0;
          for (let j = 0; j < BINS_PER_BAR; j++) {
            sum += data[i * BINS_PER_BAR + j];
          }
          const avg = sum / BINS_PER_BAR / 255;
          scale = Math.max(MIN_SCALE, Math.min(1, avg * 1.8));
        }
        el.style.transform = `scaleY(${scale})`;
        el.style.backgroundColor = color;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, userAnalyser, aiAnalyser]);

  return (
    <div className="flex-1 flex items-center gap-[3px] h-9 min-w-0">
      {Array.from({ length: N_BARS }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="flex-1 rounded-full origin-center h-full"
          style={{
            transform: `scaleY(${MIN_SCALE})`,
            backgroundColor: IDLE_COLOR,
            transition: 'transform 60ms linear, background-color 200ms ease',
          }}
        />
      ))}
    </div>
  );
}
