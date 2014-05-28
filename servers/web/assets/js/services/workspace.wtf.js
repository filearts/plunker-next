var Fs = require("fs");
var _ = require("lodash");
  

var Workspace = require("./workspace/workspace");


require("../../vendor/borderLayout/borderLayout.coffee");

require("../services/commander");
require("../services/project");


module.exports = 
angular.module("plunker.service.workspace", [
  "plunker.service.commander",
  "plunker.service.project",
  
  "fa.directive.borderLayout"
])

.controller("WorkspaceController", ["$scope", "commander", function ($scope, commander) {
  var workspace = new Workspace();
  
  workspace.split([0, 0]);

  commander.addCommand({
    scope: $scope,
    name: "workspace.activate",
    description: "Activate the pane at the selected coordinates",
    handler: ["coords", workspace.activate.bind(workspace)],
    defaults: function () {
      // Default of this command is a noop
      return {coords: workspace.getActivePaneCoords()};
    }
  });
  
  commander.addCommand({
    scope: $scope,
    name: "workspace.split.x",
    description: "Split the current workspace pane along the primary axis",
    handler: ["coords", "splitChild", workspace.split.bind(workspace)],
    defaults: function () {
      return {coords: workspace.getActivePaneCoords(), splitChild: false};
    }
  });
  
  commander.addCommand({
    scope: $scope,
    name: "workspace.split.y",
    description: "Split the current workspace pane along the secondary axis",
    handler: ["coords", "splitChild", workspace.split.bind(workspace)],
    defaults: function () {
      return {coords: workspace.getActivePaneCoords(), splitChild: true};
    }
  });
  
  this.layout = workspace.layout;
  

}])

.run(["$templateCache", function ($templateCache) {
  $templateCache.put("partials/directives/workspace.html", Fs.readFileSync(__dirname + "/../../../public/partials/directives/workspace.html", "utf8"));
}])



.directive("plunkerWorkspace", ["workspace", function(workspace){
  return {
    restrict: "E",
    replace: true,
    templateUrl: "partials/directives/workspace.html",
    controller: "WorkspaceController",
    controllerAs: "workspace"
  };
}])

.directive("plunkerWorkspacePane", [ "$compile", "$injector", "panes", function ($compile, $injector, panes) {
  return {
    restrict: "A",
    replace: false,
    scope: { pane: "=plunkerWorkspacePane" },
    link: function ($scope, $element, $attrs) {
      var childScope = null;

      $scope.$watch("pane", function (pane) {
        var paneHandler;

        if (childScope) childScope.$destroy();

        childScope = $scope.$new();
        
        childScope.$close = function () {
          
        };

        if (pane && (paneHandler = panes.getHandler(pane.type))) {
          var markup = angular.element(paneHandler.template);

          childScope.entry = pane;

          $compile(markup)(childScope);
          $element.empty().append(markup);

          if (paneHandler.controller) {
            $injector.invoke(paneHandler.controller, paneHandler, {$scope: childScope, $element: markup});
          }
        }
      });
    }
  };
}])


.factory("panes", [ function () {
  var panes = {
    handlers: {}
  };
  
  panes.getHandler = function (type) {
    return panes.handlers[type];
  };
  
  panes.registerHandler = function (type, handler) {
    panes.handlers[type] = handler;
  };
  
  return panes;
}]);