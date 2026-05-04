/** Ref-counted join-token / leave-token for the shared score socket (ScoreSocketProvider). */

let activeSocket = null;
const refCounts = new Map();

/** Re-send join-token for all subscribed mints (after socket connect or late bind). */
export function replayScoreRoomJoins() {
  const ws = activeSocket;
  if (!ws || !ws.connected) return;
  for (const [mint, count] of refCounts) {
    if (count > 0) {
      try {
        ws.emit("join-token", mint);
      } catch (_) {}
    }
  }
}

export function bindScoreRoomSocket(socket) {
  activeSocket = socket;
}

export function acquireScoreRoom(mint) {
  const m = String(mint || "").trim();
  if (!m) {
    return () => {};
  }
  const ws = activeSocket;
  const next = (refCounts.get(m) || 0) + 1;
  refCounts.set(m, next);
  if (next === 1 && ws) {
    try {
      ws.emit("join-token", m);
    } catch (_) {}
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const c = (refCounts.get(m) || 1) - 1;
    if (c <= 0) {
      refCounts.delete(m);
      if (activeSocket) {
        try {
          activeSocket.emit("leave-token", m);
        } catch (_) {}
      }
    } else {
      refCounts.set(m, c);
    }
  };
}
