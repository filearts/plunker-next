var angular = window.angular;

var Fs = require("fs");
var _ = require("lodash");

require("../../vendor/ui-bootstrap/ui-bootstrap");


module.exports =
angular.module("plunker.component.register", [
  "ui.bootstrap",
  
  "plunker.service.config",
  
  require("./oauth").name,
])

.factory("register", ["$modal", "oauth", "visitor", function ($modal, oauth, visitor) {
  var register = {};
  
  register.open = function () {
    return $modal.open({
      template: Fs.readFileSync(__dirname + "/register/register.html", "utf8"),
      controller: ["$scope", "$modalInstance", function ($scope, $modalInstance) {
        
        $scope.resolve = $modalInstance.close.bind($modalInstance);
        $scope.reject = $modalInstance.dismiss.bind($modalInstance);
        
        $scope.identities = oauth.identities;
        $scope.providers = oauth.providers;
        
        $scope.state = {};
        
        $scope.steps = [
          {
            id: 'identities',
            title: "Link social identities",
            next: "Next",
            prev: "",
            validate: function () { return !_.isEmpty(oauth.identities); }
          }, {
            id: 'profile',
            title: "Create profile",
            next: "Register",
            prev: "Back",
            onEnter: function () {
              if (!$scope.profile) {
                $scope.profile = oauth.buildProfile();
              }
              
              $scope.profileData = oauth.buildProfileData();
            },
            validate: function () { return !_.isEmpty(oauth.identities) && $scope.profile.username; },
            advance: function () {
              visitor.register($scope.profile, oauth.identities).then(function () {
                $modalInstance.close();
              }, function (err) {
                $scope.state.error = err.data.message;
              });
            }
          }
        ];
        
        $scope.step = $scope.steps[0];
        
        $scope.advance = function () {
          var idx = $scope.steps.indexOf($scope.step);
          var advance = $scope.step.advance || function () {
            $scope.step = $scope.steps[idx + 1];
          };
          
          if (idx < 0) throw new Error("Internal logic error");
          
          if (!_.isFunction($scope.step.validate) || $scope.step.validate()) {
            advance();
            
            if ($scope.step.onEnter) $scope.step.onEnter();
          }
        };
        
        $scope.toggle = function (service) {
          if (oauth.hasIdentity(service)) {
            oauth.clearIdentity(service);
          } else {
            $scope.state.authInProgress = oauth.identify(service).then(function (identities) {
              
            }, function (err) {
              $scope.state.error = err;
            }).finally(function () {
              $scope.state.authInProgress = null;
            });
            
            return $scope.state.authInProgress;
          }
        };
        
        $scope.back = function () {
          var idx = $scope.steps.indexOf($scope.step);
          $scope.step = $scope.steps[idx - 1];
        };
        
        $scope.validate = function () {
          if ($scope.state.step === 'identities') {
            return !_.isEmpty(oauth.identities);
          } else {
            return !_.isEmpty(oauth.identities);
          }
        };

      }]
    }).result;  
  };
  
  return register;
}])

.directive("plunkerUserExists", ["$http", "config", function ($http, config) {
  return {
    require: "ngModel",
    link: function ($scope, $element, $attrs, model) {
      function checkExistence (value) {
        if (value) {
          model.$setValidity("checking", false);
          
          $http.get(config.url.api + "/users/exists", {params: {username: value}}).then(function (response) {
            console.log(response.data);
            model.$setValidity("exists", response.data !== 'true');
          }).finally(function () {
            model.$setValidity("checking", true);
          });
        }
      }
      
      checkExistence($scope.$eval($attrs.ngModel));
      
      model.$viewChangeListeners.push(function () {
        console.log("View changed", model.$viewValue);
        checkExistence(model.$viewValue);
      });
    }
  };
}])

;