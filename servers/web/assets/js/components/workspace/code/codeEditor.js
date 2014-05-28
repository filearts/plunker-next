var ace = window.ace;
var angular = window.angular;

module.exports =
angular.module("plunker.directive.codeEditor", [
  require("../../commander").name,
  require("../../oplog").name,
])

.directive("codeEditor", ["$rootScope", "$q", "commander", "oplog", function($rootScope, $q, commander, oplog){
  var AceEditor = ace.require("ace/editor").Editor
    , Renderer = ace.require("ace/virtual_renderer").VirtualRenderer;

  return {
    restrict: "E",
    replace: true,
    template: "<div></div>",
    scope: {
      editSession: "="
    },
    link: function($scope, $element, $attrs){
      var editor = new AceEditor(new Renderer($element[0], "ace/theme/textmate"));
      
      editor.setSession($scope.editSession);
      
      withModule("ace/ext/language_tools").then(function() {
        editor.setOptions({
          enableBasicAutocompletion: true,
          enableSnippets: true      
        });
      });

      commander.attachTo(editor);

      $scope.$on("pane-active", function(e){
        editor.focus();
      });

      $scope.$on("fa-pane-resize", function () {
        editor.resize();
      });

      $scope.$on("$destroy", function () {
        editor.blur();
      });
    }
  };
  
  function withModule(moduleName) {
    var dfd = $q.defer();
    
    ace.config.loadModule(moduleName, function(module){
      if (module) { dfd.resolve(module); }
      else { dfd.reject("Failed to load module") }
    });
    
    return dfd.promise;
  }
}]);