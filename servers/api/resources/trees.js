var Boom = require("boom");
var Joi = require("joi");
var When = require("when");
var Nodefn = require('when/node');
var LRU = require("lru-cache");
var _ = require("lodash");


var internals = {
  objects: new LRU(512)
};

exports.lookup = {
  auth: {
    mode: "try",
  },
  validate: {
    path: {
      sha: Joi.string().required().length(40).regex(/^[a-zA-Z0-9]+$/)
    }
  },
  cache: {
    privacy: "public",
    expiresIn: 1000 * 60 * 60 * 365 // Trees are immutable, long expiry
  },
  handler: function (request, reply) {
    exports.loadHashRecursive(this.couch, request.params.sha, function (err, tree) {
      if (err) return reply(err);
      
      reply(tree.children);
    });
  }
};

exports.loadHashRecursive = function (couch, sha, next) {
  var hashId = internals.getHashId(sha);
  var cached = internals.objects.get(hashId);
  
  if (cached) {
    return process.nextTick(function () {
      next(null, cached);
    });
  }
  
  // Lift loadHashRecursive to a promise version (When.lift fails in this case)
  var loadHashRecursive = Nodefn.lift(exports.loadHashRecursive);
  
  couch.get(hashId, function (err, object) {
    if (err) return next(err);
    if (!object) return next(Boom.notFound());
    
    if (object.type === 'directory') {
      // A tree's children value is an array of {hash, filename} objects
      // Create a promise that will resolve with all of the fully-hydrated children
      When.map(object.children, function (child) {
        return loadHashRecursive(couch, child.hash).then(function (object) {
          // Git objects don't know their own filenames, we must assign their
          // filename given the current context
          object.filename = child.filename;
          
          return object;
        });
        
        // Let errors on the child's call to loadHashRecursive bubble up in the
        // promise stack
      }).then(function (children) {
        var entry = {
          type: 'directory',
          children: children
        };
        
        internals.objects.set(hashId, entry);
        
        next(null, entry);
      }, function (err) {
        // Now handle any errors in the child promise stack from the When.map call
        next(err);
      });
    } else if (object.type === 'file') {
      var entry = {
        type: 'file',
        contents: object.contents,
        encoding: object.encoding
      };
      
      internals.objects.set(hashId, entry);
      
      next(null, entry); 
    }
  });
};

internals.getHashId = function (sha) { return "o/" + sha; };
internals.getEntryHash = function (entry) { return entry.hash; };