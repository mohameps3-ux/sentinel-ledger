const crypto = require("crypto");

/**
 * Verifies Telegram Login Widget payload per
 * https://core.telegram.org/widgets/login
 */
function verifyTelegramLoginWidget(authData, botToken) {
  if (!authData || !botToken || !authData.hash)
    return { ok: false, reason: "missing_fields" };

  const { hash, ...rest } = authData;
  const dataCheckString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (hmac !== hash) return { ok: false, reason: "bad_hash" };

  const authDate = Number(authData.auth_date);
  if (!Number.isFinite(authDate)) return { ok: false, reason: "bad_auth_date" };
  const ageSec = Math.abs(Date.now() / 1000 - authDate);
  if (ageSec > 24 * 60 * 60) return { ok: false, reason: "auth_expired" };

  const id = String(authData.id || "");
  if (!id) return { ok: false, reason: "missing_telegram_id" };

  return { ok: true, telegramUserId: id, username: authData.username || null };
}

module.exports = { verifyTelegramLoginWidget };
