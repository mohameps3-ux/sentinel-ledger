const { sendTelegramText, sendTelegramPhoto, sendTelegramVideo } = require("../bots/telegramBot");
const { postMarketingTweet } = require("./xMarketing");
const { validatePublicHttpsMediaUrl } = require("../lib/publicMediaUrl");

async function sendOmniAlert({ title, message, channels = [], severity = "info", mediaType, mediaUrl }) {
  const normalized = Array.isArray(channels) ? channels : [channels];
  const results = [];

  const mt = String(mediaType || "").toLowerCase();
  const photoOrVideo = mt === "photo" || mt === "video" ? mt : null;
  const mediaHref = photoOrVideo ? validatePublicHttpsMediaUrl(mediaUrl) : null;

  for (const channel of normalized) {
    if (channel === "telegram") {
      const caption = `🚨 ${title}\nSeverity: ${severity}\n\n${message}`.trim().slice(0, 1024);
      let sent = false;
      if (photoOrVideo === "photo") {
        if (!mediaHref) {
          results.push({ channel, sent: false, reason: "invalid_media_url" });
          continue;
        }
        sent = await sendTelegramPhoto(mediaHref, caption);
      } else if (photoOrVideo === "video") {
        if (!mediaHref) {
          results.push({ channel, sent: false, reason: "invalid_media_url" });
          continue;
        }
        sent = await sendTelegramVideo(mediaHref, caption);
      } else {
        if (!String(message || "").trim()) {
          results.push({ channel, sent: false, reason: "message_required" });
          continue;
        }
        sent = await sendTelegramText(`🚨 ${title}\nSeverity: ${severity}\n\n${message}`);
      }
      results.push({ channel, sent });
      continue;
    }

    if (channel === "x" || channel === "twitter") {
      const line = `🛰️ ${title} · ${severity}\n\n${message}`.trim();
      const r = await postMarketingTweet(line);
      results.push({
        channel: "x",
        sent: r.ok,
        id: r.id,
        reason: r.reason
      });
      continue;
    }

    results.push({ channel, sent: false, reason: "adapter_not_configured" });
  }

  return results;
}

module.exports = { sendOmniAlert };

