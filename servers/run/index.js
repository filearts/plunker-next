var Boom = require("boom");
var Path = require("path");
var Mime = require("mime");
var Url = require("url");
var Joi = require('joi');
var LRU = require("lru-cache");
var genid = require("genid");
var Crypto = require('crypto');
var Marked = require("marked");
var Request = require("request");
var _ = require('lodash');

var internals = {
  compilers: [
    {
      targetExtension: ".html",
      transformPath: function (path) {
        return Path.join(Path.dirname(path), Path.basename(path, Path.extname(path)) + ".html");
      },
      compile: function (fromPath, toPath, contents, cb) {
        console.log("compiling", fromPath, toPath);
        Marked(contents, cb);
      }
    }
  ]
};

// LRU cache of sha1 -> Buffer
// For compiled files, these will be stored as sha1.ext -> Buffer
internals.blobs = LRU({
  max: 100 * 1024 * 1024,          // 100MB
  length: function (buf) { return buf.length; }
});

// LRU cache of previewId -> {filename: sha1}
internals.previews = LRU(1024);

// Regex to determine if file is the index
internals.indexFileRegex = /^(index|readme|example|demo)\.(html?|md)$/i;

internals.findIndex = function (tree) {
  return _.findKey(tree, function (file, path) {
    return internals.indexFileRegex.test(path);
  });
};

internals.fetchTree = function (sha, next) {
  Request.get({url: "http://localhost:8001/trees/" + sha, json: true}, function (err, resp, body) {
    if (err) return next(err);
    if (resp.statusCode >= 400) return next(body);
    
    var files = {};
    
    addEntries(resp.body, "");
    
    next(null, files);
    
    function addEntries (entries, path) {
      _.forEach(entries, function (entry) {
        if (entry.type === 'directory') {
          addEntries(entry.children, path + entry.filename + "/");
        } else if (entry.type === 'file') {
          files[path + entry.filename] = {
            path: path + entry.filename,
            contents: entry.contents,
          };
        }
      });
    }
  });
};

// Given a previewId, return the correct preview url
internals.urlForPreview = function (previewId) {
  internals.url.pathname = "previews/" + previewId;
  
  return Url.format(internals.url) + "/";
};

internals.prepareFile = function (preview, targetPath, next) {
  var sourceTree = preview.tree;
  var sourceSha = sourceTree[targetPath];
  var found = false;
  
  // No compilation needed
  if (sourceSha) {
    var buf = internals.blobs.get(sourceSha);
    
    if (buf) return next(null, buf);
    else return next(Boom.notFound("Preview file expired"));
  }
  
  var ext = Path.extname(targetPath);
  
  _.forEach(sourceTree, function (sha, path) {
    _.forEach(internals.compilers, function (compiler) {
      if (targetPath === compiler.transformPath.call(compiler, path)) {
        var buf = internals.blobs.get(sha);
        
        // The buffer fell out of the blob cache
        if (!buf) { next(Boom.notFound("Preview file expired")); }
        else {
          compiler.compile.call(compiler, path, targetPath, buf.toString("utf8"), function (err, compiled) {
            if (err) next(err);
            else {
              var buf = Buffer(compiled);
              next(null, buf);
              
              // Cache the compiled file
              internals.blobs.set(sha + ext, buf);
              sourceTree[targetPath] = sha + ext;
              preview.map[path] = targetPath;
            }
          });
        }
        
        // Escape from booth loops
        found = true;
        return false;
      }
    });
    
    return !found;
  });
  
  if (!found) {
    console.log("Not found!", targetPath);
    next(Boom.notFound());
  }
};

exports.name = "run";
exports.version = require("./package.json").version;
exports.path = __dirname;

exports.register = function (plugin, options, next) {
  
  var context = {
    config: options.config
  };
  
  var basePath = options.config.server.run.path || "";
  
  internals.url = { hostname: options.config.server.run.host };
  if (options.config.server.run.port) internals.url.port = options.config.server.run.port;

  plugin.bind(context);
  
  plugin.method({
    name: "prepareFile",
    fn: internals.prepareFile
  });
  
  plugin.method({
    name: "fetchTree",
    fn: internals.fetchTree
  });
  
  plugin.route({
    method: "GET",
    path: basePath + "/sha/{sha}/{path*}",
    config: {
      handler: function (request, reply) {
        request.server.methods.fetchTree(request.params.sha, function (err, files) {
          if (err) return reply(err);
          
          var previewId = "sha:" + request.params.sha;
          var preview = internals.getOrCreatePreview(previewId, files);
          
          internals.serveTree(request, reply, preview);
        });
      }
    }
  });
  
  plugin.route({
    method: "GET",
    path: basePath + "/previews/{previewId}/{path*}",
    config: {
      handler: function (request, reply) {
        var preview = internals.previews.get(request.params.previewId);
        
        internals.serveTree(request, reply, preview);
      }
    }
  });
  
  plugin.route({
    method: 'POST',
    path: '/previews/{previewId}',
    config: {
      validate: {
        payload: {
          files: Joi.array().required().includes(Joi.object({
            contents: Joi.string().required(),
            path: Joi.string().required().regex(/^(?:\.[a-zA-Z0-9]|[a-zA-Z0-9])[\w-]*(?:\.[\w-]+)*(?:\/[a-zA-Z0-9][\w-]*(?:\.[\w-]+)*)*$/)
          }))
        }
      },
      handler: function (request, reply) {
        var previewId = request.params.previewId || genid();
        var preview = internals.getOrCreatePreview(previewId, request.payload.files);
        
        if (request.mime === "application/x-www-form-urlencoded") {
          internals.serveTree(request, reply, preview);
        } else {
          reply({url: internals.urlForPreview(previewId)});
        }
      }
    }
  });
  
  return next();
};

internals.serveTree = function (request, reply, preview) {
  var path = request.params.path;
  
  if (!preview) return reply(Boom.notFound());
  
  if (!path) {
    var index = internals.findIndex(preview.tree);
    
    if (!index) return reply(Boom.notFound());
    
    path = Path.basename(index, Path.extname(index)) + ".html";
  }
  
  request.server.methods.prepareFile(preview, path, function (err, buf) {
    if (err) return reply(err);
    
    return reply(buf).type(Mime.lookup(path));
  });
};

internals.getOrCreatePreview = function (previewId, files) {
  var preview = internals.previews.get(previewId) || {
    map: {},
    tree: {},
  };
  
  var tree = preview.tree;
  
  // Determine the sha hash for each file's content and save the contents to the cache
  _.forEach(files, function (file) {
    var buf = new Buffer(file.contents);
    var sha = Crypto
      .createHash('sha1')
      .update(buf)
      .digest('hex');
      
    if (tree[file.path] && tree[file.path] !== sha && preview.map[file.path]) {
      console.log("cleaning up", file.path);
      delete tree[preview.map[file.path]];
    }
    
    tree[file.path] = sha;
    
    internals.blobs.set(sha, buf);
  });
  
  // Save the tree to the cache
  internals.previews.set(previewId, preview);
  
  return preview;
};