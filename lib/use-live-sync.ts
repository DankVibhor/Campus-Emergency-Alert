"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase-browser";

/**
 * Closes the two gaps that made the UI need a manual reload.
 *
 * 1. Subscribing to a Realtime channel is not instant — on a phone it can take
 *    seconds and sometimes reports TIMED_OUT before retrying. Every change
 *    that happens in that window is delivered to nobody. So we re-run the
 *    caller's fetch each time the channel reaches SUBSCRIBED, which repairs
 *    the gap on first connect and after any reconnect.
 *
 * 2. If the websocket never establishes at all (restrictive campus wifi,
 *    captive portal, backgrounded tab), polling keeps the screen truthful
 *    instead of silently frozen.
 */
export function useLiveSync(
  channelName: string,
  bind: (channel: RealtimeChannel) => RealtimeChannel,
  resync: () => void | Promise<void>,
  options: { pollMs?: number } = {},
) {
  const resyncRef = useRef(resync);
  resyncRef.current = resync;

  const bindRef = useRef(bind);
  bindRef.current = bind;

  const pollMs = options.pollMs ?? 12_000;

  useEffect(() => {
    let disposed = false;

    const channel = bindRef.current(supabase.channel(channelName)).subscribe(
      (status) => {
        if (disposed) return;
        // Fires on first connect and on every automatic reconnect.
        if (status === "SUBSCRIBED") void resyncRef.current();
      },
    );

    // Safety net: refresh on an interval regardless of socket health.
    const poll = window.setInterval(() => {
      if (!disposed) void resyncRef.current();
    }, pollMs);

    // A backgrounded tab suspends timers and may drop the socket; catch up
    // the instant the user looks at the screen again.
    const onVisible = () => {
      if (document.visibilityState === "visible") void resyncRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      disposed = true;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [channelName, pollMs]);
}
