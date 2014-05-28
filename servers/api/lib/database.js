var Mongoskin = require("mongoskin");

exports.connect = function (config) {
  return Mongoskin.db(config.url, config.options);
};