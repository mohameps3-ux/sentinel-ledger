import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

async function withOpsKey(path, opsKey, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-ops-key": opsKey,
      ...(options.headers || {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "request_failed");
  return body;
}

export default function OpsPage() {
  const [opsKey, setOpsKey] = useState("");
  const [tickets, setTickets] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("sentinel-ops-key");
    if (saved) setOpsKey(saved);
  }, []);

  const hasKey = useMemo(() => opsKey.trim().length > 0, [opsKey]);

  const saveKey = () => {
    localStorage.setItem("sentinel-ops-key", opsKey.trim());
    toast.success("Ops key saved locally.");
  };

  const loadData = async () => {
    if (!hasKey) return toast.error("Set your ops key first.");
    setLoading(true);
    try {
      const [ticketRes, eventRes] = await Promise.all([
        withOpsKey("/api/v1/bots/omni/tickets?limit=50", opsKey),
        withOpsKey("/api/v1/bots/omni/events?limit=100", opsKey)
      ]);
      setTickets(ticketRes.data || []);
      setEvents(eventRes.data || []);
      toast.success("Ops data refreshed.");
    } catch (error) {
      toast.error(`Load failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const setTicketStatus = async (ticketId, status) => {
    try {
      await withOpsKey(`/api/v1/bots/omni/tickets/${ticketId}`, opsKey, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status } : t)));
      toast.success("Ticket updated.");
    } catch (error) {
      toast.error(`Update failed: ${error.message}`);
    }
  };

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    try {
      await withOpsKey("/api/v1/bots/omni/alerts/broadcast", opsKey, {
        method: "POST",
        body: JSON.stringify({
          title: "Sentinel Ops Broadcast",
          message: broadcastMsg.trim(),
          channels: ["telegram"],
          severity: "info"
        })
      });
      setBroadcastMsg("");
      toast.success("Broadcast sent.");
    } catch (error) {
      toast.error(`Broadcast failed: ${error.message}`);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
      <section className="glass-card p-5">
        <h1 className="text-2xl font-bold mb-3">Omni Ops Console</h1>
        <div className="grid md:grid-cols-[1fr_auto_auto] gap-2">
          <input
            type="password"
            value={opsKey}
            onChange={(e) => setOpsKey(e.target.value)}
            placeholder="Paste OMNI_BOT_OPS_KEY"
            className="h-11 rounded-xl bg-[#0E1318] border soft-divider px-3 text-sm focus:outline-none focus:border-purple-500"
          />
          <button onClick={saveKey} className="h-11 px-4 rounded-xl border soft-divider hover:bg-white/5 transition">
            Save Key
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="h-11 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 font-semibold hover:opacity-90 transition"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="text-lg font-semibold mb-3">Broadcast Alert</h2>
        <div className="grid md:grid-cols-[1fr_auto] gap-2">
          <input
            value={broadcastMsg}
            onChange={(e) => setBroadcastMsg(e.target.value)}
            placeholder="Message to send through omni channels..."
            className="h-10 rounded-xl bg-[#0E1318] border soft-divider px-3 text-sm focus:outline-none focus:border-purple-500"
          />
          <button
            onClick={sendBroadcast}
            className="h-10 px-4 rounded-xl bg-[#13171A] border soft-divider hover:bg-white/5 transition"
          >
            Send
          </button>
        </div>
      </section>

      <section className="grid xl:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Support Tickets</h2>
          {!tickets.length ? (
            <div className="text-sm text-gray-500">No tickets loaded.</div>
          ) : (
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {tickets.map((t) => (
                <div key={t.id} className="bg-[#0E1318] border soft-divider rounded-xl p-3">
                  <div className="flex justify-between gap-3 text-xs text-gray-500 mb-1">
                    <span>{t.channel}</span>
                    <span>{new Date(t.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-sm text-gray-200">{t.user_message}</div>
                  <div className="text-xs text-gray-400 mt-1">Intent: {t.intent}</div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setTicketStatus(t.id, "open")}
                      className={`px-2 py-1 rounded-lg text-xs border ${t.status === "open" ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "soft-divider text-gray-400"}`}
                    >
                      Open
                    </button>
                    <button
                      onClick={() => setTicketStatus(t.id, "resolved")}
                      className={`px-2 py-1 rounded-lg text-xs border ${t.status === "resolved" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "soft-divider text-gray-400"}`}
                    >
                      Resolved
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Bot Events</h2>
          {!events.length ? (
            <div className="text-sm text-gray-500">No events loaded.</div>
          ) : (
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {events.map((ev) => (
                <div key={ev.id} className="bg-[#0E1318] border soft-divider rounded-xl p-3">
                  <div className="flex justify-between gap-3 text-xs text-gray-500 mb-1">
                    <span>{ev.channel}</span>
                    <span>{new Date(ev.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-sm text-gray-200">{ev.message}</div>
                  <div className="text-xs text-gray-400 mt-1">Intent: {ev.intent}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

