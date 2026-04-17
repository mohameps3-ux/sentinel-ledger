const cron = require("node-cron");
const { expireStaleSubscriptions } = require("./subscriptionService");

function startSubscriptionExpiryCron() {
  cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        await expireStaleSubscriptions();
        console.log("subscription expiry cron: ok");
      } catch (e) {
        console.error("subscription expiry cron:", e.message || e);
      }
    },
    { timezone: "UTC" }
  );
  console.log("Subscription expiry cron scheduled (00:00 UTC daily).");
}

module.exports = { startSubscriptionExpiryCron };
