/**
 * useWebSocketNotifications — opens a WS connection to /api/ws/notifications
 * and invokes the callback on each incoming JSON message.
 *
 *   useWebSocketNotifications(payload => {
 *     if (payload.type === "notification") toast(payload.title, { description: payload.body });
 *   });
 *
 * Falls back silently if WebSocket isn't supported or the connection fails —
 * the existing 60s polling continues to work as a backup.
 */
import { useEffect, useRef } from "react";

export function useWebSocketNotifications(onMessage, { enabled = true } = {}) {
  const ref = useRef(onMessage);
  ref.current = onMessage;

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof WebSocket === "undefined") return;
    const token = localStorage.getItem("token");
    if (!token) return;
    const base = (process.env.REACT_APP_BACKEND_URL || "").replace(/^http/, "ws");
    if (!base) return;
    const url = `${base}/api/ws/notifications?token=${encodeURIComponent(token)}`;

    let ws;
    let pingTimer;
    let reconnectTimer;
    let alive = true;

    const connect = () => {
      try {
        ws = new WebSocket(url);
        ws.onopen = () => {
          // Heartbeat ping every 25s
          pingTimer = setInterval(() => { try { ws.send("ping"); } catch {} }, 25000);
        };
        ws.onmessage = (ev) => {
          try {
            const payload = JSON.parse(ev.data);
            ref.current?.(payload);
          } catch {}
        };
        ws.onclose = () => {
          clearInterval(pingTimer);
          if (alive) reconnectTimer = setTimeout(connect, 5000);
        };
        ws.onerror = () => { try { ws.close(); } catch {} };
      } catch {
        if (alive) reconnectTimer = setTimeout(connect, 5000);
      }
    };
    connect();

    return () => {
      alive = false;
      clearInterval(pingTimer);
      clearTimeout(reconnectTimer);
      try { ws && ws.close(); } catch {}
    };
  }, [enabled]);
}
