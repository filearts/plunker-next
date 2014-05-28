var angular = window.angular;

module.exports =
angular.module("plunker.marked", [
])

.directive("plunkerMarked", [ function () {
  var Range = window.ace.require("ace/range").Range;
  
  return {
    restrict: "E",
    require: "ngModel",
    replace: true,
    template: '<div class="plunker-marked"></div>',
    link: function ($scope, $element, $attrs, model) {
      var editorEl = angular.element("<div></div>");
      
      $element.append(editorEl);
      
      var editor = window.ace.edit(editorEl[0]);
      
      editor.setHighlightActiveLine(false);
      editor.session.setMode("ace/mode/markdown");
      editor.renderer.setShowGutter(!!$attrs.showGutter);
      editor.renderer.setShowPrintMargin(!!$attrs.showPrintMargin);
      //editor.setUseWrapMode(true);
      editor.setOptions({
        minLines: parseInt($attrs.minLines, 10) || 2,
        maxLines: parseInt($attrs.maxLines, 10) || 12
      });
      
      model.$render = function () {
        var doc = editor.session.doc;
        var val = doc.getValue();
        var value = model.$viewValue || "";
        
        doc.replace(Range.fromPoints(doc.indexToPosition(0), doc.indexToPosition(val.length)), value || "");
      };
      
      editor.on("change", function () {
        var contents = editor.session.getValue();
        
        model.$setViewValue(contents);
        
        if (!$scope.$root.$$phase) $scope.$digest();
      });
      
      editor.on("focus", function () {
        $attrs.$addClass("focus");
      });
      
      editor.on("blur", function () {
        $attrs.$removeClass("focus");
      });
      
      $scope.$on("fa-pane-resize", function () {
        editor.resize();
      });
      
      window.ace.config.loadModule("ace/ext/language_tools", function(module){
        editor.setOptions({
          enableBasicAutocompletion: true,
          enableSnippets: true      
        });
      });
    }
  };
}])

;