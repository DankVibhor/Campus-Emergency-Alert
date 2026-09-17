export default function OfflinePage() {
  return (
    <div className="px-safe pt-safe">
      <h1 className="pt-2 text-2xl font-extrabold text-slate-900">You are offline</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Aegis cannot reach the network. Use the Call Security button below — voice
        calls work even without mobile data.
      </p>
    </div>
  );
}
