var angular = window.angular;

var Fs = require("fs");
var _ = require("lodash");

require("../../vendor/ngTagsInput/ngTagsInput");

module.exports =
angular.module("plunker.project", [
  "ngTagsInput",
  
  "plunker.service.config",
  
  require("./commander").name,
  require("./marked").name,
  require("./visitor").name,
  
  require("./project/textEntry").name,
  require("./project/directoryEntry").name,

])

.factory("project", ["$http", "$q", "DirectoryEntry", "TextEntry", "visitor", "commander", "config", function ($http, $q, DirectoryEntry, TextEntry, visitor, commander, config) {
  var project = new Project();
  var untitled = 0;

  function Project () {
    this.description = "";
    this.readme = "";
    this.tags = [];
    this.root = new DirectoryEntry(null, "Project");
    this.entries = {};
    this.plunk = null;
    this.tree = null;
    
    this.root.getPath = function() { return ""; };
  }
  
  Project.prototype.reset = function () {
    this.description = "";
    this.readme = "";
    this.tags.length = 0;
    this.plunk = null;
    this.tree = null;
    
    return this.clearTree();
  };
  
  Project.prototype.clearTree = function () {
    var self = this;
    var queue = $q.when(true);
    
    this.traverse(function (entry) {
      queue = queue.then(function () {
        if (entry.isFile()) return commander.execute("file.remove", {parent: entry.parent, file: entry});
        else return commander.execute("directory.remove", {parent: entry.parent, directory: entry});
      });
    });
    
    return queue.then(function () {
      self.tree = null;
    });
  };

  Project.prototype.comment = function (body, files) {
    var self = this;
    
    return visitor.getCredentials()
    
    .then(function (credentials) {
      return $http.post(config.url.api + "/plunks/" + self.plunk.id + "/comments", {
        body: body,
        files: files
      }, { params: {
        token: credentials
      }});
    })
    
    .then(function (response) {
      self.plunk = response.data;
      return self;
    });
  };
  
  Project.prototype.insertText = function (path, offset, text) {
    this.withPath(path, function (entry) {
      if (!entry.isFile()) throw new Error("Cannot insert text in a directory");
      
      entry.insert(offset, text);
    });
  };
  
  Project.prototype.getLastRevision = function () {
    return this.plunk && this.plunk.revisions[this.plunk.revisions.length - 1];
  };
  
  Project.prototype.getPlunkId = function () {
    if (this.isSaved()) return this.plunk.id;
  };
  
  Project.prototype.isClean = function (path) {
    if (path) {
      
    } else {
    }
  };
  
  Project.prototype.isForkable = function () {
    return this.isSaved(); };
  Project.prototype.isSavableBy = function (user) {
    return !this.isSaved() || (this.isSaved() && this.isWritableBy(user)); };
  Project.prototype.isSaved = function () {
    return !!this.plunk; };
  Project.prototype.isWritableBy = function (user) {
    return this.isSaved() && user && this.plunk.user.id === user.id; };
  
  Project.prototype.create = function (parent, filename, type) {
    if (!type) type = TextEntry;
    
    if (parent.hasChildByFilename(filename)) throw new Error("An entry already exists with the same filename: " + filename);
    
    var entry = new type(parent, filename);
    
    parent.addChild(entry);
    
    this.entries[entry.getId()] = entry;
    
    return entry;
  };
  
  Project.prototype.markClean = function () {
    this.$$cleanState = {
      description: this.description,
      tags: _.clone(this.tags),
      buffers: _.values(this.buffers)
    };
    
    this.traverse(function (entry) {
      if (entry.editSession) entry.editSession.getUndoManager().markClean();
    });
  };

  Project.prototype.destroy = function (plunkId) {
    var self = this;
    
    return visitor.getCredentials()
    
    .then(function (credentials) {
      return $http.delete(config.url.api + "/plunks/" + plunkId, { params: {
        token: credentials
      }});
    })
    
    .then(function () {
      self.plunk = null;
      return self;
    });
  };
  
  Project.prototype.fork = function () {
    var self = this;
    var payload = {
      description: this.description,
      readme: this.readme,
      tags: this.tags,
      files: _.map(this.entries, function (entry) {
        return entry.isFile() ? {
          type: 'file',
          path: entry.getPath(),
          contents: entry.contents
        } : {
          type: 'directory',
          path: entry.getPath()
        };
      })
    };
    
    return visitor.getCredentials().then(function (credentials) {
      return $http.post(config.url.api + "/plunks/" + self.plunk.id + "/forks", payload, { params: {
        token: credentials
      }}).then(function (response) {
        // Once the tree has been loaded, THEN set the project's plunk
        self.plunk = response.data;
        self.tree = self.getLastRevision().tree;
        
        // No need to set description and tags because fork only affects plunk
        return self;
      });
    });
  };
  
  Project.prototype.setTree = function (tree) {
    var root = this.root;
    
    return this.clearTree().then(function () {
      return createEntries(root, tree);
      
      function createEntries (parent, entries) {
        return $q.all(_.map(entries, function (entry) {
          if (entry.type === 'directory') return directoryCreate(parent, entry);
          else return fileCreate(parent, entry);
        }));
      }
      
      function directoryCreate (parent, entry) {
        return commander.execute("directory.create", {parent: parent, filename: entry.filename}).then(function (parent) {
          return createEntries(parent, entry.children);
        });
      }
      
      function fileCreate (parent, entry) {
        return commander.execute("file.create", {parent: parent, filename: entry.filename}).then(function (file) {
          return commander.execute("text.insert", {path: file.getPath(), offset: 0, text: entry.contents});
        });
      }
    });
  };
  
  Project.prototype.openTree = function (tree, activate) {
    var self = this;
    var sha = _.isString(tree) ? tree : null;
    
    var treePromise = _.isArray(tree)
      ? $q.when(tree)
      : $http.get(config.url.api + "/trees/" + tree).then(function (response) {
        return response.data;
      });
    
    return treePromise.then(function (tree) {
      var returnPromise = commander.execute("project.setTree", {tree: tree}).then(function () {
        self.tree = sha;
      });
      
      if (activate) {
        returnPromise = returnPromise.then(function () {
          return self.withPath(activate, function (entry) {
            return commander.execute("workspace.open", {type: 'code', id: entry.entryId, blank: true });
          });
        });
      }
      
      return returnPromise;
    });
  };
  
  Project.prototype.open = function (plunkId) {
    var self = this;
    
    return visitor.getCredentials().then(function (credentials) {
      return $http.get(config.url.api + "/plunks/" + plunkId, { params: {
        token: credentials
      }}).then(function (response) {
        var readme = project.getEntry(/readme(\.(md|markdown))?/i);
        
        self.plunk = response.data;
        self.description = self.plunk.description;
        self.readme = readme ? readme.contents : "";
        
        angular.copy(self.plunk.tags, self.tags);
        
        return self;
      });
    });
  };
  
  Project.prototype.publish = function (collection) {
    var self = this;
    var payload = {
      name: collection,
    };
    
    return visitor.getCredentials().then(function (credentials) {
      var path = "/plunks/" + self.plunk.id + "/collections";
      
      if (!visitor.isMember()) {
        return $q.reject("Only members can publish plunks");
      }
        
      return $http.post(config.url.api + path, payload, {
        params: { token: credentials }
      }).then(function (response) {
        if (response.data.status !== "OK") throw new Error("Error publishing plunk.");
        
        self.plunk.collections.push(collection);
        
        return self;
      });
    });
  };

  Project.prototype.remove = function (parent, entry, filename) {
    if (_.isString(entry)) entry = entryGetChild(parent, entry);
    
    if (!entry) throw new Error("No such entry");
    
    if (entry.children) {
      _.forEach(entry.children, function (child) {
        if (child.isDirectory()) commander.execute("directory.remove", {parent: entry, directory: child});
        else if (child.isFile()) commander.execute("file.remove", {parent: entry, file: child});
      });
    }
    
    parent.removeChild(entry);
  
    delete this.entries[entry.getId()];
    
    entry.destroy();
    
    return entry;
  };
  
  Project.prototype.removeText = function (path, offset, text) {
    this.withPath(path, function (entry) {
      if (!entry.isFile()) throw new Error("Cannot insert text in a directory");
      
      entry.remove(offset, text);
    });
  };
    
  Project.prototype.rename = function (parent, entry, filename) {
    if (_.isString(entry)) entry = entryGetChild(parent, entry);
    
    if (!entry) throw new Error("No sucuch entry");
    
    entry.setFilename(filename);
    
    return entry;
  };
  
  Project.prototype.save = function (user) {
    var self = this;
    var payload = {
      description: this.description,
      readme: this.readme,
      tags: this.tags,
      files: _.map(this.entries, function (entry) {
        return entry.isFile() ? {
          type: 'file',
          path: entry.getPath(),
          contents: entry.contents
        } : {
          type: 'directory',
          path: entry.getPath()
        };
      })
    };
    
    return visitor.getCredentials().then(function (credentials) {
      var path = "/plunks";
      
      if (self.isSaved()) {
        path += "/" + self.plunk.id + "/revisions";
      }
        
      return $http.post(config.url.api + path, payload, {
        params: { token: credentials }
      }).then(function (response) {
        self.plunk = response.data;
        
        return self;
      });
    });
  };
  
  Project.prototype.toJSON = function () {
    return {
      description: this.description,
      tags: _.clone(this.tags),
      tree: this.root.toJSON().children
    };
  };
  
  Project.prototype.traverse = function (visitor) {
    var self = this;
    var traverseChildren = function (entries) {
      _.forEach(entries, function (entry) {
        if (entry.isDirectory()) {
          traverseChildren(entry.children);
        }
        visitor.call(self, entry);
      });
    };
    
    traverseChildren(this.root.children);
  };

  Project.prototype.getEntry = function (path) {
    var test = _.isRegExp(path) ? path.test.bind(path) : function (cmp) { return cmp === path; };
    var found = _.find(this.entries, function (entry) {
      return test(entry.getPath());
    });
    
    return found;
  };
  
  Project.prototype.withPath = function (path, visitor) {
    var test = _.isRegExp(path) ? path.test.bind(path) : function (cmp) { return cmp === path; };
    var found = _.find(this.entries, function (entry) {
      return test(entry.getPath());
    });
    
    if (found) return visitor(found);
    return;
  };
  
  
  function entryGetChild(parent, filenameOrId) {
    var found = parent.getChildByFilename(filenameOrId);
    
    if (found) return found;
    else return parent.getChildById(filenameOrId);
  }  
  
  
  commander.addCommand({
    name: "project.comment",
    messages: {
      success: "Project opened",
      error: "Error opening project"
    },
    description: "Add a comment to a project",
    handler: ["body", "files", project.comment.bind(project)]
  });
  
  commander.addCommand({
    name: "project.destroy",
    overlay: {
      name: "editor",
      message: "Destroying the project"
    },
    description: "Delete a project",
    hotkeys: "Mod-Shift-Del",
    handler: ["plunkId", project.destroy.bind(project)]
  });
  
  commander.addInterceptor("project.destroy", ["$q", "notifier", function ($q, notifier) {
    return notifier.confirm("Are you sure you would like to delete this plunk?").then(function(answer) {
      if (!answer) return $q.reject("Cancelled");
      
      return answer;
    });
  }]);
  
  commander.addCommand({
    name: "project.open",
    messages: {
      success: "Project opened",
      error: "Error opening project"
    },
    overlay: {
      name: "editor",
      message: "Loading project"
    },
    description: "Open an existing project",
    handler: ["plunkId", project.open.bind(project)]
  });
  
  commander.addCommand({
    name: "project.openTree",
    overlay: {
      name: "editor",
      message: "Loading project files"
    },
    description: "Open an existing project",
    handler: ["tree", "activate", project.openTree.bind(project)],
    defaults: { activate: /^(index|example|default|readme)\.(html|md|htm)$/i }
  });
  
  commander.addCommand({
    name: "project.setTree",
    overlay: {
      name: "editor",
      message: "Adding project files"
    },
    description: "Set a tree",
    handler: ["tree", project.setTree.bind(project)],
  });
  
  commander.addCommand({
    name: "project.reset",
    description: "Reset the project to an empty state",
    overlay: {
      name: "editor",
      message: "Resetting the project"
    },
    handler: [project.reset.bind(project)]
  });
  
  commander.addCommand({
    name: "project.fork",
    description: "Fork the current project to a new project",
    hotkeys: "Mod-Shift-s",
    handler: [project.fork.bind(project)]
  });
  
  commander.addCommand({
    name: "project.save",
    description: "Save your project",
    messages: {
      success: "Project saved",
      error: "Error saving project"
    },
    hotkeys: "Mod-s",
    handler: [project.save.bind(project)]
  });
  
  commander.addInterceptor("project.save", ["$q", function ($q) {
    if (!project.isSaved()) {
      return commander.execute("project.edit").then(function () {
        if (!project.description) return $q.reject("Project description is required");
      });
    }
  }]);

  
  commander.addCommand({
    name: "project.openTemplates",
    description: "Open the template selection window",
    handler: ["$modal", function ($modal) {
      return $modal.open({
        template: Fs.readFileSync(__dirname + "/project/templates.html", "utf8"),
        windowClass: "plunker-templates",
        size: "lg",
        controller: ["$scope", "$modalInstance", function ($scope, $modalInstance) {
          $scope.search = {
            state: "default",
            term: "",
            results: [], 
          };
          
          $scope.project = { description: project.description, tags: angular.copy(project.tags) };
          
          $scope.resolve = $modalInstance.close.bind($modalInstance);
          
          $scope.reject = $modalInstance.dismiss.bind($modalInstance);
          
          $scope.refreshFavorites = function () {
            if (visitor.isMember()) {
              return visitor.getCredentials().then(function (credentials) {
                return $http.get(config.url.api + "/plunks", { params: {
                  q: "in:" + visitor.user.username + "/templates",
                  token: credentials,
                }}).then(function (response) {
                  $scope.favorites = response.data.results;
                });
              });
            }
          };
          
          $scope.refreshPopular = function () {
            return $http.get(config.url.api + "/plunks", { params: {
              q: "in:plunker/templates",
            }}).then(function (response) {
              $scope.popular = response.data.results;
            });
          };
          
          $scope.find = function (term) {
            $scope.search.results.length = 0;
            $scope.search.term = term;
            $scope.search.state = "searching";
            
            return $http.get(config.url.api + "/plunks", { params: {
              q: ["in:plunker/templates", $scope.search.term].join(" "),
            }}).then(function (response) {
              angular.copy(response.data.results, $scope.search.results);
            }).finally(function () {
              $scope.search.state = "results";
            });
          };
          
          $scope.refreshFavorites();
          $scope.refreshPopular();
        }]
      }).result.then(function (plunk) {
        commander.execute("editor.open", {plunkId: plunk.id});
      });  
      
    }]
  });

  
  commander.addCommand({
    name: "project.edit",
    description: "Show the project edit dialog",
    handler: ["$modal", function ($modal) {
      var readme = project.getEntry(/readme(\.(md|markdown))?/i);
      
      var editing = {
        description: project.description,
        tags: angular.copy(project.tags),
        readme: readme ? readme.contents : ""
      };

      return $modal.open({
        template: Fs.readFileSync(__dirname + "/project/edit.html", "utf8"),
        controller: ["$scope", "$modalInstance", function ($scope, $modalInstance) {
          $scope.project = _.clone(editing);
          
          $scope.resolve = $modalInstance.close.bind($modalInstance);
          
          $scope.reject = $modalInstance.dismiss.bind($modalInstance);
        }]
      }).result.then(function (updated) {
        project.description = updated.description;
        project.readme = updated.readme;
        angular.copy(updated.tags, project.tags);
        
        if (updated.readme !== editing.readme) {
          var readmePromise = readme ? $q.when(readme) : commander.execute("file.create", {filename: "README.md"});
          
          return readmePromise.then(function (readme) {
            return commander.execute("text.remove", {path: readme.getPath(), offset: 0, text: readme.contents}).then(function () {
              return commander.execute("text.insert", {path: readme.getPath(), offset: 0, text: updated.readme});
            });
          });
        }
      });  
      
    }]
  });

  
  commander.addCommand({
    name: "project.openPublisher",
    description: "Show the project publishing dialog",
    handler: ["$modal", function ($modal) {
      return $modal.open({
        template: Fs.readFileSync(__dirname + "/project/publish.html", "utf8"),
        size: "lg",
        controller: ["$scope", "$modalInstance", "notifier", function ($scope, $modalInstance, notifier) {
          $scope.refreshCollections = function (username, scopeKey) {
            return visitor.getCredentials().then(function (credentials) {
              if (!visitor.isMember()) return $modalInstance.dismiss("Not a registered user");
              
              return $http.get(config.url.api + "/users/" + username + "/collections", {
                params: { token: credentials }
              }).then(function (response) {
                return $scope[scopeKey] = response.data.results;
              });
            });
          };
          
          $scope.refreshCollections(visitor.user.username, "ownCollections");
          $scope.refreshCollections("plunker", "globalCollections");
        }]
      }).result.then(function (collection) {
        return commander.execute("project.publish", {collection: collection}).then(function () {
          return project;
        });
      });  
      
    }]
  });
  
  commander.addCommand({
    name: "project.publish",
    description: "Publish a project to a collection",
    handler: ["collection", project.publish.bind(project)],
  });
  
  
  commander.addCommand({
    name: "directory.create",
    description: "Create a new directory",
    handler: ["parent", "filename", "type", project.create.bind(project)],
    defaults: function () {
      return { parent: project.root, filename: "Untitled" + untitled++, type: DirectoryEntry };
    }
  });
  
  commander.addCommand({
    name: "directory.rename",
    description: "Rename a directory",
    handler: ["parent", "directory", "filename", project.rename.bind(project)],
    defaults: function () {
      return { parent: project.root, filename: "Untitled" + untitled++ };
    }
  });
  
  commander.addCommand({
    name: "directory.remove",
    description: "Remove a directory",
    handler: ["parent", "directory", project.remove.bind(project)],
    defaults: function () {
      return { parent: project.root };
    }
  });
  
  commander.addCommand({
    name: "file.create",
    description: "Create a new file",
    handler: ["parent", "filename", "type", project.create.bind(project)],
    defaults: function () {
      return { parent: project.root, filename: "Untitled" + untitled++, type: TextEntry };
    }
  });  
  
  commander.addCommand({
    name: "file.rename",
    description: "Rename a file",
    handler: ["parent", "file", "filename", project.rename.bind(project)],
    defaults: function () {
      return { parent: project.root, filename: "Untitled" + untitled++ };
    }
  });
  
  commander.addCommand({
    name: "file.remove",
    description: "Remove a file",
    handler: ["parent", "file", project.remove.bind(project)],
    defaults: function () {
      return { parent: project.root };
    }
  });
  
  commander.addCommand({
    name: "text.insert",
    description: "Insert text into a file at the given offset",
    handler: ["path", "offset", "text", project.insertText.bind(project)],
    defaults: { offset: 0, text: "" }
  });
  
  commander.addCommand({
    name: "text.replace",
    description: "Remove text from a file at the given offset",
    handler: ["path", "offset", "remove", "text", project.removeText.bind(project)],
    defaults: function () { 
      return {
        offset: 0,
        text: ""
      };
    }
  });
  
  commander.addCommand({
    name: "text.remove",
    description: "Remove text from a file at the given offset",
    handler: ["path", "offset", "text", project.removeText.bind(project)],
    defaults: { offset: 0, text: "" }
  });

  return project;
  
  
}])








.value("defaultProjectFiles", [{
    type: "file",
    filename: "index.html",
    contents: '<!DOCTYPE html>\n<html>\n\n<head>\n  <link rel="stylesheet" href="lib/style.css">\n  <script src="lib/script.js"></script>\n</head>\n\n<body>\n  <h1>Hello Plunker</h1>\n</body>\n\n</html>'
  },{
    type: "directory",
    filename: "lib",
    children: [{
      type: "file",
      filename: "style.css",
      contents: "h1 {\n  color: red;\n}"
    },{
      type: "file",
      filename: "script.js",
      contents: "// comment"
    }]
  }]
);