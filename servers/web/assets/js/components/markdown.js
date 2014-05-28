var angular = window.angular;

var Marked = require("marked");

module.exports =
angular.module("plunker.markdown", [
])

.directive("markdown", ["$q", "$sce", function ($q, $sce) {
  var Dom = window.ace.require("ace/lib/dom");
  var importedCss = false;
  var loadModuleAsync = function (moduleName) {
    var dfd = $q.defer();
    
    window.ace.config.loadModule(moduleName, function (moduleImpl) {
      dfd.resolve(moduleImpl);
    });
    
    return dfd.promise;
  };
  
  return {
    restrict: "A",
    link: function ($scope, $element, $attrs) {
      $element.addClass("markdown");
      
      if ($attrs.markdown) $scope.$watch($attrs.markdown, render);
      else render($element.text().trim());
      
      function render (markdown) {
        var options = {
          highlight: function (code, lang, callback) {
            $q.all([loadModuleAsync("ace/ext/static_highlight"), loadModuleAsync("ace/mode/" + lang), loadModuleAsync("ace/theme/textmate")]).then(function (modules) {
              var rendered = modules[0].renderSync(code.trim(), new modules[1].Mode(), modules[2], 1, true);
              
              if (!importedCss) {
                Dom.importCssString(rendered.css, "ace_static_highlight");
                importedCss = true;
              }
              
              callback(null, rendered.html);
            });
          }
        };
        
        Marked(markdown, options, function (err, markup) {
          if (!err) $element.html($sce.trustAsHtml(markup));
        });
      }
    }
  };
}])

;