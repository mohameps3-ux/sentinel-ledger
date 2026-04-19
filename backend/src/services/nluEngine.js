const { detectIntent } = require("./nlu/detector");
const { executeIntent } = require("./nlu");
const { formatNluResponse } = require("./nlu/formatter");

module.exports = { detectIntent, executeIntent, formatNluResponse };

