var angular = window.angular;

var genid = require("genid");
var _ = require("lodash");

require("../../../../vendor/qrcode/qrcode");

module.exports = 
angular.module("plunker.directive.previewer", [
  require("../../settings").name,
  require("../../commander").name,
  require("../../oplog").name,
])

.directive("plunkerPreviewer", ["$rootScope", "$timeout", "$interval", "$http", "commander", "project", "settings", "oplog", "config", function ($rootScope, $timeout, $interval, $http, commander, project, settings, oplog, config) {
  var previewUrl = config.url.run + "/previews/" + genid();
  var updateStream = oplog.local.fork().filter(function (e) { return settings.previewer.autoRefresh && started && (active || previewWindow); });
  var previewWindow = null;
  var checkPreviewWindowInterval = null;
  var debouncedUpdateStream = null;
  var active = false;
  var started = false;

  commander.addCommand({
    name: "preview.refresh",
    hotkeys: "Mod-Enter",
    handler: refreshPreviews
  });

  $rootScope.$watch(function () { return settings.previewer.refreshInterval; }, function (refreshInterval) {
    if (debouncedUpdateStream) {
      updateStream._removeConsumer(debouncedUpdateStream);
    }

    debouncedUpdateStream = updateStream.debounce(refreshInterval).each(function () {
      refreshPreviewJson();
      refreshPreviewWindow();
    });
  });

  var directive = {
    restrict: "E",
    replace: true,
    template: '<iframe id="plunkerPreviewIframe" name="plunkerPreviewIframe" src="about:blank" width="100%" height="100%" frameborder="0"></iframe>',
    link: function($scope, $element, $attrs) {
      $scope.previewUrl = previewUrl;
      $scope.refresh = refreshPreviewJson;
      $scope.showQRCode = false;
      $scope.showPreviewWindow = !!previewWindow;

      $scope.toggleQRCode = function () {
        $scope.showQRCode = !$scope.showQRCode;
      };

      $scope.togglePreviewWindow = function (open) {
        if (open === void 0) open = !$scope.showPreviewWindow;

        closeWindow();

        if (open) {
          previewWindow = window.open("about:blank", "plunkerPreviewWindow", "resizable=yes,scrollbars=yes,status=yes,toolbar=yes");
          $scope.showPreviewWindow = true;

          checkPreviewWindowInterval = $interval(checkPreviewWindow, 100);

          refreshPreviewWindow();
        }

        function closeWindow () {
          if (previewWindow) previewWindow.close();

          previewWindow = null;
          $scope.showPreviewWindow = false;
        }

        function checkPreviewWindow () {
          if (!previewWindow || previewWindow.closed) {
            closeWindow();

            $interval.cancel(checkPreviewWindowInterval);
          }
        }
      };

      active = true;
      
      $scope.$on("project.setTree.success", function (){
        refreshPreviews();
      });

      $scope.$on("$destroy", function() {
        active = false;
      });

      // Wait for the iframe to actually be in the DOM
      $timeout(function(){
        refreshPreviewJson();
        refreshPreviewWindow();
      });
    }
  };

  return directive;


  function refreshPreviews () {
    refreshPreviewJson();
    refreshPreviewWindow();
  }

  function refreshPreviewJson () {
    if (!active) return;
    if (_.isEmpty(project.entries)) return;

    // Allow events to start arriving from the Stream
    started = true;

    var iframe = angular.element(document.getElementById("plunkerPreviewIframe"))
      , json = {
        files: _.map(project.entries, function (entry) {
          if (entry.isFile()) {
            return {
              path: entry.getPath(),
              contents: entry.contents,
            };
          }
        })
      };

    return $http.post(previewUrl, json).then(function (resp) {
      iframe.attr("src", resp.data.url);
    }, function (err) {
      iframe.attr("src", "about:blank");
    });
  }

  function refreshPreviewWindow() {
    if (!previewWindow || previewWindow.closed) return;
    if (_.isEmpty(project.entries)) return;

    var form = document.createElement("form");

    form.style.display = "none";
    form.setAttribute("method", "post");
    form.setAttribute("action", previewUrl);
    form.setAttribute("target", "plunkerPreviewWindow");
    
    for (var entryId in project.entries) {
      var entry = project.entries[entryId];
      var field;

      if (entry.type === 'file') {
        field = document.createElement("input");
        field.setAttribute("type", "hidden");
        field.setAttribute("name", "files[" + entry.getPath() + "]");
        field.setAttribute("value", entry.contents);
        
        form.appendChild(field);
      }
    }

    document.body.appendChild(form);
    
    debugger;
    form.submit();

    document.body.removeChild(form);
  }
}])


.directive("qrcode", function () {
  return {
    restrict: "E",
    replace: true,
    template: '<a ng-href="{{url}}" target="_blank"><span class="qrcode"></span></a>',
    scope: {
      url: "@",
      width: "@",
      height: "@"
    },
    link: function ($scope, $element, $attrs) {
      var qrcodeEl = $element.children()[0]
        , qrcode = new QRCode(qrcodeEl, {
          text: $scope.url,
          width: $scope.width,
          height: $scope.height
        });

      $scope.$watch("url", function (url) {
        qrcode.makeCode(url);
      });
    }
  };
});