var angular = window.angular;

var Fs = require("fs");


require("../../vendor/angular-timeago/angular-timeago");


module.exports =
angular.module("plunker.component.sidebar", [
  "yaru22.angular-timeago",
  "ui.bootstrap",
  
  require("./project").name,
  require("./commander").name,
  
  require("./sidebar/tree/fileTree").name
])

.filter("slice", function () {
  return function (text, n) { return String(text).substring(0, n); };
})


.directive("plunkerSidebar", [ function () {
  return {
    restrict: "E",
    replace: true,
    template: Fs.readFileSync(__dirname + "/sidebar/sidebar.html", "utf8"),
    controller: require("./sidebar/sidebarController"),
    controllerAs: "sidebar"
  };
}]);