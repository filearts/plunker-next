var Boom = require("boom");
var Joi = require("joi");
var Path = require("path");
var Mime = require("mime");
var LRU = require("lru-cache");
var Pad = require("padded-semver");
var When = require("when");
var Nodefn = require('when/node');
var Genid = require("genid");
var _ = require("lodash");

var Tree = require("git-object-tree");
var Blob = require("git-object-blob");
var Hashify = require("git-object-hash");

var QueryBuilder = require("../lib/query");

var Collections = require("./collections");
var Users = require("./users");

var internals = {
  users: LRU(200)
};

exports.create = {
  validate: {
    payload: {
      description: Joi.string().required().min(2).max(140),
      readme: Joi.string().required().allow("").default(""),
      tags: Joi.array().required().includes(Joi.string().regex(/^[-_\.a-zA-Z0-9]+$/)),
      files: Joi.array().required().includes(Joi.object({
        type: Joi.string().required().allow("directory"),
        path: Joi.string().required().regex(/^(?:\.[a-zA-Z0-9]|[a-zA-Z0-9])[\w-]*(?:\.[\w-]+)*(?:\/[a-zA-Z0-9][\w-]*(?:\.[\w-]+)*)*$/)
      }), Joi.object({
        type: Joi.string().required().allow("file"),
        path: Joi.string().required().regex(/^(?:\.[a-zA-Z0-9]|[a-zA-Z0-9])[\w-]*(?:\.[\w-]+)*(?:\/[a-zA-Z0-9][\w-]*(?:\.[\w-]+)*)*$/),
        contents: Joi.string().required(),
        encoding: Joi.string().optional().allow("utf8", "base64").default("utf8")
      }))
    }
  },
  handler: function (request, reply) {
    var self = this;
    var isHtml = /\.html?$/i;
    var packages = [];
    
    _.forEach(request.payload.files, function (file) {
      if (file.type === 'file' && isHtml.test(file.path)) {
        packages = packages.concat(internals.findPackageRefs(file.contents));
      }
    });

    return internals.saveTree(self.couch, request.payload.files)
    
    .then(function (hash) {
      var now = new Date();
      var plunkId = internals.getPlunkId(Genid(16, "", "abcdefghijklmnopqrstuvwxyz0123456789"));
      var plunk = {
        _id: plunkId,
        fork_of: null,
        description: request.payload.description,
        readme: request.payload.readme,
        tags: _.unique(request.payload.tags),
        created_at: now,
        updated_at: now,
        deleted_at: null,
        user_id: request.auth.credentials.user_id,
        packages: packages,
        revisions: [{
          event: 'create',
          user_id: request.auth.credentials.user_id,
          tree: hash,
          parent: null,
          created_at: now
        }],
        revisions_count: 1,
        releases_count: 0,
        comments_count: 0,
        collections: [],
        queued: [],
        alias: null,
      };
      
      return When.promise(function (resolve, reject) {
        self.couch.insert(plunk, plunkId, function (err, resp) {
          if (err) return reject(err);
          
          resolve(plunk);
          
          request.server.methods.updateUsage(packages);
        });
      });
    })
    
    .then(internals.toJSON)
    
    .then(internals.joinUsers)
    
    .then(function (plunk) {
      reply(plunk).code(201);
    }, function (err) {
      reply(Boom.internalError());
    });
  }
};

exports.lookup = {
  auth: {
    mode: "try",
  },
  validate: {
    path: {
      plunkId: Joi.string().required().regex(/^[a-zA-Z0-9]+$/)
    }
  },
  handler: function (request, reply) {
    internals.lookupPlunk(this.couch, request.params.plunkId)
    .then(internals.toJSON)
    .then(internals.joinUsers)
    //.then(Users.joinUsers.bind(null, this.couch, ["revisions"]))
    .then(reply, reply);
  }
};

exports.remove = {
  validate: {
    path: {
      plunkId: Joi.string().required().regex(/^[a-zA-Z0-9]+$/)
    }
  },
  handler: function (request, reply) {
    var couch = this.couch;
    var insert = Nodefn.lift(couch.insert.bind(couch));
    
    internals.lookupPlunk(couch, request.params.plunkId)
    
    .then(function (plunk) {
      if (plunk.user_id !== request.auth.credentials.user_id) throw new Boom.unauthorized();
      
      plunk.deleted_at = new Date();
      
      request.server.methods.updateUsage([], plunk.packages);
      
      return insert(plunk, plunk._id);
    }).then(function () {
      reply().code(204);
    }, reply);
  }
};

exports.search = {
  auth: {
    mode: "try",
  },
  cache: {
    expiresIn: 1000
  },
  validate: {
    query: {
      q: Joi.string().optional().default(""),
      skip: Joi.number().optional().default(0),
      limit: Joi.number().optional().default(20),
      after: Joi.date().optional(),
    }
  },
  handler: function (request, reply) {
    var self = this;
    
    QueryBuilder.parse(request.query.q).then(function (qb) {
      var query = {
        q: qb.toString(),
        include_docs: true
      };
      
      self.couch.search("plunk", "plunks", query, function (err, resp) {
        if (err) return reply(err);
        
        When.map(_(resp.rows).pluck("doc").map(internals.toJSON).value(), internals.joinUsers)
        
        .then(function (plunks) {
          reply({
            meta: {
              count: resp.total_rows,
              skip: request.query.skip,
              limit: request.query.limit
            },
            results: plunks
          });
        }, reply);
      });
    }, reply);
  },  
};

exports.revise = {
  validate: {
    path: {
      plunkId: Joi.string().required().regex(/^[a-zA-Z0-9]+$/)
    },
    payload: exports.create.validate.payload
  },
  handler: function (request, reply) {
    var self = this;
    var isHtml = /\.html?$/i;
    var packages = [];
    
    _.forEach(request.payload.files, function (file) {
      if (file.type === 'file' && isHtml.test(file.path)) {
        packages = packages.concat(internals.findPackageRefs(file.contents));
      }
    });
    
    internals.lookupPlunk(this.couch, request.params.plunkId)
    
    .then(function (plunk) {
      if (plunk.user_id !== request.auth.credentials.user_id) return Boom.unauthorized();
      
      // We have permission to save a revision so create the tree first
      return internals.saveTree(self.couch, request.payload.files)
      
      .then(function (hash) {
        var now = new Date();
        var lastRevision = plunk.revisions[plunk.revisions.length - 1];
        var prevPackages = plunk.packages;
        
        plunk.updated_at = new Date();
        plunk.packages = packages;
        plunk.description = request.payload.description;
        plunk.readme = request.payload.readme;
        plunk.tags = _.unique(request.payload.tags);
        
        if (hash !== lastRevision.tree) {
          plunk.revisions.push({
            event: 'update',
            user_id: request.auth.credentials.user_id,
            tree: hash,
            parent: lastRevision.tree,
            created_at: now
          });
        }
          
        return When.promise(function (resolve, reject) {
          self.couch.insert(plunk, plunk._id, function (err, res) {
            if (err) return reject(err);
            
            resolve(plunk);
          
            request.server.methods.updateUsage(packages, prevPackages);
          });
        });
      });
    })
    
    .then(internals.toJSON)
    .then(internals.joinUsers)
    .then(reply, reply);
  }
};

exports.release = {
  handler: function (request, reply) {
    reply(Boom.notFound());
  }
};

exports.fork = {
  validate: {
    path: {
      plunkId: Joi.string().required().regex(/^[a-zA-Z0-9]+$/)
    },
    payload: exports.create.validate.payload
  },
  handler: function (request, reply) {
    var self = this;
    var isHtml = /\.html?$/i;
    var packages = [];
    
    internals.lookupPlunk(this.couch, request.params.plunkId)
    
    .then(function (plunk) {
      
      _.forEach(request.payload.files, function (file) {
        if (file.type === 'file' && isHtml.test(file.path)) {
          packages = packages.concat(internals.findPackageRefs(file.contents));
        }
      });
  
      return internals.saveTree(self.couch, request.payload.files)
      
      .then(function (hash) {
        var now = new Date();
        var plunkId = internals.getPlunkId(Genid(16, "", "abcdefghijklmnopqrstuvwxyz0123456789"));
        var revisions = _.clone(plunk.revisions);
        
        revisions.push({
          event: 'fork',
          user_id: request.auth.credentials.user_id,
          tree: hash,
          parent: plunk.revisions[plunk.revisions.length - 1].tree,
          created_at: now
        });
        
        var fork = {
          _id: plunkId,
          fork_of: plunk._id.slice(2),
          description: request.payload.description,
          readme: request.payload.readme,
          tags: _.unique(request.payload.tags),
          created_at: now,
          updated_at: now,
          deleted_at: null,
          user_id: request.auth.credentials.user_id,
          packages: packages,
          revisions: revisions,
          revisions_count: 1,
          releases_count: 0,
          comments_count: 0,
          collections: [],
          alias: null,
        };
        
        return When.promise(function (resolve, reject) {
          self.couch.insert(fork, plunkId, function (err, resp) {
            if (err) return reject(err);
            
            resolve(fork);
            
            request.server.methods.updateUsage(fork.packages);
          });
        });
      });
    })
    
    .then(internals.toJSON)
    
    .then(internals.joinUsers)
    
    .then(function (plunk) {
      reply(plunk).code(201);
    }, function (err) {
      reply(Boom.internalError());
    })
    ;
  }
};

exports.comment = {
  validate: {
    path: {
      plunkId: Joi.string().required().regex(/^[a-zA-Z0-9]+$/)
    },
    payload: {
      body: Joi.string().required().min(2).max(2048 * 8),
      files: Joi.array().required().allow(null).includes(Joi.object({
        type: Joi.string().required().allow("directory"),
        path: Joi.string().required().regex(/^(?:\.[a-zA-Z0-9]|[a-zA-Z0-9])[\w-]*(?:\.[\w-]+)*(?:\/[a-zA-Z0-9][\w-]*(?:\.[\w-]+)*)*$/)
      }), Joi.object({
        type: Joi.string().required().allow("file"),
        path: Joi.string().required().regex(/^(?:\.[a-zA-Z0-9]|[a-zA-Z0-9])[\w-]*(?:\.[\w-]+)*(?:\/[a-zA-Z0-9][\w-]*(?:\.[\w-]+)*)*$/),
        contents: Joi.string().required(),
        encoding: Joi.string().optional().allow("utf8", "base64").default("utf8")
      }))
    }
  },
  handler: function (request, reply) {
    var self = this;
    
    if (request.auth.credentials.user_type !== "member") return reply(Boom.unauthorized());
    
    internals.lookupPlunk(self.couch, request.params.plunkId)
    
    .then(function (plunk) {
      var hashPromise = _.isArray(request.payload.files)
        ? internals.saveTree(self.couch, request.payload.files)
        : When(null);
      
      return hashPromise.then(function (hash) {
        var now = new Date();
        var comment = {
          _id: internals.getCommentId(plunk._id.slice(2) + "/" + Genid(8)),
          plunk_id: plunk._id.slice(2),
          type: "comment",
          created_at: now,
          updated_at: now,
          deleted_at: null,
          body: request.payload.body,
          user_id: request.auth.credentials.user_id,
          tree: hash
        };

        return When.promise(function (resolve, reject) {
          self.couch.insert(comment, comment._id, function (err, resp) {
            if (err) return reject(err);
  
            resolve(resp);
          });
        });
      })
          
      .then(function () {
        // Increment the comment count locally and respond before doing the db update
        plunk.comments_count++;
        
        self.couch.atomic("plunk", "increment_comments", plunk._id, {}, function (err, res) {
          if (err) console.error("[ERR] Failed to increment plunk comments_count", err);
        });
        
        internals.joinUsers(internals.toJSON(plunk))
        
        .then(reply, reply);
      });

    });
  }
};

exports.listComments = {
  auth: {
    mode: "try",
  },
  validate: {
    path: {
      plunkId: Joi.string().required().regex(/^[a-zA-Z0-9]+$/)
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
    var start = 0;
    
    if (request.query.after) {
      start = request.query.after;
    }
    
    var query = {
      skip: request.query.skip,
      limit: request.query.limit,
      include_docs: true,
      startkey: [request.params.plunkId, start],
      endkey: [request.params.plunkId, "9999-99-99T99:99:99.999Z"]
    };
    
    self.couch.view("plunk", "plunk_comments", query, function (err, resp) {
      if (err) return reply(err);
      
      var comments = _.pluck(resp.rows, "doc");
      
      comments = _.map(comments, internals.toJSON);
      
      When.map(comments, function (comment) {
        return Users.fetch(comment.user_id).then(function (user) {
          comment.user = user;
          delete comment.user_id;
        }).yield(comment);
      })
      
      .then(function (comments) {
        reply({
          meta: {
            count: resp.total_rows,
            skip: request.query.skip,
            limit: request.query.limit
          },
          results: comments
        });
      }, reply);
      
    });
  }
};


exports.publish = {
  validate: {
    path: {
      plunkId: Joi.string().required().regex(/^[a-zA-Z0-9]+$/)
    },
    payload: {
      name: Joi.string().min(3).max(40).regex(/^[a-zA-Z0-9][-_a-zA-Z0-9]+[a-zA-Z0-9]+\/[a-zA-Z0-9][-_a-zA-Z0-9]+[a-zA-Z0-9]+$/).required(),
    }
  },
  handler: function (request, reply) {
    var self = this;
    
    if (request.auth.credentials.user_type !== "member") return reply(Boom.unauthorized());
    
    internals.lookupPlunk(self.couch, request.params.plunkId)
    
    .then(function (plunk) {
      var parts = request.payload.name.split("/");
      
      return Collections.lookup(self.couch, parts[0], parts[1]).then(function (coll) {
        var toUpdate;
        
        if (coll.is_private && coll.members.indexOf(request.auth.credentials.user_id) < 0) return Boom.unauthorized();
        
        if (coll.is_curated && coll.curators.indexOf(request.auth.credentials.user_id) < 0) {
          
          toUpdate = Users.fetch(coll.user_id).then(function (user) {
            plunk.queued.push(user.username + "/" + parts[1]);
            plunk.queued = _.unique(plunk.queued);
            
            return plunk;
          });
        } else {
          // Not curated, add collection to plunk
          
          toUpdate = Users.fetch(coll.user_id).then(function (user) {
            plunk.collections.push(user.username + "/" + parts[1]);
            plunk.collections = _.unique(plunk.collections);
            
            return plunk;
          });
        }
        
        return toUpdate.then(function (toUpdate) {
          return When.promise(function (resolve, reject) {
            self.couch.insert(toUpdate, toUpdate._id, function (err, resp) {
              if (err) return reject(err);
    
              resolve({
                status: "OK"
              });
            });
          });
        });
      });
    })
    .then(reply, reply);
  }
};

internals.lookupPlunk = function (couch, plunkId) {
  return When.promise(function (resolve, reject) {
    couch.get(internals.getPlunkId(plunkId), function (err, resp) {
      if (err) {
        if (err['status-code'] === 404) return reject(Boom.notFound());
        return reject(err);
      }
      
      if (resp.deleted_at) return reject(Boom.notFound());
      
      resolve(resp);
    });
  });
};

internals.saveTree = function (couch, files) {
  var fileTree = internals.filesToTree(files);
  var tree = internals.treeToObjects(fileTree);
  
  var docs = _.map(tree.objects, function (entry, sha) {
    if (entry.type === 'file') {
      return {
        _id: internals.getObjectId(sha),
        type: 'file',
        contents: entry.contents,
        encoding: entry.encoding
      };
    } else if (entry.type === 'directory') {
      return {
        _id: internals.getObjectId(sha),
        type: 'directory',
        children: _.map(entry.children, function (child) {
          return {
            hash: child.hash,
            filename: child.filename
          };
        })
      };
    }
  });
  
  return When.promise(function (resolve, reject) {
    couch.bulk({docs: docs}, function (err, resp) {
      if (err) return reject(err);
      
      return resolve(tree.root.hash);
    });
    
  });
};

/**
 * Take an array of files and directories and convert to a tree structure
 */
internals.filesToTree = function (files) {
  var children = {};
  
  for (var i = 0, count = files.length; i < count; i++) {
    var file = files[i];
    
    file.path = file.path.split("/").filter(Boolean).join("/");
    
    if (file.type === "file") {
      addFile(file.path, file.content);
    } else if (file.type === "directory") {
      addDir(file.path);
    }
  }
  
  return getChildrenArray(".");
  
  function addFile(filepath, content) {
    var filename = Path.basename(filepath)
      , dirname = Path.dirname(filepath)
      , segments = dirname.split("/");
      
    while (segments.length) {
      addDir(segments.join("/"));
      segments.pop();
    }
    
      
    getChildrenArray(dirname).push({
      type: "file",
      filename: filename,
      path: dirname,
      mime: Mime.lookup(filename),
      contents: file.contents
    });
  }
  
  function addDir(dir) {
    if (dir === "." || dir === "/") return;

    var dirname = Path.dirname(dir);
    var basename = Path.basename(dir);
    var children = getChildrenArray(dirname);

    if (_.find(children, {filename: basename})) return;
    
    children.push({
      type: "directory",
      filename: basename,
      path: dir,
      children: getChildrenArray(dir)
    });
  }
  
  function getChildrenArray(dir) {
    return children[dir] || (children[dir] = []);
  }
};

internals.treeToObjects = function (fileTree) {
  var container = { objects: {} };

  container.root = {
    type: 'directory',
    filename: '',
    children: fileTree,
    hash: Hashify(Tree.create(mapTree(fileTree)))
  };

  container.objects[container.root.hash] = container.root;

  return container;

  function mapTree (entries) {
    return _.map(entries, function (entry) {
      if (entry.type === 'file') {
        var blob = Blob.create(new Buffer(entry.contents));

        entry.hash = Hashify(blob);

        container.objects[entry.hash] = entry;

        return {
          mode: 0100644,
          name: entry.filename,
          hash: entry.hash
        };
      } else if (entry.type === 'directory') {
        var children = mapTree(entry.children);
        var tree = Tree.create(children);

        entry.hash = Hashify(tree);

        container.objects[entry.hash] = entry;

        return {
          mode: 040000,
          name: entry.filename,
          hash: entry.hash
        };
      }
    });
  }
};

internals.joinUsers = function (plunk) {
  return When.join(
    Users.fetch(plunk.user_id).then(function (user) {
      plunk.user = user;
      delete plunk.user_id;
    }),
    When.all(_.map(plunk.revisions, function (revision) {
      return Users.fetch(revision.user_id).then(function (user) {
        revision.user = user;
        
        delete revision.user_id;
      });
    }))
  ).yield(plunk).catch(function (err) {
    console.dir(err);
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
  
  if (json.packages) json.packages = _.map(json.packages, function (pkg) {
    pkg.semver = Pad.unpad(pkg.semver);
    
    return pkg;
  });
  
  if (json.fork_of) json.fork_of = json.fork_of.slice(2);
  
  return json;
};


internals.findPackageRefs = function (html) {
  var re = /<(?:script|link) [^>]*?data-(semver|require)="([^"]*)"(?: [^>]*?data-(semver|require)="([^"]*)")?/g;
  var match;
  var refs = {};
  
  while (match = re.exec(html)) {
    var pkg = {};
    
    pkg[match[1]] = match[2];
    if (match[3]) pkg[match[3]] = match[4];
    
    if (pkg.require) {
      var parts = pkg.require.split("@");
      
      delete pkg.require;
      
      pkg.name = parts.shift();
      pkg.semverRange = parts.join("@") || "*";
  
      if (pkg.semver) pkg.semver = Pad.pad(pkg.semver);
      
      refs[pkg.name] = pkg;
    }
  }
  
  return _.values(refs);
};

internals.findPackagesDeltas = function (curr, prev) {
  if (!prev || !prev.length) return {
    added: curr,
    same: [],
    removed: []
  };
  
  if (!curr || !curr.length) return {
    added: [],
    same: [],
    removed: prev
  };
  
  return {
    added: _.without.apply(null, curr, prev),
    same: _.intersection(curr, prev),
    removed: _.without.apply(null, prev, curr)
  };
};