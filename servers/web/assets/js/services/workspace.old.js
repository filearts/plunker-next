var Fs = require("fs");
var _ = require("lodash");
  

var Workspace = require("./workspace/workspace");

require("../services/commands");
require("../services/project");
require("../services/settings");

require("../directives/codeEditor");


var module = angular.module("plunker.service.workspace", [
  "plunker.service.commands",
  "plunker.service.project",
  "plunker.service.settings",
  
  "plunker.directive.codeEditor"
]);

module.controller("WorkspaceController", ["$scope", "commander", function ($scope, commander) {
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

}])

module.run(["$templateCache", function ($templateCache) {
  $templateCache.put("partials/directives/workspace.html", Fs.readFileSync(__dirname + "/../../../public/partials/directives/workspace.html", "utf8"));
}]);

module.factory("workspace", ["commander", "project", function (commander, keybindings, project) {
  var workspace = new Workspace();
  
  workspace.split([0, 0]);
  
  
  
  return workspace;
  
  var nextPaneId = 0
    , active = {row: 0, col: 0}
    , layout = []
    , history = []
    , panes = {}
    , paneHandlers = {};


  split(active);
  
  commands.register("space.activate", ["coords", activate]);
  commands.register("space.next", ["direction", spaceNext], {direction: 1});
  commands.register("space.prev", ["direction", spaceNext], {direction: -1});
  commands.register("space.close", ["coords", closeByCoords], function (locals) {
    return {
      coords: getActivePaneCoords()
    };
  });
  commands.register("space.split", ["coords", "direction", "activateOnSplit", split], function (locals) {
    return {
      activateOnSplit: false,
      coords: getActivePaneCoords(),
      direction: "h"
    };
  });
    
  commands.register("file.open", ["entry", "options", fileOpen], {options: {}});
  commands.register("file.close", ["entry", fileClose]);
  commands.register("file.openDefault", fileOpenDefault, {options: {}});

  commands.register("preview.close", ["open", previewToggle], {open: false});
  commands.register("preview.open", ["open", previewToggle], {open: true});
  commands.register("preview.toggle", ["open", previewToggle], {open: void 0});

  keybindings.bindKey({win: "CTRL-SHIFT-ENTER", mac: "OPTION-SHIFT-ENTER"}, "preview.toggle");
  keybindings.bindKey({win: "CTRL-UP", mac: "OPTION-UP"}, "space.prev");
  keybindings.bindKey({win: "CTRL-DOWN", mac: "OPTION-DOWN"}, "space.next");


  return {
    getActivePaneCoords: getActivePaneCoords,
    getActivePaneId: getActivePaneId,
    getActivePaneData: getActivePaneData,
    getPane: getPane,
    getPaneById: getPane,
    getPaneCoords: getPaneCoords,
    getPaneData: getPaneData,
    getPaneIdByCoords: getPaneIdByCoords,
    getPanes: function(){return panes;},
    getLayout: function(){return layout;},
    isActiveById: isPaneActiveById,
    isOpenById: isPaneOpenById,
    isPreviewOpen: isPreviewOpen,

    history: history,

    registerPaneHandler: registerPaneHandler,
    getPaneHandler: getPaneHandler,
  };

  function getPaneHandler (type) {
    return paneHandlers[type];
  }

  function registerPaneHandler (type, handler) {
    paneHandlers[type] = handler;
  }

  function activate(coords) {
    active.col = Math.max(0, Math.min(layout.length - 1, coords.col));
    active.row = Math.max(0, Math.min(layout[active.col].length - 1, coords.row));

    angular.copy(_.without(history, getActivePaneId()), history);
    history.unshift(getActivePaneId());
  }

  function spaceNext(direction) {
    var paneId = history[(history.length + direction) % history.length]
      , coords = getPaneCoords(paneId);

    activate(coords);
  }

  function getActivePane() {
    return getPane(getActivePaneId());
  }
  
  function getActivePaneCoords() {
    return active;
  }
  
  function getActivePaneId() {
    return getPaneIdByCoords(getActivePaneCoords());
  }
  
  function getPane(paneId) {
    return panes[paneId];
  }
  
  function getActivePaneData() {
    return getPaneData(getActivePaneId());
  }
  
  function getPaneByCoords(coords) {
    if (layout[coords.col]) {
      return getPane(layout[coords.col][coords.row]);
    }
  }
  
  function getPaneCoords(paneId) {
    for (var col = 0; col < layout.length; col++) {
      var rows = layout[col];
      
      for (var row = 0; row < rows.length; row++) {
        if (rows[row] === paneId) return {
          row: row,
          col: col
        };
      }
    }
  }
  
  function getPaneData(paneId) {
    return getPane(paneId).data;
  }
  
  function getPaneIdByCoords(coords) {
    if (layout[coords.col]) return layout[coords.col][coords.row];
  }
  
  function isPaneActiveById(paneId) {
    return getActivePaneId() === paneId;
  }
  
  function isPaneOpenById(paneId) {
    return !!panes[paneId];
  }
  
  function split(coords, direction, activateOnSplit) {
    var paneDef = {
      id: nextPaneId++,
      title: "Empty",
      type: "empty"
    };
    
    direction || (direction = "horizontal");
    
    coords.row || (coords.row = 0);
    coords.col || (coords.col = 0);
    
    if (direction[0] === "h") {
      coords.row = 0;
      coords.col += 1;
      
      layout.splice(coords.col, 0, [paneDef.id]);

    } else if (direction[0] === "v") {
      coords.row += 1;
      coords.col = Math.max(0, Math.min(layout.length - 1, coords.col));
      
      layout[coords.col].splice(coords.row, 0, paneDef.id);
    }

    panes[paneDef.id] = paneDef;

    angular.copy(_.without(history, paneDef.id), history);
    history.push(paneDef.id);
    
    if (activateOnSplit) activate(coords);

    return coords;
  }

  function closeByCoords(coords) {
    var paneId = getPaneIdByCoords(coords);

    if (layout.length <= coords.col || layout[coords.col].length <= coords.row) return;
    
    layout[coords.col].splice(coords.row, 1);

    delete panes[paneId];

    angular.copy(_.without(history, paneId), history);
    
    if (!layout[coords.col].length) layout.splice(coords.col, 1);
    
    if (!layout.length) {
      split(active, "h", false);
    }

    commands.exec("space.activate", {coords: getPaneCoords(history[0])});
  }
  
  function fileOpenDefault() {
    var entry = null;
    
    project.traverse(function (visit) {
      if (0 <= ["index.html"].indexOf(visit.filename)) {
        entry = visit;
      }
    });
    
    commander.exec("file.open", {entry: entry});
  }

  function getLastUnlockedPaneCoords () {
    for (var i = 0; i < history.length; i++) {
      var paneId = history[i]
        , paneDef = panes[paneId];

      if (!paneDef.locked) {
        return getPaneCoords(paneId);
      }
    };

    return split(getActivePaneCoords(), "h");
  }

  function fileOpen(entry, options) {
    var coords = null;
      
    options || (options = {});
    
    if (angular.isString(entry)) {
      entry = project.getEntryById(entry);
    }
    
    if (!entry) return;
    
    coords = getPaneCoords(entry.id);
    
    if (coords) {
      activate(coords);
      return;
    }
    
    if (options.target === "col") {
      coords = split(getActivePaneCoords(), "v");
    } else if (options.target === "row") {
      coords = split(getActivePaneCoords(), "h");
    } else {
      coords = options.coords || getLastUnlockedPaneCoords();
    }

    var paneDef = getPaneByCoords(coords);
    
    delete panes[paneDef.id];
    
    layout[coords.col][coords.row] = entry.id;

    panes[entry.id] = {
      id: entry.id,
      type: "code",
      title: entry.path,
      data: entry
    };

    angular.copy(_.without(history, paneDef.id), history);

    activate(coords);
  }

  function fileClose (entry) {
    var coords = getPaneCoords(entry.id);
    
    if (coords) {
      closeByCoords(coords);
    }
  }

  function previewToggle (open) {
    console.log("previewToggle", open, getPaneCoords('preview'));
    var coords = getPaneCoords('preview');

    if (open === void 0) open = !coords;

    if (open) {
      if (!coords) {
        console.log("max", _.max(layout, "length"),_.max(layout, "length").length > 1, layout.length <= layout[layout.length - 1].length);

        if (!coords && getActivePane().type === 'empty') {
          coords = getActivePaneCoords();
        } else if (_.max(layout, "length").length > 1 && layout.length > layout[layout.length - 1].length) {
          coords = split({row: 0, col: layout.length - 1}, "v");
        } else {
          coords = split({row: 0, col: layout.length - 1}, "h");
        }

        var paneDef = getPaneByCoords(coords);

        delete panes[paneDef.id];

        angular.copy(_.without(history, paneDef.id), history);
        
        layout[coords.col][coords.row] = 'preview';

        panes['preview'] = {
          id: 'preview',
          type: 'preview',
          title: "Live preview",
          locked: true,
          data: {}
        };

        history.unshift('preview');
      }
    } else if (coords) {
      closeByCoords(coords);
    }
  }

  function isPreviewOpen () {
    return !!getPaneCoords('preview');
  }
}]);

module.controller("WorkspaceController", [ function () {
  
}])


module.directive("paneHierarchy", ["workspace", function(workspace){
  return {
    restrict: "E",
    replace: true,
    templateUrl: "partials/directives/workspace.html",
    controller: ["$scope", function($scope){
      $scope.layout = workspace.getLayout();
      $scope.panes = workspace.getPanes();
      $scope.active = workspace.active;
      $scope.getPane = workspace.getPane;
      $scope.isActive = workspace.isActiveById;
    }]
  };
}]);

module.directive("workspacePane", [ "$compile", "$injector", "workspace", function ($compile, $injector, workspace) {
  return {
    restrict: "A",
    replace: false,
    link: function ($scope, $element, $attrs) {
      var childScope = null;

      $attrs.$observe("workspacePane", function (paneId) {
        var pane = workspace.getPane(paneId)
          , paneHandler;

        if (childScope) childScope.$destroy();

        childScope = $scope.$new();

        if (pane && (paneHandler = workspace.getPaneHandler(pane.type))) {
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
}]);

module.run(["workspace", function (workspace) {
  workspace.registerPaneHandler("code", {
    template: Fs.readFileSync(__dirname + "/../../../public/partials/panes/code.html", "utf8"),
  });

  workspace.registerPaneHandler("preview", {
    template: Fs.readFileSync(__dirname + "/../../../public/partials/panes/preview.html", "utf8"),
    controller: ["$scope", "settings", "commands", function ($scope, settings, commands) {
      $scope.settings = settings;

      $scope.$watch("settings.previewer.autoRefresh", function (autoRefresh, prevAutoRefresh) {
        if (autoRefresh && prevAutoRefresh === false) {
          commands.exec("preview.refresh");
        }
      })
    }]
  });

  workspace.registerPaneHandler("empty", {
    template: Fs.readFileSync(__dirname + "/../../../public/partials/panes/empty.html", "utf8"),
  });
}]);


module.directive("paneViewer", ["$compile", "workspace", function($compile, workspace){
  return {
    restrict: "A",
    replace: true,
    template: "<div></div>",
    link: function($scope, $element, $attrs){
      var $childScope
        , pane = null
        , markup = "";
      
      $scope.$watch(isActive, function(active) {
        if (active) $scope.$broadcast("pane-active");
      });
      
      function isActive() {
        return pane && workspace.isActiveById(pane.id);
      }
      
      $attrs.$observe("paneViewer", function(paneId){
        pane = workspace.getPaneById(paneId);
        
        if (!pane || !pane.type) return;
        
        switch (pane.type) {
          case 'code':
            markup = '<ace-editor></ace-editor>';
            break;
          case 'preview':
            markup = '<plunker-previewer></plunker-previewer>';
            break;
          default:
            markup = '<strong>EMPTY</strong>';
        }
        
        var tree = angular.element(markup);
        
        if ($childScope) $childScope.$destroy();
        $element.empty();
        
        $childScope = $scope.$new();
        $childScope.pane = pane;
        
        $compile(tree)($childScope);
        $element.append(tree);
      });
    }
  };
}]);