var angular = window.angular;

module.exports = 
angular.module("plunker.service.settings", [
])

.factory("settings", [function () {
  return {
    editor: {
      tabSize: 2
    },
    previewer: {
      autoRefresh: true,
      refreshInterval: 1000,
    }
  };
}]);