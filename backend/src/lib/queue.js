const { Queue } = require("bullmq");
const { getBullmqConnection } = require("./bullmq");

function makeConnection() {
  return getBullmqConnection();
}

const connection = makeConnection();
const deployerQueue = connection
  ? new Queue("deployer-analysis", { connection })
  : null;

module.exports = { deployerQueue, makeConnection };
