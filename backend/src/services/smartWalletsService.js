// Back-compat wrapper around smart money lookup.
// Kept to match expected filename in docs/checklists.

const { getSmartWalletsForToken } = require("./smartMoneyService");

module.exports = { getSmartWalletsForToken };

