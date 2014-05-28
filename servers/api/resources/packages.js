var Joi = require("joi");
var When = require("when");
var Boom = require("boom");
var Semver = require("semver");
var _ = require("lodash");

var internals = {
  semverRx: /\s*[v=]*\s*([0-9]+)\.([0-9]+)\.([0-9]+)(-[0-9]+-?)?([a-zA-Z-+][a-zA-Z0-9-\.:]*)?/,
};

internals.versionSchema = Joi.object({
  semver: Joi.string().required().regex(internals.semverRx),
  scripts: Joi.array().required().includes(Joi.string()),
  styles: Joi.array().required().includes(Joi.string()),
  dependencies: Joi.array().required().includes(Joi.string()),
});

exports.create = {
  validate: {
    payload: {
      name: Joi.string().required().min(3).max(40).regex(/^[a-zA-Z0-9][-_\.a-zA-Z0-9]+[a-zA-Z0-9]+$/),
      description: Joi.string().required().allow("").max(2048),
      website_url: Joi.string().required().allow(""),
      docs_url: Joi.string().required().allow(""),
      versions: Joi.array().required().min(1).includes(internals.versionSchema),
    }
  },
  handler: function (request, reply) {
    var self = this;
    var pkg = _.pick(request.payload, "name description website_url docs_url".split(" "));
    
    pkg._id = internals.getPackageId(pkg.name);
    pkg.plunks_count = 0;
    
    var insert = function (doc) {
      return When.promise(function (resolve, reject) {
        self.couch.insert(doc, doc._id, function (err, resp) {
          if (err) return reject(err);
          
          resolve(internals.toJSON(doc));
        });
      });
    };
    
    insert(pkg).then(function (doc) {
      return When.map(request.payload.versions, function (version) {
        version._id = internals.getPackageVersionId(pkg.name, version.semver);
        
        return insert(version);
      }).then(function (versions) {
        pkg.versions = versions;
        
        return pkg;
      });
    })
    .then(reply, reply);
  }
};

exports.search = {
  validate: {
    query: {
    },
  },
  handler: function (request, reply) {
  }
};


exports.read = {
  validate: {
    path: {
      packageName: Joi.string().required().min(3).max(40).regex(/^[a-zA-Z0-9][-_\.a-zA-Z0-9]+[a-zA-Z0-9]+$/),
    },
  },
  handler: function (request, reply) {
  }
};

exports.update = {
  validate: {
    path: {
      packageName: Joi.string().required().min(3).max(40).regex(/^[a-zA-Z0-9][-_\.a-zA-Z0-9]+[a-zA-Z0-9]+$/),
    },
  },
  handler: function (request, reply) {
  }
};


exports.destroy = {
  validate: {
    path: {
      packageName: Joi.string().required().min(3).max(40).regex(/^[a-zA-Z0-9][-_\.a-zA-Z0-9]+[a-zA-Z0-9]+$/),
    },
  },
  handler: function (request, reply) {
  }
};


exports.addVersion = {
  validate: {
    path: {
      packageName: Joi.string().required().min(3).max(40).regex(/^[a-zA-Z0-9][-_\.a-zA-Z0-9]+[a-zA-Z0-9]+$/),
    },
    payload: internals.versionSchema,
  },
  handler: function (request, reply) {
  }
};


exports.readVersion = {
  validate: {
    path: {
      name: Joi.string().required().min(3).max(40).regex(/^[a-zA-Z0-9][-_a-zA-Z0-9]+[a-zA-Z0-9]+$/),
      semver: Joi.string().required().regex(internals.semverRx),
    },
  },
  handler: function (request, reply) {
  }
};


exports.updateVersion = {
  validate: {
    path: {
      name: Joi.string().required().min(3).max(40).regex(/^[a-zA-Z0-9][-_a-zA-Z0-9]+[a-zA-Z0-9]+$/),
      semver: Joi.string().required().regex(internals.semverRx),
    },
    payload: internals.versionSchema,
  },
  handler: function (request, reply) {
  }
};


exports.destroyVersion = {
  validate: {
    path: {
      name: Joi.string().required().min(3).max(40).regex(/^[a-zA-Z0-9][-_a-zA-Z0-9]+[a-zA-Z0-9]+$/),
      semver: Joi.string().required().regex(internals.semverRx),
    },
  },
  handler: function (request, reply) {
  }
};

exports.lookup = function (packageName) {
  return When.promise(function (resolve, reject) {
    reject(Boom.notFound());
  });
};

exports.updateUsage = function (curr, prev) {
  var self = this;
  
  var currNames = _.pluck(curr, "name");
  var prevNames = _.pluck(prev, "name");
  
  var added = _.without.apply(null, [currNames].concat(prevNames));
  var removed = _.without.apply(null, [prevNames].concat(currNames));
  
  var incrementor = function (inc) { 
    return function (packageName) {
      self.couch.atomic("packages", "increment_usage", internals.getPackageId(packageName), {inc: inc}, function (err, res) {
        if (err) console.error("[ERR] Failed to increment package usage", packageName, "by", inc);
        else console.log("[OK] Incremented usage", res);
      });
    };
  };
  
  _.forEach(added, incrementor(1));
  _.forEach(removed, incrementor(-1));
};

internals.getCollectionId = function (collId) { return "g/" + collId; };
internals.getCommentId = function (commentId) { return "c/" + commentId; };
internals.getObjectId = function (plunkId) { return "o/" + plunkId; };
internals.getPlunkId = function (plunkId) { return "p/" + plunkId; };
internals.getPackageId = function (packageName) { return "l/" + packageName.toLowerCase(); };
internals.getPackageVersionId = function (packageName, semver) { return "v/" + packageName.toLowerCase() + "/" + Semver.valid(semver); };
internals.getUserId = function (userId) { return "u/" + userId; };
internals.getUsernameId = function (username) { return "n/" + username; };
internals.getIdentityId = function (service, service_user_id) { return "i/" + service + "/" + service_user_id; };


internals.toJSON = function (json) {
  json = _.clone(json);
  
  json.id = json._id.slice(2); // Drop off the p/ prefix
  
  delete json._id;
  delete json._rev;
  
  return json;
};
