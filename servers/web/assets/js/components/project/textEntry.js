var ace = window.ace;
var angular = window.angular;

var _ = require("lodash");

module.exports =
angular.module("plunker.project.textEntry", [
  require("../../components/oplog").name,
  require("../../components/settings").name,
  
  require("./entry").name,
])


.factory("TextEntry", ["Entry", "oplog", "settings", function (Entry, oplog, settings) {
  var EditSession = ace.require("ace/edit_session").EditSession;
  var Range = ace.require("ace/range").Range;
  var UndoManager = ace.require("ace/undomanager").UndoManager;


  function TextEntry (parent, filename, id) {
    Entry.call(this, parent, filename, id);
    
    var self = this;
    var remoteEvent = false;
    
    this.contents = "";
    this.editSession = new EditSession("");
    this.editSession.setUndoManager(new UndoManager());
    this.editSession.setTabSize(settings.editor.tabSize);
    
    this.editSession.on("change", function (e) {
      self.contents = self.editSession.getValue();
      
      if (remoteEvent) return;
      
      var doc = self.editSession.doc;
      var nl = doc.getNewLineCharacter();
      
      switch (e.data.action) {
        case "insertText":
          oplog.local.write({op: "text.insert", entryId: self.id, offset: doc.positionToIndex(e.data.range.start), text: e.data.text});
          break;
        case "insertLines":
          oplog.local.write({op: "text.insert", entryId: self.id, offset: doc.positionToIndex(e.data.range.start), text: e.data.lines.join(nl) + nl});
          break;
        case "removeText":
          oplog.local.write({op: "text.remove", entryId: self.id, offset: doc.positionToIndex(e.data.range.start), text: e.data.text});
          break;
        case "removeLines":
          oplog.local.write({op: "text.remove", entryId: self.id, offset: doc.positionToIndex(e.data.range.start), text: e.data.lines.join(nl) + nl});
      }
    });
    
    this.remoteEvents = oplog.remote.fork().filter(function (e) {
      return (e.entryId === self.id);
    });
    
    this.remoteEvents.each(function (e) {
      var doc = self.editSession.doc;
      
      remoteEvent = true;
      
      if (e.op === 'text.insert') {
        doc.insert(e.offset, e.text);
      } else if (e.op === 'text.remove') {
        var start = doc.indexToPosition(e.offset);
        var end = doc.indexToPosition(e.offset + e.text.length);
        
        doc.remove(Range.fromPoints(start, end));
      }
      
      remoteEvent = false;
    });
    
    this.updateMode();
  }
  
  TextEntry.prototype = _.create(Entry.prototype);
  
  TextEntry.prototype.destroy = function () {
    Entry.prototype.destroy.call(this);
    
    this.remoteEvents.destroy();
    
    this.editSession = null;
  };
  
  
  TextEntry.prototype.getContents = function () { return this.contents; };
  
  TextEntry.prototype.isEmpty = function () { return !this.getContents(); };
  TextEntry.prototype.isFile = function () { return true; };
  TextEntry.prototype.isDirectory = function () { return false; };
  
  TextEntry.prototype.insert = function (offset, text) {
    var doc;
    
    if (this.editSession && (doc = this.editSession.doc)) {
      doc.insert(doc.indexToPosition(offset), text);
    }
  };
  
  TextEntry.prototype.remove = function (offset, text) {
    var doc;
    
    if (this.editSession && (doc = this.editSession.doc)) {
      var range = Range.fromPoints(doc.indexToPosition(offset), doc.indexToPosition(offset + text.length));
      
      doc.remove(range);
    }
  };
  
  TextEntry.prototype.setFilename = function (filename) {
    Entry.prototype.setFilename.call(this, filename);
    
    this.updateMode();
  };
  
  TextEntry.prototype.toJSON = function () {
    return {
      filename: this.getFilename(),
      path: this.getPath(),
      contents: this.getContents()
    };
  };
  
  TextEntry.prototype.updateMode = function (mode) {
    var self = this;
    
    ace.config.loadModule("ace/ext/modelist", function (modelist) {
      // It is possible that the file was destroyed before getting access to the
      // modelist module.
      if (self.editSession) {
        self.editSession.setMode(modelist.getModeForPath(self.filename).mode);
      }
    });
  };
  
  return TextEntry;
}]);