var Hoek = require("hoek");
var Boom = require("boom");
var Nano = require("nano");
var Iron = require("iron");
var Crypto = require("crypto");

var Plunks = require("./resources/plunks");
var Trees = require("./resources/trees");
var Users = require("./resources/users");
var Collections = require("./resources/collections");
var Packages = require("./resources/packages");

var internals = {};


exports.name = "api";
exports.version = require("./package.json").version;
exports.path = __dirname;

var emit, index, toJSON; // Silence warnings for undefined functions for couchdb design docs

exports.register = function (plugin, options, next) {
  var context = {
    config: options.config,
    methods: plugin.methods,
    //db: Mongoskin.db(options.config.database.mongodb.url),
    couch: Nano({
      url: options.config.database.cloudant.url,
      request_defaults: { proxy: options.config.proxy }
    })
  };

  plugin.bind(context);
  
  Users.couch = context.couch;
  
  internals.ensureDesignDoc(context.couch, "plunk", {
    indexes: {
      plunks: {
        analyzer: {
          "name": "perfield",
          "default": "english",
          "fields": {
            tags: "keyword",
            packages: "keyword",
            packages_ver: "keyword",
            collections: "keyword",
          }
        },
        index: function (doc) {
          if (doc._id.slice(0,2) == "p/" && !doc.deleted_at) {
            var i;
            
            index("default", doc.description + "\n" + (doc.readme || ""));
            index("description", doc.description || "");
            index("readme", doc.readme || "");
            index("user", doc.user_id || "");
            
            for (i in doc.tags) {
              index("tags", doc.tags[i].toLowerCase());
            }
            
            for (i in doc.packages) {
              index("packages", doc.packages[i].name.toLowerCase());
              index("packages_ver", doc.packages[i].name.toLowerCase() + "@" + doc.packages[i].semver);
            }
            
            for (i in doc.collections) {
              index("collections", doc.collections[i].toLowerCase());
            }
          }
        }
      },
    },
    views: {
      plunk_comments: {
        map: function (doc) {
          if (doc.type == 'comment' && !doc.deleted_at) {
            emit([doc.plunk_id, doc.updated_at], null);
          }
        },
      },
    },
    updates: {
      destroy: function (doc, req) {
        doc.deleted_at = new Date();
        
        return [doc, doc.deleted_at];
      },
      increment_comments: function (doc, req) {
        doc.comments_count++;
        
        return [doc, toJSON(doc)];
      }
    }
  }, function (err, ddoc) {
    Hoek.assert(!err, "Unable to create design doc", err);
    
    console.log("[OK] Design doc synced: plunks");
  });
  
  internals.ensureDesignDoc(context.couch, "users", {
    views: {
      by_identity: {
        map: function (doc) {
          if (doc._id.slice(0, 2) === 'i/') {
            emit([doc.service, doc.service_user_id], { _id: doc.user_id });
          }
        }
      },
      by_id: {
        map: function (doc) {
          if (doc._id.slice(0, 2) === 'n/') {
            emit(doc._id.slice(2), { _id: doc.user_id });
          }
        }
      },
    },
  }, function (err, ddoc) {
    Hoek.assert(!err, "Unable to create design doc", err);
    
    console.log("[OK] Design doc synced: users");
  });
  
  internals.ensureDesignDoc(context.couch, "collections", {
    views: {
      by_user: {
        map: function (doc) {
          if (doc._id.slice(0, 2) === 'g/') {
            emit(doc.user_id, null);
          }
        }
      },
    },
  }, function (err, ddoc) {
    Hoek.assert(!err, "Unable to create design doc", err);
    
    console.log("[OK] Design doc synced: collections");
  });
  
  internals.ensureDesignDoc(context.couch, "packages", {
    updates: {
      increment_usage: function (doc, req) {
        var body = JSON.parse(req.body);
        var inc = parseInt(body.inc || "0", 10);
        doc.plunks_count += inc;
        
        if (doc.plunks_count < 0) doc.plunks_count = 0;
        
        return [doc, toJSON(doc)];
      }
    },
  }, function (err, ddoc) {
    Hoek.assert(!err, "Unable to create design doc", err);
    
    console.log("[OK] Design doc synced: packages");
  });

  plugin.auth.scheme("plunker", function (server, options) {
    return {
      authenticate: function (request, reply) {
        if (!request.query.token) return reply(Boom.unauthorized());
        
        Iron.unseal(request.query.token, options.secret, Iron.defaults, function (err, unsealed) {
          if (err) return reply(err);
          
          delete request.query.token;
          
          reply(null, {
            credentials: unsealed
          });
        });
      }
    };
  });
  
  plugin.auth.strategy("plunker", "plunker", false, {
    secret: options.config.auth.secret
  });
  
  var basePath = options.config.server.api.path || "";
  
  // Routes for Plunk-specific endpoints
  plugin.route({method: 'POST', path: basePath + '/plunks', config: Plunks.create });
  plugin.route({method: 'GET', path: basePath + '/plunks', config: Plunks.search });
  plugin.route({method: 'GET', path: basePath + '/plunks/{plunkId}', config: Plunks.lookup });
  plugin.route({method: 'DELETE', path: basePath + '/plunks/{plunkId}', config: Plunks.remove });
  plugin.route({method: 'POST', path: basePath + '/plunks/{plunkId}/revisions', config: Plunks.revise });
  //plugin.route({method: 'POST', path: basePath + '/plunks/{plunkId}/releases', config: Plunks.release });
  plugin.route({method: 'POST', path: basePath + '/plunks/{plunkId}/forks', config: Plunks.fork });
  plugin.route({method: 'GET', path: basePath + '/plunks/{plunkId}/comments', config: Plunks.listComments });
  plugin.route({method: 'POST', path: basePath + '/plunks/{plunkId}/comments', config: Plunks.comment });
  plugin.route({method: 'POST', path: basePath + '/plunks/{plunkId}/collections', config: Plunks.publish });
 
  // Routes for Tree-specific endpoints
  plugin.route({method: 'GET', path: basePath + '/trees/{sha}', config: Trees.lookup });
  
  // Routes for User-specific endpoints
  plugin.route({method: 'GET', path: basePath + '/users/session', config: Users.session });
  plugin.route({method: 'GET', path: basePath + '/users/exists', config: Users.exists });
  plugin.route({method: 'POST', path: basePath + '/users/guests', config: Users.guest });
  plugin.route({method: 'POST', path: basePath + '/users', config: Users.create });
  plugin.route({method: 'GET', path: basePath + '/users/{username}', config: Users.lookup });
  plugin.route({method: 'GET', path: basePath + '/users/{username}/collections', config: Collections.listCollections });
  plugin.route({method: 'POST', path: basePath + '/users/{username}/collections', config: Collections.create });
  plugin.route({method: 'GET', path: basePath + '/users/{username}/collections/{collname}', config: Collections.read });
  plugin.route({method: 'POST', path: basePath + '/users/{username}/collections/{collname}', config: Collections.update });
  plugin.route({method: 'DELETE', path: basePath + '/users/{username}/collections/{collname}', config: Collections.remove });
  
  plugin.route({method: 'POST', path: basePath + '/packages', config: Packages.create });
  plugin.route({method: 'GET', path: basePath + '/packages', config: Packages.search });
  plugin.route({method: 'GET', path: basePath + '/packages/{packageName}', config: Packages.read });
  plugin.route({method: 'POST', path: basePath + '/packages/{packageName}', config: Packages.update });
  plugin.route({method: 'DELETE', path: basePath + '/packages/{packageName}', config: Packages.destroy });
  plugin.route({method: 'POST', path: basePath + '/packages/{packageName}/versions', config: Packages.addVersion });
  plugin.route({method: 'GET', path: basePath + '/packages/{packageName}/versions/{semver}', config: Packages.readVersion });
  plugin.route({method: 'POST', path: basePath + '/packages/{packageName}/versions/{semver}', config: Packages.updateVersion });
  plugin.route({method: 'DELETE', path: basePath + '/packages/{packageName}/versions/{semver}', config: Packages.destroyVersion });
  
  plugin.method({
    name: "updateUsage",
    fn: Packages.updateUsage,
    options: {
      bind: context,
    },
  });
  
  plugin.method({
    name: "loadHashRecursive",
    fn: Trees.loadHashRecursive,
    options: {
      bind: context,
      cache: {
        expiresIn: 1000 * 60 * 60 * 24
      }
    }
  });
  

  // Plugin is ready to rock
  next();
};

internals.prepareDesignDoc = function (x) {
  var i;
  var ddoc = {};
  
  for (i in x) {
    if (i[0] != '_') {
      if (typeof x[i] == 'function') {
        ddoc[i] = x[i].toString().replace(/\s+/gm, " ");
        ddoc[i] = 'function '+ddoc[i].slice(ddoc[i].indexOf('('));
      } else if (typeof x[i] == 'object') {
        ddoc[i] = internals.prepareDesignDoc(x[i]);
      } else {
        ddoc[i] = x[i];
      }
    }
  }

  return ddoc;
};

internals.ensureDesignDoc = function (couch, name, ddoc, callback) {
  var id = "_design/" + name;
  
  ddoc = internals.prepareDesignDoc(ddoc);
  ddoc.signature = Crypto.createHash("md5").update(JSON.stringify(ddoc)).digest("hex");
  
  couch.get(id, function (err, body) {
    if (err && err.message != "missing") return callback(err);
    
    if (body && body._rev) ddoc._rev = body._rev;
    
    couch.insert(ddoc, id, callback);
  });
};