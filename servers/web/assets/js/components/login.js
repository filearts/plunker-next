var angular = window.angular;

var Fs = require("fs");
var _ = require("lodash");

require("../../vendor/ui-bootstrap/ui-bootstrap.js");


module.exports =
angular.module("plunker.component.login", [
  "ui.bootstrap",

  require("./register").name,
  require("./oauth").name,
])

.factory("login", ["$modal", "oauth", "visitor", "register", function ($modal, oauth, visitor, register) {
  var login = {};
  
  login.open = function () {
    
    return $modal.open({
      template: Fs.readFileSync(__dirname + "/login/login.html", "utf8"),
      controller: ["$scope", "$modalInstance", function ($scope, $modalInstance) {
        $scope.resolve = $modalInstance.close.bind($modalInstance);
        $scope.reject = $modalInstance.dismiss.bind($modalInstance);

        $scope.identities = oauth.identities;
        $scope.providers = oauth.providers;
        
        $scope.status = {};
        
        oauth.clearIdentities();
        
        $scope.login = function (service) {
          $scope.status.authInProgress = oauth.identify(service).then(function (identities) {
            var loginIdentity = identities[service];
            
            if (!loginIdentity) throw new Error("How is this even possible?");
            
            return visitor.login(loginIdentity).then(function (visitor) {
              return $modalInstance.close(visitor);
            }, function (err) {
              // The user doesn't exist
              if (err.id === "E_NOEXIST") {
                return $modalInstance.close(register.open());
              }
            });
            
          }).catch(function (err) {
            $scope.status.error = err;
          }).finally(function () {
            $scope.status.authInProgress = false;
          });
          
          return $scope.authInProgress;
        };
      }]
      
    }).result;  
  };
  
  return login;
}])

;