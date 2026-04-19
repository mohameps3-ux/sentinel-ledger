function fromText(text) {
  const t = String(text || "").toLowerCase();
  const tags = new Set();
  if (!t) return tags;

  if (/(ai|agent|gpt|llm|neural|bot)/i.test(t)) tags.add("AI");
  if (/(defi|dex|yield|swap|liquidity|staking|lend)/i.test(t)) tags.add("DeFi");
  if (/(game|gaming|play|nft)/i.test(t)) tags.add("Gaming");
  if (/(meme|moon|pepe|degen)/i.test(t)) tags.add("Meme");
  if (/(rwa|real world|treasury|bond|commodity)/i.test(t)) tags.add("RWA");
  if (/(l2|layer ?2|rollup|zk|optimism|arbitrum|base)/i.test(t)) tags.add("L2");
  if (/(dog|shib|inu|bonk|wif)/i.test(t)) tags.add("Dog");
  if (/(cat|meow|kitty|popcat)/i.test(t)) tags.add("Cat");
  return tags;
}

function detectNarrativeTags({ name, symbol, websites = [], socials = [] } = {}) {
  const tags = new Set();
  const merged = [name, symbol, ...(websites || []), ...(socials || [])].filter(Boolean).join(" ");
  for (const tag of fromText(merged)) tags.add(tag);
  if (!tags.size) tags.add("Meme");
  return [...tags];
}

module.exports = { detectNarrativeTags };

