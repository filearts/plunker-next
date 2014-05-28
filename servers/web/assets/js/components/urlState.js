var angular = window.angular;

var _ = require("lodash");


module.exports = 
angular.module("plunker.urlState", [])

.directive("urlState", ["$q", "urlState", function ($q, urlState) {
  return {
    link: function ($scope, $element, $attrs) {
      $scope.$watch($attrs.urlState, function (stateParams) {
        var promises = [];
        
        _.forEach(urlState.states, function (state) {
          promises.push($q.when(state.read()).then(function (val) {
            return [ state.name, val ];
          }));
        });
        
        $q.all(promises).then(function (states) {
          var newStateParams = _.defaults(stateParams, _.zipObject(states));
          var url = "/edit/" + newStateParams.plunkId || "";
          var query = [];
          
          if (newStateParams.plunkId != stateParams.plunkId && !stateParams.tree) delete newStateParams.tree;
          
          if (newStateParams.tree) query.push("t=" + newStateParams.tree);
          if (newStateParams.comments) query.push("c=y");
          if (newStateParams.preview) query.push("p=y");
          
          if (query.length) url += "?" + query.join("&");
          
          $attrs.$set("href", url);
        });
      }, true);
    }
  };
}])
 
.factory("urlState", ["$rootScope", "$location", "$q", function ($rootScope, $location, $q) {

  var queues = {}; 
  var states = {};
  var urlstate = {
    states: states
  };
 
  urlstate.addState = function (options) {
    var scope = options.scope || $rootScope;
 
    states[options.name] = options;
 
    var state = states[options.name];
 
    state._watches = [
      // 1: Set up url -> state binding
      scope.$watch(state.decode, handleUrlUpdate),
    
      // 2: Set up state -> url binding
      scope.$watch(state.read, handleStateUpdate),
    ];
 
    function handleUrlUpdate (urlVal) {
      if (state.encoding) return;
      
      var queueId = state.queue || state.name;
      
      state.writing = queues[queueId] = $q.when(queues[queueId]).then(state.read).then(function (stateVal) {
        if (stateVal != urlVal) {
          queues[queueId] = $q.when(state.write(urlVal)).then(function () {
            state.writing = queues[queueId] = null;
          });
          
          return queues[queueId];
        } else {
          state.writing = queues[queueId] = null;
          return stateVal;
        }
      });
    }
 
    function handleStateUpdate (stateVal) {
      if (state.writing) return;
      
      var queueId = state.queue || state.name;
      
      state.encoding = queues[queueId] = $q.when(queues[queueId]).then(state.decode).then(function (urlVal) {
        if (stateVal != urlVal) {
          queues[queueId] = $q.when(state.encode(stateVal)).then(function () {
            state.encoding = queues[queueId] = null;
          });
          
          return queues[queueId];
        } else {
          state.encoding = queues[queueId] = null;
          return stateVal;
        }
      });
    }
 
    scope.$on("$destroy", function () {
      while (state._watches.length) {
        state.watches.pop()();
      }
    });
 
    return state;
  };
 
  return urlstate;
 
 
}])
 
;