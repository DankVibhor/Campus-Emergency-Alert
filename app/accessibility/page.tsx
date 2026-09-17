import AccessibilitySettings from "@/components/accessibility-settings";

export const metadata = {
  title: "Accessibility — ASMT Aegis",
};

export default function AccessibilityPage() {
  return (
    <div className="px-safe pt-safe flex flex-col gap-5">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold leading-tight text-slate-900">
          Accessibility
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          These settings are saved on this phone only. No account needed.
        </p>
      </header>

      <AccessibilitySettings />
    </div>
  );
}
