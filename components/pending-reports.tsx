"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudUpload, WifiOff } from "lucide-react";
import { flush, listPending, type PendingReport } from "@/lib/offline-queue";
import { rememberReport } from "@/lib/my-reports";

export default function PendingReports() {
  const [pending, setPending] = useState<PendingReport[]>([]);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setPending(await listPending());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const send = useCallback(async () => {
    setSending(true);
    setNote(null);
    try {
      const { sent, failed } = await flush();
      for (const id of sent) {
        rememberReport({
          id,
          emergencyType: "queued",
          createdAt: new Date().toISOString(),
        });
      }
      if (sent.length > 0) {
        setNote(
          `${sent.length} queued report${sent.length === 1 ? "" : "s"} delivered.`,
        );
      }
      if (failed > 0) setNote(`${failed} still waiting for a connection.`);
    } finally {
      setSending(false);
      void reload();
    }
  }, [reload]);

  // Retry the moment the browser says we are back online.
  useEffect(() => {
    function onOnline() {
      void send();
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [send]);

  if (pending.length === 0) {
    return note ? (
      <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
        <p className="text-sm font-semibold text-green-800">{note}</p>
      </div>
    ) : null;
  }

  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-4">
      <p className="flex items-center gap-2 text-sm font-extrabold text-amber-900">
        <WifiOff size={16} aria-hidden="true" />
        {pending.length} report{pending.length === 1 ? "" : "s"} waiting to send
      </p>
      <p className="mt-1 text-sm leading-relaxed text-amber-800">
        These were filed with no connection. They will send automatically when
        you are back online.
      </p>
      <button
        type="button"
        onClick={send}
        disabled={sending}
        className="press tap mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 font-bold text-white disabled:opacity-60"
      >
        <CloudUpload size={18} aria-hidden="true" />
        {sending ? "Sending…" : "Try sending now"}
      </button>
      {note ? (
        <p className="mt-2 text-sm font-medium text-amber-900">{note}</p>
      ) : null}
    </div>
  );
}
