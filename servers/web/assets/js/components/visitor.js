var angular = window.angular;

var _ = require("lodash");

require("../../vendor/angular-cookie/angular-cookie.js");

module.exports = 
angular.module("plunker.service.visitor", [
  "ipCookie",
  
  "plunker.service.config"
])

.factory("visitor", ["$http", "$q", "config", "ipCookie", function ($http, $q, config, ipCookie) {
  var visitor = _.create({
    isMember: function () {
      return !!this.user && this.user.type === 'member';
    },
    getCredentials: function () {
      if (this.credentials) {
        return $q.when(this.credentials);
      } else {
        return $http.post(config.url.api + "/users/guests", {}).then(function (response) {
          return setUser(response.data);
        })
        .then(function (visitor) {
          return visitor.credentials;
        });
      }
    },
    login: function (identityEnvelope) {
      return $http.get(config.url.api + "/users/session", {params: {
        credentials: identityEnvelope.payload.credentials
      }}).then(function (response) {
        if (!response.data) return $q.reject({id: "E_NOEXIST"});
      
        return setUser(response.data);
      });
    },
    
    logout: function () {
      if (!visitor.user) return $q.reject("Not logged in");
      
      return $q.when(unsetUser());
    },
    
    register: function (profile, identities) {
      return visitor.getCredentials().then(function (credentials) {
        return $http.post(config.url.api + "/users", {
          profile: profile,
          identities: _.values(identities)
        }, {
          params: { token: credentials }
        }).then(function (response) {
          return setUser(response.data);
        });
      });
    }
  }, {
    user: null,
    credentials: null
  });
  
  function setUser (userData) {
    if (userData.user && userData.user._id) {
      userData.user.id = userData.user._id;
      delete userData.user._id;
    }
    
    angular.copy(userData, visitor);
    
    localStorage.setItem("plunker.visitor", JSON.stringify(userData));
    
    ipCookie("plunker.tok", userData.credentials, {
      expires: 14,
      path: "/"
    });
    
    return visitor;
  }
  
  function unsetUser () {
    angular.copy({user: null, credentials: null}, visitor);
    
    localStorage.removeItem("plunker.visitor");
    
    ipCookie.remove('plunker.tok');
    
    return visitor;
  }
  
  var userData = localStorage.getItem("plunker.visitor");
  
  if (userData) {
    try {
      setUser(JSON.parse(userData));
    } catch (e) {
      unsetUser();
    }
  }
  
  return visitor;
}])


;