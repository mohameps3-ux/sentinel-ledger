const rateLimit = require("express-rate-limit");

/** 100 req / 15 min per IP — public terminal / home data endpoints */
module.exports = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "rate_limit_exceeded" }
});
