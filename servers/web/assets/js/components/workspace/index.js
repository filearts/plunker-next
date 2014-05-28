var Fs = require("fs");
var _ = require("lodash");
var angular = window.angular;

var Workspace = require("./workspace");

require("../../../vendor/borderLayout/borderLayout.coffee");
require("../../../vendor/mousetrap/mousetrap");


module.exports =
angular.module("plunker.component.workspace", [
  "fa.directive.borderLayout",
  
  require("./panes").name,
  require("./empty").name,
  require("./code").name,
  require("./preview").name,
])


.factory("workspace", ["$rootScope", "commander", function ($rootScope, commander) {
  var workspace = new Workspace();

  $rootScope.$on("file.remove.success", function ($event, locals, entry) {
    var coords = workspace.getCoords('code', entry.getId());
    if (coords) commander.execute("workspace.close", {coords: {type:'code', id: entry.getId()}});
  });

  commander.addCommand({
    name: "workspace.activate",
    description: "Activate a pane",
    handler: ["coords", workspace.activate.bind(workspace)]
  });
  
  commander.addCommand({
    name: "workspace.close",
    description: "Close the current pane",
    handler: ["coords", workspace.close.bind(workspace)],
    defaults: function () {
      return { coords: workspace.getActivePaneCoords() };
    }
  });
  
  commander.addCommand({
    name: "workspace.up",
    description: "Switch to pane above (wrapping)",
    hotkeys: "Mod-i",
    handler: ["coords", workspace.activate.bind(workspace)],
    defaults: function () {
      var coords = workspace.getActivePaneCoords();
      
      coords[1] = (coords[1] + workspace.layout[coords[0]].length - 1) % workspace.layout[coords[0]].length;
      
      return { coords: coords };
    }
  });
  
  commander.addCommand({
    name: "workspace.down",
    description: "Switch to pane below (wrapping)",
    hotkeys: "Mod-k",
    handler: ["coords", workspace.activate.bind(workspace)],
    defaults: function () {
      var coords = workspace.getActivePaneCoords();
      
      coords[1] = (coords[1] + workspace.layout[coords[0]].length + 1) % workspace.layout[coords[0]].length;
      
      return { coords: coords };
    }
  });
  
  commander.addCommand({
    name: "workspace.right",
    description: "Switch to pane to the right (wrapping)",
    hotkeys: "Mod-l",
    handler: ["coords", workspace.activate.bind(workspace)],
    defaults: function () {
      var coords = workspace.getActivePaneCoords();
      var rows = workspace.layout[coords[0]].length;
      
      coords[0] = (coords[0] + workspace.layout.length + 1) % workspace.layout.length;
      coords[1] = Math.floor((coords[1] + 1) / rows * (workspace.layout[coords[0]].length - 1));
      
      return { coords: coords };
    }
  });
  
  commander.addCommand({
    name: "workspace.left",
    description: "Switch to pane to the left (wrapping)",
    hotkeys: "Mod-j",
    handler: ["coords", workspace.activate.bind(workspace)],
    defaults: function () {
      var coords = workspace.getActivePaneCoords();
      var rows = workspace.layout[coords[0]].length;
      
      coords[0] = (coords[0] + workspace.layout.length - 1) % workspace.layout.length;
      coords[1] = Math.floor((coords[1] + 1) / rows * (workspace.layout[coords[0]].length - 1));
      
      return { coords: coords };
    }
  });  
  
  commander.addCommand({
    name: "workspace.open",
    description: "Open a file",
    handler: ["coords", "type", "id", "blank", workspace.open.bind(workspace)],
    defaults: function (locals) {
      var coords = workspace.getActivePaneCoords();
      
      if (locals.blank) {
        if (workspace.getPane(coords).type !== 'empty') {
          coords = workspace.split([0, 0], true, true);
        }
      }
      
      return {
        coords: coords, blank: false
      };
    }
  });
  
  commander.addCommand({
    name: "workspace.split",
    description: "Split a pane",
    handler: ["coords", "splitChild", workspace.open.bind(workspace)],
    defaults: function () {
      return { coords: workspace.getActivePaneCoords(), splitChild: false };
    }
  });
  
  commander.addCommand({
    name: "workspace.reset",
    description: "Close all panes in the workspace",
    handler: function () {
      _.forEach(workspace.panes, function (paneId) {
        commander.execute("workspace.close", { coords: paneId });
      })
    }
  });
  
  return workspace;
}])

.directive("plunkerWorkspace", [ function () {
  return {
    restrict: "E",
    replace: true,
    require: "plunkerWorkspace",
    template: Fs.readFileSync(__dirname + "/template.html", "utf8"),
    controller: require("./controller"),
    controllerAs: "workspace",
    link: function ($scope, $element, $attrs, workspaceController) {
    }
  };
}])

.directive("plunkerWorkspacePane", ["$compile", "$timeout", "workspace", "panes", function ($compile, $timeout, workspace, panes) {
  return {
    restrict: "A",
    require: "^plunkerWorkspace",
    link: function ($scope, $element, $attrs, workspaceController) {
      var paneScope = null;
      var paneElement = null;
      var paneNum = null;
      
      $scope.workspace = workspaceController;
      
      $attrs.$observe("plunkerWorkspacePane", function (newPaneNum) {
        paneNum = newPaneNum;
      });
      
      $scope.$watch(getPaneDef, function (paneDef) {
        if (!paneDef) return;
        
        var paneHandler = panes.getHandler(paneDef.type);
        
        if (!paneHandler) throw new Error("WTFBBQ, how did we get an unsupported pane type?");
        
        if (paneScope) paneScope.$destroy();
        
        $element.empty();
        
        paneScope = $scope.$new();
        paneScope.paneNum = parseInt(paneNum, 10);
        paneScope.$type = paneDef.type;
        paneScope.$id = paneDef.id;
        
        paneElement = angular.element(paneHandler.template);

        paneHandler.preLink(paneScope, paneElement);
        
        $compile(paneElement)(paneScope);
        $element.append(paneElement);
        
        paneHandler.link(paneScope, paneElement);

        paneScope.$watch(function () {
          return workspace.getActivePaneNum() === paneScope.paneNum;
        }, function (active) {
          if (active) //$timeout(function () {
            paneScope.$broadcast("pane-active");
          //});
        });

      });
      
      
      function getPaneDef () {
        return workspace.panes[paneNum];
      }
    }
  };
}])

.run(require("./commands"));