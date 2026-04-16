const { sendTelegramText } = require("../bots/telegramBot");

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

    // Reserved channels for next phase adapters.
    results.push({ channel, sent: false, reason: "adapter_not_configured" });
  }

  return results;
}

module.exports = { sendOmniAlert };

