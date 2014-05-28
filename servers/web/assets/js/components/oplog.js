var angular = window.angular;

var Highland = require("highland");

module.exports =
angular.module("plunker.oplog", [
])

.factory("oplog", ["$rootScope", function ($rootScope) {
  
  var oplog = Highland();
  
  oplog.local = Highland();
  oplog.remote = Highland();

  return oplog;
}])

;