var angular = window.angular;

var _ = require("lodash");

module.exports =
angular.module("plunker.queryBuilder", [
  "plunker.service.config",
])

.factory("queryBuilder", ["$http", "$q", function ($http, $q) {
  function PlunkQueryBuilder () {
    this.tags = [];
    this.packages = [];
    this.phrases = [];
    this.terms = [];
    this.collections = [];
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
    this.terms.push(arg);
    
    return this;
  };
  
  PlunkQueryBuilder.prototype.addPackage = function (arg) {
    if (!arg) return;
    // TODO: Parse out semver and create range queries
    this.packages.push(arg);
    
    return this;
  };
  
  PlunkQueryBuilder.prototype.parse = function (query) {
    var self = this;
    
    // Parse out tags (syntax: '[tag]')
    query = query.replace(/\[[^\]]+\]/g, function (match) {
      console.log("tag", match);
      self.addTag(match.slice(1, -1));
      return "";
    });
    
    // Parse out packages (syntax: '<package[@semver]>')
    query = query.replace(/<[^>]+>/g, function (match) {
      console.log("package", match);
      self.addPackage(match.slice(1, -1));
      return "";
    });
    
    // Parse collections (syntax: 'in:collection')
    query = query.replace(/in:\S+/g, function (match) {
      console.log("package", match);
      self.addCollection(match.slice(3));
      return "";
    });
    
    // Parse out phrases (syntax: '"phrase here"')
    query = query.replace(/"[^"]+"/g, function (match) {
      console.log("phrase", match);
      self.addPhrase(match.slice(1, -1));
      return "";
    });
    
    // Add remaining bits and pieces as terms
    _.forEach(query.split(/\s+/), this.addTerm, this);
    
  };
  
  PlunkQueryBuilder.prototype.toString = function () {
    var query = [];
    
    _.forEach(this.terms, function (part) {
      query.push(part + "~");
      query.push("description:" + part +"^2");
      query.push("readme:" + part +"^1.5");
    });
    _.forEach(this.phrases, function (part) {
      query.push('"' + part + '"');
      query.push('description:"' + part +'"^2');
      query.push('readme:"' + part +'"^1.5');
    });
    _.forEach(this.tags, function (part) { query.push('+tags:' + part); });
    _.forEach(this.packages, function (part) { query.push('+packages:' + part); });
    _.forEach(this.collections, function (part) { query.push('+collections:' + part); });
    
    return query.join(" ");
  };

  return {
    parse: function (query) {
      var builder = new PlunkQueryBuilder();
      
      builder.parse(query);
      
      return builder;
    }
  };
}])

;