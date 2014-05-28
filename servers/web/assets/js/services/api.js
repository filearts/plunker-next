require("../../vendor/restangular/restangular");

require("../services/config");


var module = angular.module("plunker.service.api", [
	"restangular"
]);

module.factory("api", ["Restangular", "config", function (Restangular, config) {
	Restangular.setBaseUrl("http://api.plnkr.co");

	return Restangular;
}]);