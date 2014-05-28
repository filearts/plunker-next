var Hapi = require("hapi");
var Hoek = require("hoek");

var Config = require("./config." + (process.env.NODE_ENV || "development"));


var api = new Hapi.Server(Config.server.api.host, Config.server.api.port, { cors: true });

api.pack.require({
  "./servers/api": { config: Config },
  "./servers/run": { config: Config },
  "./servers/web": { config: Config },
}, function (err) {

  Hoek.assert(!err, "[ERR] Failed loading API server:", err);
  
  api.start(function () {
    console.log("[OK] Server started");
  });
});

api.pack.require("good", {
  subscribers: { console: ['ops', 'request', 'log', 'error'] }
}, function (err) {
  if (err) console.error("[ERR] Failed to load good", err);
});
