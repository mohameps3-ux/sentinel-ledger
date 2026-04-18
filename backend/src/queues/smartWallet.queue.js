const { Queue } = require("bullmq");
const { getBullmqConnection } = require("../lib/bullmq");

let smartWalletQueue = null;

function getSmartWalletQueue() {
  if (smartWalletQueue) return smartWalletQueue;
  const connection = getBullmqConnection();
  if (!connection) return null;
  smartWalletQueue = new Queue("smart-wallet-analysis", { connection });
  return smartWalletQueue;
}

module.exports = { getSmartWalletQueue };

