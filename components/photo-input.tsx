"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase-browser";

interface Props {
  onUploaded: (url: string | null) => void;
}

const MAX_EDGE = 1280;
const BUCKET = "incident-photos";

/**
 * Optional photo evidence.
 *
 * Downscaled in the browser before upload: a modern phone camera produces
 * 4-8MB files, which on campus wifi would delay the report itself. A 1280px
 * JPEG is plenty to see smoke or a hazard and uploads in about a second.
 */
export default function PhotoInput({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shrink = useCallback(async (file: File): Promise<Blob> => {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    return new Promise<Blob>((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob ?? file),
        "image/jpeg",
        0.82,
      );
    });
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const blob = await shrink(file).catch(() => file);
        const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(name, blob, { contentType: "image/jpeg", upsert: false });

        if (uploadError) throw new Error(uploadError.message);

        const { data } = supabase.storage.from(BUCKET).getPublicUrl(name);
        setPreview(URL.createObjectURL(blob));
        onUploaded(data.publicUrl);
      } catch (err) {
        // A failed photo must never block the report itself.
        setError(
          err instanceof Error
            ? `Photo not attached: ${err.message}`
            : "Photo could not be attached.",
        );
        onUploaded(null);
      } finally {
        setBusy(false);
      }
    },
    [shrink, onUploaded],
  );

  const clear = useCallback(() => {
    setPreview(null);
    setError(null);
    onUploaded(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [onUploaded]);

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {preview ? (
        <div className="flex items-center gap-3 rounded-2xl border-2 border-slate-200 px-3 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Photo attached to this report"
            className="h-16 w-16 shrink-0 rounded-xl object-cover"
          />
          <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">
            Photo attached
          </span>
          <button
            type="button"
            onClick={clear}
            aria-label="Remove photo"
            className="tap flex shrink-0 items-center justify-center rounded-xl border border-slate-300 p-2.5 text-slate-600 active:bg-slate-100"
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="tap flex items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 px-5 py-3 font-bold text-slate-800 active:bg-slate-100 disabled:opacity-60"
        >
          <Camera size={18} aria-hidden="true" />
          {busy ? "Attaching photo…" : "Add a photo (optional)"}
        </button>
      )}

      {error ? (
        <p className="text-sm font-medium text-amber-700">{error}</p>
      ) : null}
    </div>
  );
}
