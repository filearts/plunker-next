var Joi = require("joi");
var Boom = require("boom");
var When = require("when");
var _ = require("lodash");

var Users = require("./users");

var internals = {};

exports.create = {
  validate: {
    payload: {
      name: Joi.string().min(3).max(40).regex(/^[a-zA-Z0-9][-_a-zA-Z0-9]+[a-zA-Z0-9]+$/).required(),
      title: Joi.string().required().max(140),
      description: Joi.string().allow("").required().min(2).max(2014),
      is_restricted: Joi.boolean().default(false),
      is_private: Joi.boolean().default(false),
      is_curated: Joi.boolean().default(false),
    }
  },
  handler: function (request, reply) {
    var self = this;
    
    if (request.auth.credentials.user_type !== "member") return reply(Boom.unauthorized());
    
    internals.ensureUserCanCreateColl(this.couch, request.auth.credentials, request.payload).then(function () {
      var now = new Date();
      var coll = _.defaults(request.payload, {
        _id: internals.getCollectionId(request.auth.credentials.username + "/" + request.payload.name),
        user_id: request.auth.credentials.user_id,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        members: [request.auth.credentials.user_id],
        moderators: [request.auth.credentials.user_id],
        admins: [request.auth.credentials.user_id],
      });

      
      return When.promise(function (resolve, reject) {
        self.couch.insert(coll, coll._id, function (err, resp) {
          if (err) {
            if (409 === err.status_code) return reject(Boom.conflict("A collection with that name already exists"));
            
            return reject(err);
          }
          
          resolve(coll);
        });
      });
    })
    .then(internals.toJSON)
    .then(internals.joinUsers)
    .then(function (coll) {
      coll.id = request.auth.credentials.user_type + "/" + request.payload.name;
      
      reply(coll).code(201);
    }, reply);
  }
};

exports.update = {
  validate: {
    payload: {
      name: Joi.string().min(3).max(40).regex(/^[a-zA-Z0-9][-_a-zA-Z0-9]+[a-zA-Z0-9]+$/).required(),
      title: Joi.string().required().max(140),
      description: Joi.string().required().min(2).max(2014),
      is_restricted: Joi.boolean().default(false),
      is_private: Joi.boolean().default(false),
      is_curated: Joi.boolean().default(false),
    }
  },
  handler: function (request, reply) {
    if (request.auth.credentials.user_type !== "member") return reply(Boom.unauthorized());
  }
};

exports.read = {
  auth: {
    mode: "try",
  },
  validate: {
    path: {
      username: Joi.string().min(3).max(40).invalid("guest").regex(/^[a-zA-Z0-9][-_a-zA-Z0-9]+[a-zA-Z0-9]+$/).required(),
      collname: exports.update.validate.payload.name,
    }
  },
  handler: function (request, reply) {
    exports.lookup(this.couch, request.params.username, request.params.collname)
    .then(function (coll) {
      if (coll.is_private) {
        if (!request.auth || !request.auth.credentials) return Boom.unauthorized();
        if (coll.members.indexOf(request.auth.credentials.user_id) < 0) return Boom.unauthorized();
      }
    })
    .then(internals.toJSON)
    .then(internals.joinUsers)
    .then(reply, reply);
  }
};

exports.remove = {
  validate: {
    path: {
      username: Joi.string().min(3).max(40).invalid("guest").regex(/^[a-zA-Z0-9][-_a-zA-Z0-9]+[a-zA-Z0-9]+$/).required(),
      collname: exports.update.validate.payload.name,
    }
  },
  handler: function (request, reply) {
  }
};

exports.listCollections = {
  auth: {
    mode: "try",
  },
  validate: {
    path: {
      username: Joi.string().min(3).max(40).invalid("guest", "anonymous").regex(/^[a-zA-Z0-9][-_a-zA-Z0-9]+[a-zA-Z0-9]+$/).required(),
    },
    query: {
      meta: Joi.boolean().optional().default(false),
      skip: Joi.number().optional().default(0),
      limit: Joi.number().optional().default(20),
      after: Joi.date().optional(),
    }
  },
  handler: function (request, reply) {
    var self = this;
    
    if (request.auth.credentials.user_type !== "member") return reply(Boom.unauthorized());
    
    When.promise(function (resolve, reject) {
      self.couch.view("collections", "by_user", { key: request.params.username, include_docs: true }, function (err, resp) {
        
        if (err) {
          if (err['status-code'] === 404) return resolve(null);
          return reject(err);
        }
        
        var colls = _.pluck(resp.rows, "doc");
        
        colls = _.filter(colls, function (coll) {
          return !coll.is_private || request.auth.credentials.user_name in coll.members;
        });
        colls = _.map(colls, internals.toJSON);
        When.map(colls, internals.joinUsers)
        
        .then(function (colls) {
          _.forEach(colls, function (coll) {
            coll.id = coll.user.username + "/" + coll.name;
          });
          
          reply({
            meta: {
              count: resp.total_rows,
              skip: request.query.skip,
              limit: request.query.limit
            },
            results: colls
          });
        });
        
      });
    }).then(reply, reply);
  }
};

exports.lookup = function (couch, username, collname) {
  return When.promise(function (resolve, reject) {
    couch.get(internals.getCollectionId(username + "/" + collname), function (err, resp) {
      if (err) {
        if (err['status-code'] === 404) return reject(Boom.notFound());
        return reject(err);
      }
      
      if (resp.deleted_at) return reject(Boom.notFound());
      
      resolve(resp);
    });
  });
};

internals.ensureUserCanCreateColl = function (couch, user, coll) {
  return When.promise(function (resolve, reject) {
    resolve(true); //TODO
  });
};

internals.joinUsers = function (coll) {
  return When.join(
    Users.fetch(coll.user_id).then(function (user) {
      delete coll.user_id;
      coll.user = user;
    }),
    When.map(coll.members, Users.fetch).then(function (members) {
      coll.members = members;
    })
  ).yield(coll);
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