const { execSync } = require("node:child_process");
const Stripe = require("stripe");

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" });
}

async function main() {
  const vars = JSON.parse(run("railway variable list --json"));
  const stripe = new Stripe(vars.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  const targetUrl = `https://${vars.RAILWAY_PUBLIC_DOMAIN}/api/v1/stripe-webhook`;
  const events = [
    "checkout.session.completed",
    "invoice.paid",
    "customer.subscription.deleted"
  ];

  const created = await stripe.webhookEndpoints.create({
    url: targetUrl,
    enabled_events: events,
    description: "Sentinel Ledger production webhook"
  });

  const secretEscaped = String(created.secret || "").replace(/"/g, '\\"');
  run(`railway variable set STRIPE_WEBHOOK_SECRET="${secretEscaped}"`);

  const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
  for (const ep of endpoints.data) {
    if (ep.id !== created.id && ep.status === "enabled") {
      await stripe.webhookEndpoints.update(ep.id, { disabled: true });
    }
  }

  console.log(`WEBHOOK_READY ${created.id} ${created.url}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

