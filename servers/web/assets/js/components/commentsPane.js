var angular = window.angular;

var Marked = require("marked");

var Fs = require("fs");
var _ = require("lodash");

require("../../vendor/angular-timeago/angular-timeago");
require("../../vendor/borderLayout/borderLayout.coffee");

module.exports =
angular.module("plunker.commentsPane", [
  "yaru22.angular-timeago",
  "fa.directive.borderLayout",
  
  "plunker.service.config",
  
  require("./commander").name,
  require("./markdown").name,
  require("./project").name,
  require("./urlState").name,
  require("./visitor").name,
])

.filter("slice", function () {
  return function (text, n) { return String(text).substring(0, n); };
})

.directive("plunkerCommentsPane", ["$http", "$interval", "$location", "urlState", "paneManager", "commander", "project", "visitor", "config", function ($http, $interval, $location, urlState, paneManager, commander, project, visitor, config) {
  return {
    restrict: "E",
    replace: true,
    template: Fs.readFileSync(__dirname + "/commentsPane/commentsPane.html", "utf8"),
    link: function ($scope, $element, $attrs) {
      var pane;
      
      $scope.visitor = visitor;
      $scope.opened = false;
      $scope.comments = [];
      
      $scope.$watch(project.getPlunkId.bind(project), function (isSaved) {
        $scope.comments.length = 0;
      
        if (!isSaved) {
          commander.execute("comments.toggle", {open: false});
          return;
        }
        
        pane = paneManager.get("comments");
        //commander.execute("comments.toggle", {open: urlState.getComments()});
      });
      
      urlState.addState({
        name: "comments",
        queue: "project",
        scope: $scope,
        decode: function () {
          return $location.search().c;
        },
        encode: function (open) {
          var search = $location.search();
          
          if (open) search.c = "y";
          else delete search.c;
          
          return $location.search(search);
        },
        read: function () {
          return (project.isSaved() && pane && !pane.closed) ? "y" : null;
        },
        write: function (open) {
          if (pane) pane.toggle(open === "y");
        }
      });
      
      //$scope.$watch(urlState.getComments.bind(urlState), function (comments) {
      //  commander.execute("comments.toggle", {open: comments});
      //});
      
      $scope.$watch(function () { return pane && !pane.closed; }, function (open) {
        if (open && !$scope.opened)  {

          $scope.opened = true;

          $scope.reset();
          $scope.loadComments();
        } else if (pane) {
          $scope.opened = false;
        }
      });
      
      $scope.reset = function () {
        $scope.draft = {
          body: "",
          files: false
        };
      };
      
      
      $scope.loadComments = function () {
        if (!$scope.opened) return;
        
        loadComments().then(function (response) {
          angular.copy(response.data.results, $scope.comments);
        });
      };
      
      $scope.updateComments = function () {
        if (!$scope.opened) return;
        
        var last = _.max($scope.comments, function (comment) {
          return Date.parse(comment.updated_at);
        });
        
        loadComments(last.updated_at).then(function (response) {
          var comments = $scope.comments.concat(response.data.results);
          
          comments = _(comments)
            .sortBy('updated_at')
            .unique("id")
            .value();
            
          angular.copy(comments, $scope.comments);
        });
      };
      
      $scope.toggleAttachment = function () {
        $scope.draft.files = !$scope.draft.files;
      };
      
      $scope.addComment = function () {
        if (!project.isSaved()) return;
        
        commander.execute("project.comment", {
          plunkId: project.plunk.id,
          body: $scope.draft.body,
          files: $scope.draft.files ? _.map(project.entries, function (entry) {
            return entry.isFile() ? {
              type: 'file',
              path: entry.getPath(),
              contents: entry.contents
            } : {
              type: 'directory',
              path: entry.getPath()
            };
          }) : null
        }).then(function () {
          $scope.reset();
          $scope.updateComments();
        });
      };
      
      var ivalPromise = $interval($scope.updateComments, 1000 * 60 * 3);
      
      $scope.$on("$destroy", function () {
        $interval.cancel(ivalPromise);
      });
      
      function loadComments (after) {
        return visitor.getCredentials().then(function (credentials) {
          var options = { params: { token: credentials } };
          
          if (after) options.params.after = after;
        
          return $http.get(config.url.api + "/plunks/" + project.plunk.id + "/comments", options);
        });
      }
      
      function togglePane (open) {
        if (pane) {
          pane.toggle(project.isSaved() ? open : false);
        }
        //urlState.setComments(pane && !pane.closed ?  "y" : void 0).replace();
      }
      
      commander.addCommand({
        name: "comments.toggle",
        handler: [ "open", togglePane],
        defaults: function () {
          return { open: pane && !!pane.closed };
        }
      });
    }
  };
}])

.directive("plunkerCommentsBox", [ function () {
  var Range = window.ace.require("ace/range").Range;
  
  return {
    restrict: "A",
    require: "ngModel",
    link: function ($scope, $element, $attrs, model) {
      $element.addClass("plunker-comments-box");
      
      var editor = window.ace.edit($element[0]);
      
      editor.setHighlightActiveLine(false);
      editor.session.setMode("ace/mode/markdown");
      editor.renderer.setShowGutter(false);
      editor.renderer.setShowPrintMargin(false);
      //editor.setUseWrapMode(true);
      editor.setOptions({
        minLines: 2,
        maxLines: 12
      });
      
      editor.on("focus", function () {
        editor.setOptions({
          minLines: 4,
        });
      });
      
      editor.on("blur", function () {
        if (!model.$viewValue) {
          editor.setOptions({
            minLines: 2,
          });
        }
      });
      
      editor.on("change", function () {
        var contents = editor.session.getValue();
        
        model.$setViewValue(contents);
        
        if (!$scope.$root.$$phase) $scope.$digest();
      });
      
      model.$render = function (value) {
        var doc = editor.session.doc;
        var val = doc.getValue();
        
        doc.replace(Range.fromPoints(doc.indexToPosition(0), doc.indexToPosition(val.length)), value || "");
      };
     
      $scope.$on("fa-pane-resize", function () {
        editor.resize();
      });
      
      window.ace.config.loadModule("ace/ext/language_tools", function(module){
        editor.setOptions({
          enableBasicAutocompletion: true,
          enableSnippets: true      
        });
      });
      
      window.test= editor;
    }
  };
}])

;