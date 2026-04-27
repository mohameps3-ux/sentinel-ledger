"use strict";

const crypto = require("crypto");
const { getSupabase } = require("../lib/supabase");

const TRIAL_HOURS = 24;
const COOLDOWN_DAYS = 30;
const SALT = process.env.TRIAL_SALT || "sentinel-trial-v1";

function getClient() {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

function hashValue(value) {
  return crypto
    .createHash("sha256")
    .update(String(value) + SALT, "utf8")
    .digest("hex");
}

function timeRemaining(expiresAt) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) {
    return { hoursLeft: 0, minutesLeft: 0, secondsLeft: 0, isCritical: false };
  }
  return {
    hoursLeft: Math.floor(diff / 3600000),
    minutesLeft: Math.floor((diff % 3600000) / 60000),
    secondsLeft: Math.floor((diff % 60000) / 1000),
    isCritical: diff < 3600000
  };
}

async function getTrialStatus(ip, fingerprintHash = null) {
  const supabase = getClient();
  if (!supabase) {
    return { status: "none", eligible: true };
  }

  const ipHash = hashValue(String(ip || "unknown"));
  const now = new Date();

  let { data } = await supabase.from("guest_trials").select("*").eq("ip_hash", ipHash).maybeSingle();

  if (!data && fingerprintHash) {
    const { data: fpData } = await supabase
      .from("guest_trials")
      .select("*")
      .eq("fingerprint_hash", String(fingerprintHash).slice(0, 64))
      .maybeSingle();
    data = fpData;
  }

  if (!data) return { status: "none", eligible: true };

  const expiresAt = new Date(data.expires_at);
  const cooldownEnd = new Date(new Date(data.started_at).getTime() + COOLDOWN_DAYS * 86400000);

  if (now < expiresAt) {
    return {
      status: "active",
      eligible: false,
      expiresAt: data.expires_at,
      trialId: data.id,
      ...timeRemaining(data.expires_at)
    };
  }

  if (now < cooldownEnd) {
    return { status: "expired", eligible: false, cooldownEnds: cooldownEnd.toISOString() };
  }

  return { status: "eligible_again", eligible: true, trialId: data.id };
}

async function startTrial(ip, fingerprintHash = null) {
  const supabase = getClient();
  if (!supabase) {
    return { ok: false, reason: "db_unavailable" };
  }

  const ipHash = hashValue(String(ip || "unknown"));
  const existing = await getTrialStatus(ip, fingerprintHash);

  if (!existing.eligible) {
    return { ok: false, reason: existing.status, ...existing };
  }

  const expiresAt = new Date(Date.now() + TRIAL_HOURS * 3600000);
  const { data, error } = await supabase
    .from("guest_trials")
    .upsert(
      {
        ip_hash: ipHash,
        fingerprint_hash: fingerprintHash ? String(fingerprintHash).slice(0, 64) : null,
        started_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        converted: false,
        converted_at: null
      },
      { onConflict: "ip_hash" }
    )
    .select()
    .single();

  if (error) {
    console.warn("[guestTrial] upsert", error.message);
    return { ok: false, reason: "db_error" };
  }

  return {
    ok: true,
    status: "active",
    expiresAt: data.expires_at,
    trialId: data.id,
    hoursLeft: TRIAL_HOURS,
    minutesLeft: 0,
    secondsLeft: 0,
    isCritical: false
  };
}

async function markConverted(ip) {
  const supabase = getClient();
  if (!supabase) return;
  await supabase
    .from("guest_trials")
    .update({ converted: true, converted_at: new Date().toISOString() })
    .eq("ip_hash", hashValue(String(ip || "unknown")));
}

module.exports = { getTrialStatus, startTrial, markConverted, hashValue, timeRemaining };
