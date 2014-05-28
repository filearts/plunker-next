var angular = window.angular;

var _ = require("lodash");

module.exports =
angular.module("plunker.component.workspace.panes", [])

.factory("panes", [function () {
  var panes = {
    handlers: {},
    registerHandler: function (type, paneHandler) {
      panes.handlers[type] = _.defaults(paneHandler, {
        preLink: angular.noop,
        link: angular.noop
      });
    },
    getHandler: function (type) {
      return panes.handlers[type];
    }
  };
  
  return panes;
}]);