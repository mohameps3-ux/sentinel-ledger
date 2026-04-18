const { getSupabase } = require("../lib/supabase");

/** Insert event id; returns false if already processed (duplicate delivery). */
async function tryClaimStripeEvent(eventId, eventType) {
  const supabase = getSupabase();
  const candidates = [
    // Preferred schema (from SQL migrations in this repo)
    { stripe_event_id: eventId, event_type: eventType },
    // Same preferred schema but with optional received_at
    { stripe_event_id: eventId, event_type: eventType, received_at: new Date().toISOString() },
    // Legacy schema fallback
    { id: eventId, type: eventType },
    // Legacy schema with optional received_at
    { id: eventId, type: eventType, received_at: new Date().toISOString() }
  ];

  let lastError = null;
  for (const payload of candidates) {
    const { error } = await supabase.from("stripe_events").insert(payload);
    if (!error) return true;
    if (error?.code === "23505") return false;
    lastError = error;
  }
  throw lastError;
}

async function releaseStripeEventClaim(eventId) {
  const supabase = getSupabase();
  let { error } = await supabase.from("stripe_events").delete().eq("stripe_event_id", eventId);
  if (error) {
    ({ error } = await supabase.from("stripe_events").delete().eq("id", eventId));
    if (error) console.error("stripe_events release:", error.message);
  }
}

async function markStripeEventProcessed(eventId) {
  const supabase = getSupabase();
  let { error } = await supabase
    .from("stripe_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("stripe_event_id", eventId);
  if (error) {
    ({ error } = await supabase
      .from("stripe_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", eventId));
  }
  if (error) throw error;
}

/** Best-effort audit row (never throws). */
async function appendSystemLog({ category, message, metadata }) {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("system_logs").insert({
      category,
      message,
      metadata: metadata || null
    });
    if (error) console.error("system_logs insert:", error.message);
  } catch (e) {
    console.error("system_logs insert:", e.message || e);
  }
}

module.exports = {
  tryClaimStripeEvent,
  releaseStripeEventClaim,
  markStripeEventProcessed,
  appendSystemLog
};
