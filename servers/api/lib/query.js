var Pad = require("padded-semver");
var When = require("when");
var _ = require("lodash");

var Users = require("../resources/users");

function PlunkQueryBuilder () {
  this.tags = [];
  this.packages = [];
  this.phrases = [];
  this.terms = [];
  this.collections = [];
  
  this.userId = "";
}

PlunkQueryBuilder.prototype.reset = function () {
  this.tags.length = 0;
  this.packages.length = 0;
  this.phrases.length = 0;
  this.terms.length = 0;
  this.collections.length = 0;
};

PlunkQueryBuilder.prototype.addCollection = function (arg) {
  if (!arg) return;
  this.collections.push(arg);
  
  return this;
};

PlunkQueryBuilder.prototype.addPhrase = function (arg) {
  if (!arg) return;
  this.phrases.push(arg);
  
  return this;
};

PlunkQueryBuilder.prototype.addTag = function (arg) {
  if (!arg) return;
  this.tags.push(arg);
  
  return this;
};

PlunkQueryBuilder.prototype.addTerm = function (arg) {
  if (!arg) return;
  this.terms.push(encodeURIComponent(arg));
  
  return this;
};

PlunkQueryBuilder.prototype.addPackage = function (arg) {
  if (!arg) return;
  // TODO: Parse out semver and create range queries
  this.packages.push(arg);
  
  return this;
};

PlunkQueryBuilder.prototype.setUser = function (arg) {
  var self = this;
  
  if (!arg) return;
  // TODO: Parse out semver and create range queries
  
  return Users.fetchByName(arg).then(function (user) {
    self.userId = user.id;
  }).yield(this);
};

PlunkQueryBuilder.prototype.parse = function (q) {
  var self = this;
  var promise = null;
  
  // Parse out tags (syntax: '[tag]')
  q = q.replace(/\[[^\]]+\]/g, function (match) {
    self.addTag(match.slice(1, -1));
    return "";
  });
  
  // Parse out packages (syntax: '<package[@semver]>')
  q = q.replace(/<[^>]+>/g, function (match) {
    var parts = match.slice(1,-1).split("@");
    var pkg = {
      name: parts.shift()
    };
    
    if (parts.length) {
      pkg.range = parts.join("@");
    }
    
    self.addPackage(pkg);
    return "";
  });
  
  // Parse collections (syntax: 'in:collection')
  q = q.replace(/in:\S+/g, function (match) {
    self.addCollection(match.slice(3));
    return "";
  });
  
  // Parse out phrases (syntax: '"phrase here"')
  q = q.replace(/"[^"]+"/g, function (match) {
    self.addPhrase(match.slice(1, -1));
    return "";
  });
  
  q = q.replace(/@\S+/g, function (match) {
    promise = self.setUser(match.slice(1));
    return "";
  });
  
  // Add remaining bits and pieces as terms
  _.forEach(q.split(/\s+/), this.addTerm, this);
  
  return promise ? promise : When.resolve(this);
};

PlunkQueryBuilder.prototype.toString = function () {
  var query = [];
  
  _.forEach(this.terms, function (part) {
    query.push(part + "~");
    query.push("description:" + part +"^2");
    query.push("readme:" + part +"^1.5");
    query.push("tags:" + part + "~");
    query.push("packages:" + part + "~");
  });
  _.forEach(this.phrases, function (part) {
    query.push('"' + part + '"');
    query.push('description:"' + part +'"^2');
    query.push('readme:"' + part +'"^1.5');
  });
  _.forEach(this.tags, function (part) { query.push('+tags:' + part.toLowerCase()); });
  _.forEach(this.packages, function (part) {
    
    if (part.range) {
      var range;
      
      if (part.range === "*") {
        range = {
          start: '0000!0000!0000!0000!',
          end: '9999!9999!9999!9999!',
        };
      } else {
        try {
          range = Pad.range(part.range);
        } catch (e) {
          console.log("[WARN] Invalid semver range", part.range);
        }
      }
      
      if (range) query.push('+packages_ver:[' + part.name.toLowerCase() + "@" + range.start + ' TO ' + part.name.toLowerCase() + "@" + range.end + '~]');

    } else {
      query.push('+packages:' + part.name.toLowerCase());
    }
  });
  _.forEach(this.collections, function (part) { query.push('+collections:"' + part.toLowerCase() + '"'); });
  
  if (this.userId) query.push("+user:" + this.userId);
  
  console.log("Query: ", query.join(" "));
  
  return query.join(" ") || "*:*";
};

module.exports.parse = function (q) {
  var query = new PlunkQueryBuilder();
  
  return query.parse(q);
};
