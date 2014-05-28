var angular = window.angular;

var Fs = require('fs');

module.exports =
angular.module("plunker.pane.empty", [
  require("../panes").name
])

.run(["panes", function (panes) {
  panes.registerHandler("empty", {
    template: Fs.readFileSync(__dirname + "/emptyPane.html", "utf8"),
    link: function ($scope, $element) {
    }
  });
}]);