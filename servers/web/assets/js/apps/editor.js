require("../../vendor/angular/angular.js");

var Fs = require("fs");
var _ = require("lodash");

var angular = window.angular;
require("../../vendor/ui-bootstrap/ui-bootstrap.js");

module.exports =
angular.module('plunker', [
  "ui.bootstrap",
  
  "fa.directive.borderLayout",

  require("../components/commander").name,
  require("../components/notifier").name,
  require("../components/project").name,
  require("../components/toolbar").name,
  require("../components/sidebar").name,
  require("../components/overlayer").name,
  require("../components/workspace").name,
  require("../components/urlState").name,
  require("../components/userPane").name,
  require("../components/commentsPane").name,
])

.config(["$locationProvider", function($locationProvider){
  $locationProvider.html5Mode(true).hashPrefix("!");
}])

.config(["$tooltipProvider", function($tooltipProvider){
  $tooltipProvider.options({
    appendToBody: true,
    popupDelay: 200,
  });
}])


.run(["$rootScope", "notifier", function ($rootScope, notifier) {
  var success = function (message) { return function () { notifier.success(message); }; };
  var error = function (message) { return function () { notifier.error(message); }; };
  
  $rootScope.$on("project.save.success", success("Project saved"));
  $rootScope.$on("project.fork.success", success("Project forked"));
  $rootScope.$on("project.open.success", success("Project opened"));
  $rootScope.$on("project.destroy.success", success("Project destroyed"));
  $rootScope.$on("project.openTree.success", success("File tree loaded"));
  
  $rootScope.$on("project.save.error", error("Failed to save project"));
  $rootScope.$on("project.fork.error", error("Failed to fork project"));
  $rootScope.$on("project.open.error", success("Failed to open project"));
  $rootScope.$on("project.destroy.error", error("Failed to destroy project"));
  $rootScope.$on("project.openTree.error", error("Failed to open tree"));
}])

.controller("EditorController", ["$scope", "$location", "urlState", "commander", "project", "notifier", function ($scope, $location, urlState, commander, project, notifier) {
  commander.addCommand({
    name: "editor.reset",
    handler: function () {
      return commander.execute("project.reset").then(function () {
        return commander.execute("project.openTree", {
          tree: [
            {
              type: "file",
              filename: "index.html",
              contents: Fs.readFileSync(__dirname + "/editor/template/index.html", "utf8")
            },
            {
              type: "file",
              filename: "style.css",
              contents: Fs.readFileSync(__dirname + "/editor/template/style.css", "utf8")
            },
            {
              type: "file",
              filename: "script.js",
              contents: Fs.readFileSync(__dirname + "/editor/template/script.js", "utf8")
            },
          ]
        });
      });
    }
  });
  
  commander.addCommand({
    name: "editor.open",
    defaults: {
      tree: ""
    },
    handler: ["plunkId", "tree", function (plunkId, tree) {
      if (project.plunk && project.plunk.id === plunkId) return;
    
      return commander.execute("project.open", {plunkId: plunkId}).then(function () {
        if (tree) {
          return commander.execute("project.openTree", {tree: tree}).catch(function (err) {
            notifier.error("Failed to open the tree: " + treeState.read());
            
            return commander.execute("project.openTree", {tree: project.getLastRevision().tree}).catch(function (err) {
              return commander.execute("editor.reset").then(function () {
                notifier.error("Failed to open the given tree and the plunk's last revision");
              });
            });
          });
        } else {
          return commander.execute("project.openTree", {tree: project.getLastRevision().tree}).catch(function (err) {
            return commander.execute("editor.reset").then(function () {
              notifier.error("Failed to open the plunk's last revision");
            });
          });
        }
      }, function (err) {
        return commander.execute("editor.reset").then(function () {
          notifier.error("Failed to open plunk");
        });
      });
    }]
  });

  var plunkIdState = urlState.addState({
    name: "plunkId",
    queue: "project",
    scope: $scope,
    decode: function () {
      return $location.path().slice(6);
    },
    encode: function (plunkId) {
      return $location.path("/edit/" + (plunkId || ""));
    },
    read: function () {
      return project.isSaved() ? project.plunk.id : void 0;
    },
    write: function (plunkId) {
      if (plunkId) {
        return commander.execute("editor.open", {plunkId: plunkId});
      } else {
        return commander.execute("editor.reset");
      }
    }
  });

  var treeState = urlState.addState({
    name: "tree",
    queue: "project",
    scope: $scope,
    decode: function () {
      return $location.search().t;
    },
    encode: function (tree) {
      var search = $location.search();
      
      if (tree && tree !== project.tree) search.t = tree;
      else delete search.t;
      
      return $location.search(search);
    },
    read: function () {
      if (project.isSaved()) return project.tree === project.getLastRevision().tree ? "" : project.tree;
      
      return project.tree; // TODO
    },
    write: function (tree) {
      if (tree) {
        return commander.execute("project.openTree", {tree: tree});
      } else if (project.isSaved()) {
        return commander.execute("project.openTree", {tree: project.getLastRevision().tree});
      }
    }
  });
}])

;
