var angular = window.angular;

var Fs = require("fs");

require("../../vendor/ui-bootstrap/ui-bootstrap");
require("../../vendor/borderLayout/borderLayout.coffee");


module.exports =
angular.module("plunker.component.toolbar", [
  "ui.bootstrap",

  "fa.directive.borderLayout",
  
  require("./workspace").name,
  require("./project").name,
  require("./visitor").name,
  require("./commander").name
])

.directive("plunkerToolbar", [ function () {
  return {
    restrict: "E",
    replace: true,
    template: Fs.readFileSync(__dirname + "/toolbar/toolbar.html", "utf8"),
    controllerAs: "toolbar",
    controller: ["$scope", "$modal", "paneManager", "project", "visitor", "workspace", "commander", function ($scope, $modal, paneManager, project, visitor, workspace, commander) {
      var self = this;
      
      $scope.project = project;
      
      this.isSaved = function () { return project.isSaved(); };
      this.isSavable = function () { return project.isSavableBy(visitor.user); };
      this.isForkable = function () {return project.isForkable(visitor.user); };
      this.isOpen = function () { return workspace.isOpen('preview', 'preview'); };
      this.isPublishable = function () {return project.isSaved() && project.isSavableBy(visitor.user) && visitor.isMember(); };
      
      this.isCommentsOpen = function () {
        var commentsPane = paneManager.get("comments");
        
        if (commentsPane) return !commentsPane.closed;
      };
    
      this.toggleComments = function() {
        commander.execute("comments.toggle");
      };
     
      this.togglePreview = function() {
        commander.execute("preview.toggle");
      };
     
      this.openTemplates = function() {
        commander.execute("project.openTemplates");
      };
      
      this.publish = function () {
        // The editor state will be changed in editor routes
        commander.execute("project.openPublisher");
      };
      
      this.fork = function () {
        // The editor state will be changed in editor routes
        commander.execute("project.fork");
      };
      
      this.save = function () {
        // The editor state will be changed in editor routes
        commander.execute("project.save");
      };
    
      this.edit = function () {
        commander.execute("project.edit");
      };
    
      this.new = function () {
        commander.execute("editor.reset");
      };
      
      this.destroy = function () {
        // The editor state will be changed in editor routes
        commander.execute("project.destroy", {plunkId: project.plunk.id});
      };
    }]
  };
}]);