var angular = window.angular;

var Genid = require("genid");

module.exports =
angular.module("plunker.project.entry", [
])


.factory("Entry", [function () {
  function Entry (parent, filename, entryId) {
    this.parent = parent;
    this.entryId = entryId || Genid();
    this.filename = filename;
    this.path = "";
  }
  
  Entry.prototype.destroy = function () {
    if (this.parent) {
      this.parent.removeChild(this);
      this.parent = null;
    }
  };
  
  
  Entry.prototype.getFilename = function () { return this.filename; };
  Entry.prototype.getId = function () { return this.entryId; };
  Entry.prototype.getParent = function () { return this.parent; };
  Entry.prototype.getPath = function () {
    var path = "";
    
    if (this.parent) path += this.parent.getPath();
    if (path) path += "/";
      
    return path + this.getFilename();
  };
  
  Entry.prototype.setFilename = function (filename) {
    if (this.parent) {
      if (this.parent.hasChildByFilename(filename)) throw new Error("Cannot rename a file using an existing filename");
    }
    
    this.filename = filename;
  };
  
  Entry.prototype.setParent = function (parent) {
    this.parent = parent;
  };
  
  return Entry;
}]);
