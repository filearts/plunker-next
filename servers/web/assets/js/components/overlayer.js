var angular = window.angular;

var Fs = require("fs");

module.exports =
angular.module("plunker.component.overlayer", [
  "ui.bootstrap"
])

.factory("overlayer", [ "$q", function ($q) {
  var queues = {};
  
  var overlayer = {
    enqueue: function (queueId, promise, message) {
      var queue = overlayer.get(queueId);
      queue.push(message);
      
      console.log("Enqueueing", queueId, message);
      
      return $q.when(promise).finally(function () {
        var idx = queue.indexOf(message);
      
        console.log("Finished", queueId, message);
        
        if (idx >= 0) queue.splice(idx, 1);
      });
    },
    get: function (queueId) {
      if (!queues[queueId]) queues[queueId] = [];
      
      return queues[queueId];
    }
  };
      
  return overlayer;
}])

.directive("plunkerOverlay", ["$compile", "overlayer", function ($compile, overlayer) {
  return {
    link: function ($scope, $element, $attrs) {
      var overlayEl = angular.element(Fs.readFileSync(__dirname + "/overlayer/overlay.html", "utf8"));
      var queueId = $attrs.plunkerOverlay;
      
      $element.append(overlayEl);
      $compile(overlayEl)($scope);
      
      $scope.queue = overlayer.get(queueId);
    }
  };
}])

;