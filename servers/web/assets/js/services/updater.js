var Corral = require("corral")
	,	Semver = require("semver");

require("../../vendor/ui-bootstrap/ui-bootstrap.js");

require("../services/api");
require("../services/commands");


var module = angular.module("plunker.service.updater", [
	"plunker.service.api",
	"plunker.service.commands",

	"ui.bootstrap"
]);

module.factory("updater", ["api", function (api) {
	return function updater(markup) {
		var markupFile = Corral(function (packageName, callback) {
			api.all("catalogue").all("packages").one(pkgName).get().then(function (pkgDef) {
      	callback(null, pkgDef);
      }, function (err) {
      	callback(err);
      });
		});

		markupFile.write(markup);

		return markupFile;
	}
}]);


module.run(["$templateCache", function ($templateCache) {
  $templateCache.put("partials/directives/updaterOverlay.html", fs.readFileSync(__dirname + "/../../../public/partials/directives/updaterOverlay.html", "utf8"));
}]);

module.directive("plunkerUpdaterOverlay", ["commands", function (commands) {
	var element = null
		,	directive = {
			templateUrl: "partials/directives/updaterOverlay.html",
			replace: true,
			link: function ($scope, $element, $attrs) {
				element = $element;

				$scope.error = "";
				$scope.pkgRef = "";

				$scope.addPackage = function (pkgRef) {
			    $scope.error = "";
			    $scope.pkgRef = "";
			    
			    file.addDependency(pkgRef)
			      .then ->
			        file.updatePackageTags(pkgRef, updateChildren: true)
			        
			        $scope.compiled = file.toString()
			      , ->
			        $scope.error = "Failed to add package '#{pkgRef}'"
				};

				$scope.getPackages = function (filter) {
					var parts = filter.split("@");

					if (parts.length === 2) {
						api.all("catalogue").all("packages").one(parts[0]).get().then(function (pkgDef) {
							return _(pkgDef.versions)
								.filter(function (verDef) {
									return verDef.semver.indexOf(parts[1]) === 0;
								})
								.sort(function (a, b) {
									return Semver.rcompare(a.semver, b.semver);
								})
								.map(function (verDef) {
									return {text: verDef.semver, value: "#{pkgDef.name}@#{verDef.semver}"};
								})
								.value();
						});
					} else if (parts.length === 1) {
						api.all("catalogue").all("packages").getList({query: filter}).then(function (pkgDefs) {
							return _.map(pkgDefs, function (pkgDef) {
								return {text: pkgDef.name, value: pkgDef.name};
							});
						});
					}
				};
			}
		};
	
	return directive;

	function toggleUpdaterOverlay
}]);