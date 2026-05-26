"use strict";

/**
 * JSON.stringify that survives BigInt and circular structures (ops agent context).
 * @param {unknown} value
 * @param {number} [maxLen]
 * @returns {string}
 */
function safeJsonStringify(value, maxLen = 500_000) {
  const seen = new WeakSet();
  let json;
  try {
    json = JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === "bigint") return val.toString();
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) return "[Circular]";
          seen.add(val);
        }
        return val;
      },
      2
    );
  } catch (e) {
    json = JSON.stringify({
      safeJsonError: e?.message || String(e),
      preview: String(value)?.slice(0, 2000)
    });
  }
  if (json.length > maxLen) {
    return `${json.slice(0, maxLen)}\n…[truncated ${json.length - maxLen} chars]`;
  }
  return json;
}

module.exports = { safeJsonStringify };
