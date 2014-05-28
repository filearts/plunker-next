var angular = window.angular;

var Fs = require("fs");
var _ = require("lodash");

module.exports = 
angular.module("plunker.directive.fileTree", [
  require("../../commander").name,
  require("../../notifier").name,

  require("../../workspace").name
])

.filter("toArray", function () {
  return function (obj) { return _.values(obj); };
})

.directive("fileTree", ["$q", "$window", "commander", "notifier", "workspace", function ($q, $window, commander, notifier, workspace) {
  return {
    restrict: "E",
    replace: true,
    scope: {
      tree: "=",
      closed: "@"
    },
    template: Fs.readFileSync(__dirname + "/fileTree.html", "utf8"),
    link: function($scope, $element, $attrs){
      var openRight = false
        , openDown = false;

      $window.addEventListener("keydown", onKeyDown);
      $window.addEventListener("keyup", onKeyUp);

      $scope.open = function ($event, entry, options) {
        $event.stopPropagation();

        if (openRight && openDown) {
          if (workspace.isOpen("code", entry.entryId)) {
            commander.execute("workspace.close", {coords: workspace.getCoords("code", entry.entryId)});
          }
          return;
        }
        
        var coords = workspace.getCoords("code", entry.entryId);
        
        if (coords) {
          return commander.execute("workspace.activate", {coords: coords});
        }
        
        if (!options) options = {};
        
        coords = workspace.getActivePaneCoords();
        
        if (openRight || options.split === 'parent') {
          coords = workspace.split(coords, false);
        } else if (openDown || options.split === 'child') {
          coords = workspace.split(coords, true);
        }
        
        return commander.execute("workspace.open", {coords: coords, type: "code", id: entry.entryId}).then(function () {
          return commander.execute("workspace.activate", {coords: coords});
        });
      };

      $scope.rename = function ($event, entry) {
        $event.stopPropagation();

        notifier.prompt("New filename?", entry.filename).then(function (filename) {
          if (filename) {
            if (entry.isFile()) return commander.execute("file.rename", {parent: entry.parent, file: entry, filename: filename});
            if (entry.isDirectory()) return commander.execute("directory.rename", {parent: entry.parent, directory: entry, filename: filename});
          }
        });
     };


      $scope.remove = function ($event, entry) {
        $event.stopPropagation();
        
        if (!entry.parent) return;
        
        var coords = workspace.getCoords('code', entry.getId());

        if (entry.isDirectory()) {
          return notifier.confirm("Are you sure that you would like to remove this folder and all its children?").then(function (answer) {
            if (answer) { 
              if (coords) commander.execute("workspace.close", {coords: coords});
              
              return commander.execute("directory.remove", {parent: entry.parent, directory: entry});
            }
          });
        } else if (entry.isFile()) {
          return notifier.confirm("Are you sure that you would like to remove this file?").then(function (answer) {
            if (answer) { 
              if (coords) commander.execute("workspace.close", {coords: coords});
              
              return commander.execute("file.remove", {parent: entry.parent, file: entry});
            }
          });
        }
      };

      $scope.createDir = function ($event, parent) {
        $event.stopPropagation();
        
        notifier.prompt("Directory name?").then(function (filename) {
          if (filename) {
            commander.execute("directory.create", {parent: parent, filename: filename});
          }
        });
      };

      $scope.createFile = function ($event, parent) {
        $event.stopPropagation();
        
        notifier.prompt("Filename?").then(function (filename) {
          if (filename) {
            commander.execute("file.create", {parent: parent, filename: filename}).then(function (entry) {
              return $scope.open($event, entry);
            });
          }
        });
      };
      
      $scope.isActive = function (entry) {
        return workspace.isActive("code", entry.entryId);
      };
      
      $scope.isOpen = function (entry) {
        return workspace.isOpen("code", entry.entryId);
      };

      $scope.$on("$destroy", function () {
        $window.removeEventListener("keydown", onKeyDown);
        $window.removeEventListener("keyup", onKeyUp);
      });

      function onKeyDown (e) {

        var digest = false;
        if (e.ctrlKey) {
          digest |= !openRight;
          $element.addClass("control-key");
          openRight = true;
        }
        if (e.shiftKey) {
          digest |= !openDown;
          $element.addClass("shift-key");
          openDown = true;
        }

        if (digest) $scope.$digest();
      }

      function onKeyUp (e) {
        var digest = false;

        if (!e.ctrlKey) {
          digest |= openRight;
          $element.removeClass("control-key");
          openRight = false;
        }
        if (!e.shiftKey) {
          digest |= openRight;
          $element.removeClass("shift-key");
          openDown = false;
        }

        if (digest) $scope.$digest();
      }
    }
  };
}])

.directive("fileTreeRecurse", ["$compile", function($compile){
  return {
    restrict: "E",
    replace: true,
    template: "<div></div>",
    scope: {
      tree: "="
    },
    link: function($scope, $element, $attrs){
      var tree = angular.element('<file-tree tree="tree"></file-tree>');
      
      $compile(tree)($scope);
      $element.replaceWith(tree);
    }
  };
}]);
