var angular = window.angular;

var _ = require("lodash");


module.exports =
angular.module("plunker.service.oauth", [
  require("./visitor").name,
])

.factory("oauth", ["$window", "$q", "oauthWindow", function ($window, $q, oauthWindow) {
  var oauth = {
    identities : {},
    providers: [
      {
        name: "Github",
        id: "github",
        icon: "fa-github"
      },
      {
        name: "Twitter",
        id: "twitter",
        icon: "fa-twitter"
      },
      {
        name: "Google",
        id: "google",
        icon: "fa-google-plus"
      },
      {
        name: "Dropbox",
        id: "dropbox",
        icon: "fa-dropbox"
      },
      {
        name: "Facebook",
        id: "facebook",
        icon: "fa-facebook"
      },
      {
        name: "Stack Overflow",
        id: "stackoverflow",
        icon: "fa-stack-overflow"
      },
    ]
  };
  
  oauth.buildProfileData = function () {
    var profileData = {};
    var priorities = {
      username: ['github', 'stackoverflow', 'twitter', 'dropbox', 'google', 'facebook', 'linkedin'],
      description: ['linkedin', 'stackoverflow', 'twitter', 'facebook', 'dropbox', 'google'],
      company: ['linkedin', 'stackoverflow', 'twitter', 'facebook', 'dropbox', 'google'],
      location: ['linkedin', 'stackoverflow', 'twitter', 'facebook', 'dropbox', 'google'],
      website_url: ['linkedin', 'stackoverflow', 'twitter', 'facebook', 'dropbox', 'google'],
      emails: ['github', 'stackoverflow', 'twitter', 'dropbox', 'google', 'facebook', 'linkedin'],
    };
    
    _.forEach(priorities, function (services, field) {
      profileData[field] = [];
      
      _.forEach(services, function (service) {
        var identity = oauth.getIdentity(service);
        
        if (identity) {
          var value = identity.payload.profile[field];
          
          if (value) {
            profileData[field].push({
              provider: service,
              value: value
            });
            
            return true;
          }
        }
      });
    });
    
    return profileData;
  };
  
  oauth.buildProfile = function () {
    var profileData = oauth.buildProfileData();
    var profile = _.mapValues(profileData, function (values) {
      if (values.length) return values[0].value;
      else return "";
    });
    
    profile.emails = _.unique(profile.emails);

    return profile;
  };
  
  oauth.clearIdentities = function () {
    angular.copy({}, oauth.identities);
  };
  
  oauth.clearIdentity = function (provider) {
    var identity = oauth.getIdentity(provider);
    
    delete oauth.identities[provider];
    
    return identity;
  };
  
  oauth.getIdentity = function (provider) { return oauth.identities[provider]; };
  oauth.hasIdentity = function (provider) { return !!oauth.getIdentity(provider); };
  
  /**
   * Initiate a social login flow for a social service
   * 
   * @return {Promise} Promise that resolves to the collection of social identities
   */
  oauth.identify = function (service) {
    if (oauth.identities[service]) return $q.when(oauth.identities[service]);
    
    return oauthWindow.open(service).then(function (envelope) {
      oauth.identities[service] = envelope;
      
      return oauth.identities;
    });
  };
  
  /**
   * Remove a linked social identity
   */
  oauth.unidentify = function (service) {
    delete oauth.identities[service];
  };
  
  return oauth;
}])

.factory("oauthWindow", ["$window", "$q", "$timeout", "$interval", function ($window, $q, $timeout, $interval) {
  var oauthWindow = {
    popup: null,
    callback: null // Register a callback here to handle postMessage events
  };
  
  var handlePostMessage = function (event) {
    if (!oauthWindow.callback) return;
    
    var matches = event.data.match(/^auth\.(.*)$/);
    
    if (matches) {
      var encodedMessage = matches[1];
      var message;
      
      try {
        message = JSON.parse(atob(encodedMessage));
        
        console.info("[INFO] OAuth message received", message);
        
        if (message.status === 'error') {
          oauthWindow.callback(message.payload);
        } else if (message.status === 'fail') {
          oauthWindow.callback(message.payload);
        } else if (message.status === 'success') {
          oauthWindow.callback(null, message.payload);
        }
      } catch (ex) {
        oauthWindow.callback("Error parsing login payload.");
      }
    }
  };
  
  $window.addEventListener("message", handlePostMessage, false);
  
  /**
   * Initiate a social login flow via popup window
   * 
   * @return {Promise} Returns a promise that will resolve to the social identity
   */
  oauthWindow.open = function (service) {
    if (oauthWindow.popup) return $q.reject("Login window already open.");
    
    var dfd = $q.defer();
    var popupOptions = {
      left: Math.round((screen.width / 2) - 500),
      top: Math.round((screen.height / 2) - 375),
      width: 1000,
      height: 750,
      personalbar: 0,
      toolbar: 0,
      scrollbars: 1,
      resizable: 1
    };
    var popupOptionsText = _.map(popupOptions, function (val, key) { return key + "=" + val; });
    var popup = window.open("/auth/" + service, "plunker-auth", popupOptionsText);
    var resolved = false;
    
    oauthWindow.popup = popup;
    oauthWindow.callback = function (err, payload) {
      if (err) return finish("reject", err);

      finish("resolve", payload);
    };
    
    var finish = function (method, message) {
      if (popup) popup.close();

      resolved = true;
      popup = null;
      oauthWindow.popup = null;
      oauthWindow.callback = null;
      
      $interval.cancel(interval);
      $timeout.cancel(timeout);
      
      dfd[method](message);
    };
    
    var timeout = $timeout(function () {
      finish("reject", "Login timed out.");
    }, 1000 * 60 * 2);
    
    var interval = $interval(function () {
      if (!popup || popup.closed) finish("reject", "Login window closed.");
    }, 100);
    
    popup.focus();
    
    return dfd.promise;
  };
  
  return oauthWindow;
}])

;