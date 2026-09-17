"use client";

import { useEffect } from "react";
import { applySettings, readSettings } from "@/lib/a11y-settings";

/**
 * Applies saved accessibility preferences to <html> on first paint, so a user
 * who chose large text or high contrast does not see the default styling
 * flash before their settings load.
 */
export default function A11yBoot() {
  useEffect(() => {
    applySettings(readSettings());
  }, []);

  return null;
}
