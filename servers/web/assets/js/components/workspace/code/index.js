var angular = window.angular;

var Fs = require('fs');

module.exports =
angular.module("plunker.pane.code", [
  "ui.bootstrap",
  
  
  require("../../project").name,
  require("../../markdown").name,
  
  require("../panes").name,
  
  require("./codeEditor").name,
])

.run(["$modal", "panes", "project", function ($modal, panes, project) {
  panes.registerHandler("code", {
    template: Fs.readFileSync(__dirname + "/codePane.html", "utf8"),
    preLink: function ($scope, $element) {
      var entry = project.entries[$scope.$id];
      $scope.entry = entry;
      
      $scope.isMarkdown = function (filename) { return (/\.(md|markdown)$/).test(filename); };
      
      $scope.previewMarkdown = function (markdown) {
        $modal.open({
          template: Fs.readFileSync(__dirname + "/markdownPreview.html", "utf8"),
          windowClass: "markdown-preview",
          size: "lg",
          controller: ["$scope", "$modalInstance", function ($scope, $modalInstance) {
            $scope.path = entry.getPath();
            $scope.markdown = markdown;
            $scope.resolve = $modalInstance.close.bind($modalInstance);
            $scope.reject = $modalInstance.dismiss.bind($modalInstance);
          }]
        });
      };
    },
  });
}]);
