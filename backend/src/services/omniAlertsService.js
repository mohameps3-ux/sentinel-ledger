const { sendTelegramText } = require("../bots/telegramBot");
const { postMarketingTweet } = require("./xMarketing");

async function sendOmniAlert({ title, message, channels = [], severity = "info" }) {
  const normalized = Array.isArray(channels) ? channels : [channels];
  const results = [];

  for (const channel of normalized) {
    if (channel === "telegram") {
      const sent = await sendTelegramText(
        `🚨 ${title}\nSeverity: ${severity}\n\n${message}`
      );
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

