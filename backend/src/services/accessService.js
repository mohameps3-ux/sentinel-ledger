"use strict";

const { getTrialStatus } = require("./guestTrialService");

async function hasProAccess(req, userIsPro = false) {
  if (userIsPro) return true;
  try {
    const ip = req.ip;
    const fingerprintHash = req.headers["x-fp-hash"] || null;
    const trial = await getTrialStatus(ip, fingerprintHash);
    return trial.status === "active";
  } catch {
    return false;
  }
}

module.exports = { hasProAccess };
