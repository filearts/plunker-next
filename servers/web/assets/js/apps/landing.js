require("../../vendor/angular/angular.js");

var angular = window.angular;

require("../../vendor/angular-timeago/angular-timeago");
require("../../vendor/ui-bootstrap/ui-bootstrap.js");


module.exports = 
angular.module('plunker', [
  "yaru22.angular-timeago",
  "ui.bootstrap",
  
  
  require("../components/markdown").name,
  require("../components/userPane").name,
])



.config(["$tooltipProvider", function($tooltipProvider){
  $tooltipProvider.options({
    appendToBody: true,
    popupDelay: 200,
  });
}])


.filter("slice", function () {
  return function (text, n) { return String(text).substring(0, n); };
})


;