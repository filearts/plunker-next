var module = angular.module("plunker.routes.landing", [
]);

module.config(["$stateProvider", "$urlRouterProvider", function($stateProvider, $urlRouterProvider){
  $stateProvider.state("landing", {
    url: "/",
    templateUrl: "partials/views/landing.html",
    controller: ["$scope", "$state", function($scope, $state){
      $state.go("editor");
    }]
  });
}]);
