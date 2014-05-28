var Boom = require("boom");
var Joi = require("joi");
var Iron = require("iron");
var When = require("when");
var LRU = require("lru-cache");
var Genid = require("genid");
var _ = require("lodash");

var internals = {
  cache: new LRU(255),
  queue: {},
};

exports.exists = {
  auth: false,
  validate: {
    query: {
      username: Joi.string().required()
    }
  },
  handler: function (request, reply) {
    var usernameId = internals.getUsernameId(request.query.username);
    
    this.couch.head(usernameId, function (err, resp) {
      if (err) {
        if (err['status-code'] === 404) return reply(false);
        
        reply(err);
      }
      
      reply(true);
    });
   }
};


exports.lookup = {
  auth: {
    mode: "try",
  },
  handler: function (request, reply) {
    var self = this;
    
    var query = {
      include_docs: true,
      limit: 1,
      startkey: request.params.username,
    };
    
    self.couch.view("users", "by_id", query, function (err, resp) {
      if (err) return reply(err);
      if (!resp.rows.length) return reply(Boom.notFound());
      
      reply(internals.toJSON(resp.rows[0].doc));
    });
  }
};

exports.guest = {
  auth: false,
  handler: function (request, reply) {
    var self = this;
    
    // Step 1: Create a new anonymous user
    internals.createUser(this.couch, {
      type: "guest",
      username: "Anonymous",
      description: "Anonymous user",
      company: "",
      location: "",
      website_url: "",
      emails: [],
      identities: []
    })
    
    .then(internals.toJSON)
    
    // Step 2: Sign the new user record
    .then(function (user) {
      return internals.signUserObject(request.hapi.state, self.config.auth.secret, user);
    })
    
    // Finally: respond with signed user object or error
    .then(function (user) {
      reply(user).code(201);
    }, reply);
  }
};

exports.create = {
  validate: {
    payload: {
      profile: {
        username: Joi.string().min(3).max(40).invalid(["guest", "session", "exists", "guests"]).regex(/^[a-zA-Z0-9][-_a-zA-Z0-9]+[a-zA-Z0-9]+$/).required(),
        description: Joi.string().max(500).allow("").default(""),
        company: Joi.string().max(120).allow("").default(""),
        location: Joi.string().max(120).allow("").default(""),
        website_url: Joi.string().max(255).allow("").default(""),
        emails: Joi.array().includes(Joi.string())
      },
      identities: Joi.array().min(1).includes(Joi.object({
        signature: Joi.string().required(),
        payload: Joi.object({
          service: Joi.string().allow("github", "google", "twitter", "dropbox", "facebook", "stackoverflow"),
          credentials: Joi.string().required(),
          profile: Joi.object({
            id: Joi.string().required(),
            username: Joi.string().allow("").default(""),
            name: Joi.string().allow("").default(""),
            description: Joi.string().allow("").default(""),
            company: Joi.string().allow("").default(""),
            location: Joi.string().allow("").default(""),
            website_url: Joi.string().allow("").default(""),
            profile_url: Joi.string().allow("").default(""),
            picture_url: Joi.object({
              bigger: Joi.string().allow("").default(""),
              mini: Joi.string().allow("").default(""),
              normal: Joi.string().allow("").default("")
            }),
            emails: Joi.array().includes(Joi.string())
          }).required()
        }).required()
      }))
    }
  },
  handler: function (request, reply) {
    var self = this;
    var couch = this.couch;
    
    this.couch.get(internals.getUserId(request.auth.credentials.user_id), function (err, user) {
      if (err) return reply(err);
    
      // Step 1: Check that all identity envelopes are properly signed
      When.map(request.payload.identities, function (envelope) {
        // Make sure each identity was properly signed (so we can trust that the user is who he claims)
        return internals.checkSignedEnvelope(self.config.auth.secret, self.config.auth.macPrefix, envelope)
        .then(function (identity) {
          // Make sure that the identity isn't already associated with another user
          return internals.findUserByIdentity(couch, identity.service, identity.id, false).then(function (user) {
            if (user) return When.reject(Boom.badRequest("User with identity already exists"));
          }).yield(identity);
        });
      })
      
      // Step 2: Create  tomstones to prevent other users from using the same username and identities
      .then(function (identities) {
        return When.promise(function (resolve, reject) {
          // First, create username tombstone
          var username = {
            _id: internals.getUsernameId(request.payload.profile.username),
            user_id: user._id
          };
          
          couch.insert(username, username._id, function (err, userResp) {
            if (err) {
              if (err['status-code'] === 409) return reject(Boom.badRequest("A user with that username already exists"));
              return reject(err);
            }
            
            // OK, username tombstone added, create identity tombstones
            resolve(When.promise(function (resolve, reject) {
              var docs = _.map(identities, function (identity) {
                return {
                  _id: internals.getIdentityId(identity.service, identity.profile.id),
                  service: identity.service,
                  service_user_id: identity.profile.id,
                  user_id: user._id,
                };
              });
            
              couch.bulk({docs: docs}, function (err, resp) {
                if (err) return reject(err);
                
                // If any one of the identities failed to be created, we need to roll all the others back
                var unsuccessful = _.filter(resp, "error");
                
                if (unsuccessful.length) {
                  console.log("[WARN] Failed to create identities:", _.pluck(unsuccessful, "id").join(", "));
                  
                  var successful = _(resp).reject("error").map(function (doc) {
                    return {
                      _id: doc.id,
                      _rev: doc.rev,
                      _deleted: true
                    };
                  }).value();
                  
                  if (successful.length) {
                    couch.bulk({docs: successful}, function (err, resp) {
                      if (err) console.error("[ERR] Failed to roll back new orphan identities:", _.pluck(resp, "id").join(", "));
                      
                      console.log("[OK] Rolled back new orphan identities:", _.pluck(resp, "id").join(", "));
                    });
                  }
                  
                  reject(Boom.badRequest("Users already associated with the provided identities: " + _.pluck(unsuccessful, "id").join(", ")));
                } else {
                  resolve(identities);
                }
              });
            }).catch(function (err) {
              // Something went wrong inserting the identity tombstones, roll-back the username tombstone that was already created
              couch.destroy(userResp.id, userResp.rev, function (err) {
                if (err) console.error("[ERR] Failed to clean up the username tombstone", request.payload.profile.username);
              });
              
              return err;
            }));
          });
        });
      })
  
      // Step 3: Save the new user
      .then(function (identities) {
        _.extend(user, request.payload.profile);
        user.type = "member";
        user.identities = identities;
        
        return internals.createUser(couch, user);
      })
      
      .then(internals.toJSON)
      
      // Step 4: Sign the user object
      .then(function (user) {
        return internals.signUserObject(request.hapi.state, self.config.auth.secret, user);
      })
      
      // Finally: respond with signed user object or error
      .then(function (user) {
        reply(user).code(201);
      }, reply);
    });
  }
};

exports.session = {
  auth: false,
  validate: {
    query: {
      credentials: Joi.string().required()
    }
  },
  handler: function (request, reply) {
    var self = this;
    var couch = this.couch;
    
    Iron.unseal(request.query.credentials, self.config.auth.secret, Iron.defaults, function (err, unsealed) {
      if (err) return reply(err);
      
      internals.findUserByIdentity(couch, unsealed.service, unsealed.id, true).then(function (user) {
        if (!user) return;
        
        return internals.signUserObject(request.hapi.state, self.config.auth.secret, internals.toJSON(user));
      }).then(reply, reply);
    });
  }
};

exports.joinUsers = function (couch, fields, plunk) {
  return When.promise(function (resolve, reject) {
    var users = {};
    var addUser = function (obj) {
      var userId = internals.getUserId(obj.user_id);
      
      if (!users[userId]) users[userId] = {};
      
      obj.user = users[userId];
      delete obj.user_id;
    };
    
    addUser(plunk);
      
    if (fields) _.forEach(fields, function (field) {
      _.forEach(plunk[field], addUser);
    });
      
    couch.fetch({keys: _.keys(users)}, function (err, usersResp) {
      if (err) return reject(err);
      
      _.forEach(usersResp.rows, function (row) {
        var user = row.doc;
        
        users[user._id].id = user._id.slice(2);
        users[user._id].username = user.username;
      });
      
      resolve(plunk);
    });
  });
};

exports.joinUsersBulk = function (couch, fields, plunks) {
  return When.promise(function (resolve, reject) {
    var users = {};
    var addUser = function (obj) {
      var userId = internals.getUserId(obj.user_id);
      
      if (!users[userId]) users[userId] = {};
      
      obj.user = users[userId];
      delete obj.user_id;
    };
    
    _.forEach(plunks, function (plunk) {
      addUser(plunk);
      
      if (fields) _.forEach(fields, function (field) {
        _.forEach(plunk[field], addUser);
      });
    });
    
    couch.fetch({keys: _.keys(users)}, function (err, usersResp) {
      if (err) return reject(err);
      
      _.forEach(usersResp.rows, function (row) {
        var user = row.doc;
        
        users[user._id].id = user._id.slice(2);
        users[user._id].username = user.username;
      });
      
      resolve(plunks);
    });
  });
};

exports.fetchByName = function (username) {
  var self = this;
  var query = {
    include_docs: true,
    limit: 1,
    startkey: username,
  };
  
  return When.promise(function (resolve, reject) {
    self.couch.view("users", "by_id", query, function (err, resp) {
      if (err) return reject(err);
      if (!resp.rows.length) return reject(Boom.notFound());
      
      resolve(internals.toJSON(resp.rows[0].doc));
    });
  });
};

exports.fetch = function (userId) {
  var couch = this.couch;
  var cached = internals.cache.get(userId);
  var dbUserId = internals.getUserId(userId);
  
  if (cached) {
    return When.resolve(cached);
  }
  if (internals.queue[dbUserId]) {
    return internals.queue[dbUserId].promise;
  }
  
  var dfd = internals.queue[dbUserId] = When.defer();
  
  if (!internals.batch) {
    internals.batch = true;
    
    process.nextTick(function () {
      var batch = _.clone(internals.queue);
      
      internals.queue = {};
      internals.batch = false;
      
      couch.fetch({keys: _.keys(batch)}, function (err, usersResp) {
        if (err) {
          return _.invoke(batch, "reject", err);
        }
        
        _.forEach(usersResp.rows, function (row) {
          var dbId = row.doc._id;
          var user = {
            id: dbId.slice(2),
            username: row.doc.username,
            type: row.doc.type,
          };
          
          internals.cache.set(user.id, user);
          
          if (batch[dbId]) batch[dbId].resolve(user);
        });
      });
    }, 1);
  }
  
  return dfd.promise;
};

internals.findUserByIdentity = function (couch, service, service_user_id, include_docs) {
  if (typeof include_docs === "undefined") include_docs = true;
  
  return When.promise(function (resolve, reject) {
    couch.view("users", "by_identity", { key: [service, service_user_id], include_docs: !!include_docs }, function (err, resp) {
      
      if (err) {
        if (err['status-code'] === 404) return resolve(null);
        return reject(err);
      }
      
      if (!resp.rows.length) return resolve(null);
      
      return resolve(resp.rows[0].doc);
    });
  });  
};


internals.createUser = function (couch, user, callback) {
  var now = new Date();
  
  if (!user._id) user._id = internals.getUserId(Genid(16));
  if (!user.created_at) user.created_at = now;
  user.updated_at = now;
  
  return When.promise(function (resolve, reject) {
    couch.insert(user, user._id, function (err, resp) {
      if (err) return reject(err);
      
      resolve(user);
    });
  });
};

internals.signUserObject = function (state, secret, user, callback) {
  return When.promise(function (resolve, reject) {
    state.prepareValue("plnuker.tok", {
      login_at: Date.now(),
      user_type: user.type,
      user_id: user.id,
      user_name: user.username
    }, {
      ttl: 24 * 60 * 60 * 1000,     // One day
      isSecure: false,
      path: '/',
      encoding: 'iron',
      password: secret
    }, function (err, credentials) {
      if (err) return reject(err);
  
      resolve({
        user: user,
        credentials: credentials
      });
    });
  });
};

/**
 * Create a signed json envelope for the provided payload
 **/
internals.encodeAndSign = function (secret, macPrefix, json, callback) {
  var stringified = null;
  
  try {
    stringified = JSON.stringify(json);
  } catch (e) {
    return callback(e);
  }
  
  Iron.hmacWithPassword(secret, Iron.defaults.integrity, [macPrefix, stringified].join("\n"), function (err, mac) {
    if (err) return callback(err);
    
    var envelope = {
      payload: json,
      signature: mac.salt + "+" + mac.digest
    };
    
    callback(null, envelope);
  });
};

internals.checkSignedEnvelope = function (secret, macPrefix, envelope) {
  return When.promise(function (resolve, reject) {
    var parts = envelope.signature.split("+");
    
    if (parts.length !== 2) return reject(Boom.internal("Invalid signature"));
    
    var signature = parts[1];
    var integrity = Iron.defaults.integrity;
    var stringified = null;
    
    integrity.salt = parts[0];
    
    stringified = JSON.stringify(envelope.payload);
    
    Iron.hmacWithPassword(secret, Iron.defaults.integrity, [macPrefix, stringified].join("\n"), function (err, mac) {
      if (err) return reject(err);
      if (mac.digest !== signature) return reject(Boom.badRequest("Identity envelope invalid"));
      
      return resolve(envelope.payload);
    });
  });
};

internals.getCollectionId = function (collId) { return "g/" + collId; };
internals.getCommentId = function (commentId) { return "c/" + commentId; };
internals.getObjectId = function (plunkId) { return "o/" + plunkId; };
internals.getPlunkId = function (plunkId) { return "p/" + plunkId; };
internals.getUserId = function (userId) { return "u/" + userId; };
internals.getUsernameId = function (username) { return "n/" + username; };
internals.getIdentityId = function (service, service_user_id) { return "i/" + service + "/" + service_user_id; };

internals.toJSON = function (json) {
  json = _.clone(json);
  
  json.id = json._id.slice(2); // Drop off the p/ prefix
  
  delete json._id;
  delete json._rev;
  delete json._revisions;
  
  return json;
};

