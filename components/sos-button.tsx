"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  feedbackCancel,
  feedbackConfirm,
  feedbackTick,
  primeAudio,
} from "@/lib/feedback";
import { primeSpeech } from "@/lib/speech";

const HOLD_MS = 2000;
const SIZE = 224; // >= the 200px minimum, including the ring
const STROKE = 10;
const RADIUS = SIZE / 2 - STROKE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface SosButtonProps {
  onConfirm: () => void;
  disabled?: boolean;
  /** Shown under the main label, e.g. the selected emergency type. */
  hint?: string;
  submitting?: boolean;
}

export default function SosButton({
  onConfirm,
  disabled = false,
  hint,
  submitting = false,
}: SosButtonProps) {
  const [progress, setProgress] = useState(0); // 0..1
  const [holding, setHolding] = useState(false);
  const [justFired, setJustFired] = useState(false);

  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const firedRef = useRef(false);
  const lastTickRef = useRef(0);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Never leave a rAF running if the screen unmounts mid-hold.
  useEffect(() => stopLoop, [stopLoop]);

  const tick = useCallback(() => {
    const elapsed = performance.now() - startRef.current;
    const p = Math.min(1, elapsed / HOLD_MS);
    setProgress(p);

    // A tick every ~400ms tells the user the hold is registering.
    if (elapsed - lastTickRef.current > 400 && p < 1) {
      lastTickRef.current = elapsed;
      feedbackTick();
    }

    if (p >= 1) {
      if (!firedRef.current) {
        firedRef.current = true;
        setHolding(false);
        setJustFired(true);
        feedbackConfirm();
        window.setTimeout(() => setJustFired(false), 900);
        onConfirm();
      }
      stopLoop();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [onConfirm, stopLoop]);

  const begin = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || submitting) return;
      // Keep receiving events if the finger drifts off the button.
      e.currentTarget.setPointerCapture?.(e.pointerId);
      // Both must happen inside the gesture, or iOS blocks the confirmation
      // beep and any spoken status update on the next screen.
      primeAudio();
      primeSpeech();

      firedRef.current = false;
      lastTickRef.current = 0;
      startRef.current = performance.now();
      setHolding(true);
      setProgress(0);
      stopLoop();
      rafRef.current = requestAnimationFrame(tick);
    },
    [disabled, submitting, stopLoop, tick],
  );

  const end = useCallback(() => {
    stopLoop();
    setHolding(false);
    // Released before the ring closed: treat as an abort, not a report.
    if (!firedRef.current && progress > 0.05) feedbackCancel();
    if (!firedRef.current) setProgress(0);
  }, [progress, stopLoop]);

  const pct = Math.round(progress * 100);
  const isDisabled = disabled || submitting;

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        aria-label="SOS — hold 2 seconds to send an emergency report"
        aria-disabled={isDisabled}
        disabled={isDisabled}
        onPointerDown={begin}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative flex items-center justify-center rounded-full outline-none ${
          justFired ? "animate-aegis-pulse" : ""
        } ${isDisabled ? "opacity-50" : ""}`}
        style={{
          width: SIZE,
          height: SIZE,
          // Stops the page scrolling out from under a hold.
          touchAction: "none",
        }}
      >
        {/* Progress ring */}
        <svg
          width={SIZE}
          height={SIZE}
          className="absolute inset-0 -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="#fee2e2"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="#dc2626"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          />
        </svg>

        {/* Face */}
        <span
          className="flex flex-col items-center justify-center rounded-full bg-red-600 text-white transition-transform duration-150"
          style={{
            width: SIZE - STROKE * 4,
            height: SIZE - STROKE * 4,
            transform: holding ? "scale(0.94)" : "scale(1)",
          }}
        >
          <span className="text-4xl font-extrabold leading-none tracking-tight">
            SOS
          </span>
          <span className="mt-1.5 px-4 text-center text-[11px] font-bold leading-tight text-white">
            {submitting
              ? "Sending…"
              : holding
                ? "Keep holding…"
                : "Hold 2 seconds"}
          </span>
        </span>
      </button>

      {/* Screen-reader progress + visible hint */}
      <span className="sr-only" aria-live="polite">
        {holding ? `${pct} percent` : ""}
      </span>
      {hint ? (
        <p className="px-6 text-center text-sm font-medium text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
