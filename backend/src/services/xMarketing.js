/**
 * Post to X (Twitter) when OAuth 1.0a app + user tokens are configured.
 * https://developer.x.com/en/docs/twitter-api
 */
let cachedClient = null;

function getTwitterWriteClient() {
  const appKey = process.env.TWITTER_API_KEY;
  const appSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;
  if (!appKey || !appSecret || !accessToken || !accessSecret) return null;
  if (cachedClient) return cachedClient;
  try {
    const { TwitterApi } = require("twitter-api-v2");
    cachedClient = new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret
    });
    return cachedClient;
  } catch (e) {
    console.warn("twitter-api-v2 load failed:", e.message);
    return null;
  }
}

/** @returns {Promise<{ ok: boolean, reason?: string, id?: string }>} */
async function postMarketingTweet(text) {
  const client = getTwitterWriteClient();
  if (!client) return { ok: false, reason: "twitter_not_configured" };
  const body = String(text || "").trim();
  if (!body) return { ok: false, reason: "empty_text" };
  const safe = body.length > 280 ? `${body.slice(0, 276)}…` : body;
  try {
    const { data } = await client.v2.tweet(safe);
    return { ok: true, id: data?.id || undefined };
  } catch (e) {
    console.warn("X marketing tweet failed:", e.message);
    return { ok: false, reason: e.message || "tweet_failed" };
  }
}

module.exports = { postMarketingTweet, getTwitterWriteClient };
