var angular = window.angular;

var _ = require("lodash");



module.exports =
angular.module("plunker.project.directoryEntry", [
  require("../../components/oplog").name,
  
  require("./entry").name,
])


.factory("DirectoryEntry", ["Entry", "oplog", function (Entry, oplog) {
  function DirectoryEntry (parent, filename, entryId) {
    Entry.call(this, parent, filename, entryId);
    
    this.children = {};
  }
  
  DirectoryEntry.prototype = _.create(Entry.prototype);
  
  DirectoryEntry.prototype.destroy = function () {
    Entry.prototype.destroy.call(this);
    
    var self = this;
    
    _.forEach(this.children, function (entry) {
      self.removeChild(entry);
      
      entry.destroy();
    });
  };
  
  
  DirectoryEntry.prototype.getChildById = function (entryId) {
    return this.children[entryId];
  };
  
  DirectoryEntry.prototype.getChildByFilename = function (filename) {
    return _.find(this.children, function (child) { return child.getFilename() === filename; });
  };
  
  DirectoryEntry.prototype.hasChildByFilename = function (filename) {
    return !!this.getChildByFilename(filename);
  };
  
  DirectoryEntry.prototype.isDirectory = function () { return true; };
  DirectoryEntry.prototype.isFile = function () { return false; };
  
  DirectoryEntry.prototype.addChild = function (entry) {
    this.children[entry.getId()] = entry;
  };
  
  DirectoryEntry.prototype.removeChild = function (entryOrEntryId) {
    var entryId = entryOrEntryId;
    
    if (!_.isString(entryOrEntryId)) entryId = entryOrEntryId.getId();
    
    var entry = this.children[entryId];
    
    if (entry) {
      delete this.children[entryId];
    }
    
    return entry;
  };
  
  
  DirectoryEntry.prototype.toJSON = function () {
    return {
      filename: this.getFilename(),
      path: this.getPath(),
      children: _.map(this.children, function (entry) {
        return entry.toJSON();
      })
    };
  };
  
  return DirectoryEntry;
}]);
