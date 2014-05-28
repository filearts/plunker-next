var angular = window.angular;
var ace = window.ace;

var _ = require("lodash");


module.exports =
angular.module("plunker.service.commander", [
  require("./notifier").name,
  require("./overlayer").name,
])

.factory("commander", [ "$rootScope", "$q", "$document", "$injector", "notifier", "overlayer", function ($rootScope, $q, $document, $injector, notifier, overlayer) {
  var HashHandler = ace.require("ace/keyboard/hash_handler").HashHandler;
  var Event = ace.require("ace/lib/event");
  var KeyUtil = ace.require("ace/lib/keys");
  var UserAgent = ace.require("ace/lib/useragent");
  
  var hashHandler = new HashHandler();
  var commands = {};
  
  var service = {
    addCommand: addCommand,
    addInterceptor: addInterceptor,
    addHotkey: addHotkey,
    attachTo: attachTo,
    execute: executeCommand,
    removeInterceptor: removeInterceptor
  };
  
  Event.addCommandKeyListener($document[0], function (e, hashId, keyCode) {
    var keyString = KeyUtil.keyCodeToString(keyCode);
    var command = hashHandler.findKeyCommand(hashId, keyString);
    
    if (command && command.exec) {
      command.exec(e);
      Event.stopEvent(e);
    }
  });
  
  return service;
  
  function addCommand (commandDef) {
    commands[commandDef.name] = {
      handler: commandDef.handler,
      defaults: commandDef.defaults || {},
      overlay: commandDef.overlay,
      hotkeys: [],
      interceptors: []
    };
    
    if (commandDef.hotkeys) this.addHotkey(commandDef.name, commandDef.hotkeys);
    
    if (commandDef.scope) {
      commandDef.scope.$on("$destroy", function () {
        delete commands[commandDef.name];
      });
    }
  }
  
  function addHotkey (commandId, hotkey) {
    var command = commands[commandId];
    var modKey = UserAgent.isMac ? "Cmd" : "Ctrl";
    
    hotkey = hotkey.replace("Mod", modKey);
    
    if (!command) throw new Error("Unable to run non-existent command: " + commandId);
    
    hashHandler.bindKey(hotkey, function (event, hotkey) {
      executeCommand(commandId, {event: event, hotkey: hotkey});
      
      return true;
    });
    
    command.hotkeys.push(hotkey);
  }
  
  function addInterceptor (commandId, interceptor) {
    if (!commands[commandId]) throw new Error("Unable to add interceptor to a non-existent command: " + commandId);
    
    commands[commandId].interceptors.push(interceptor);
  }
  
  function attachTo (editorInst) {
    editorInst.keyBinding.addKeyboardHandler(hashHandler, 0);
  }
  
  function executeCommand (commandId, locals) {
    var commandDef = commands[commandId];
    
    if (!commandDef) throw new Error("Unable to run non-existent command: " + commandId);
    
    if (!locals) locals = {};

    var defaultsPromise = angular.isObject(commandDef.defaults) ? commandDef.defaults : $injector.invoke(commandDef.defaults, commandDef, {locals: locals});
    return $q.when(defaultsPromise).then(function (defaults) {
      var interceptors = angular.copy(commandDef.interceptors);
      
      locals = _.defaults(locals, defaults);
      
      var resultPromise = nextInterceptor();
      
      resultPromise.then(function (result) {
        if (commandDef.messages && commandDef.messages.success) notifier.success(commandDef.messages.success);
        $rootScope.$broadcast(commandId + ".success", locals, result);
      }, function (err) {
        if (commandDef.messages && commandDef.messages.error) notifier.error(commandDef.messages.error);
        $rootScope.$broadcast(commandId + ".error", locals, err);
      });
    
      return resultPromise;
      
      function nextInterceptor () {
        return interceptors.length
          ? $q.when($injector.invoke(interceptors.shift(), {}, {commandId: commandId, locals: locals})).then(nextInterceptor)
          : runCommand();
      }
      
      function runCommand () {
        var commandPromise = $q.when($injector.invoke(commandDef.handler, {}, locals));
        
        if (commandDef.overlay) overlayer.enqueue(commandDef.overlay.name, commandPromise, commandDef.overlay.message);
        
        return commandPromise;
      }
    });
  }
  
  function removeInterceptor (commandId, interceptor) {
    var command = commands[commandId];
    
    if (!command) throw new Error("Unable to remove interceptor for non-existent command: " + commandId);
    
    var idx = command.interceptors.indexOf(interceptor);
    
    if (idx >= 0) command.interceptors.splice(idx, 1);
  }
  
  
}])

.factory("keybindings", ["$injector", "$document", "commands", function($injector, $document, commands){
  var HashHandler = ace.require("ace/keyboard/hash_handler").HashHandler;
  var Event = ace.require("ace/lib/event");
  var KeyUtil = ace.require("ace/lib/keys");
  
  var hashHandler = new HashHandler();
  
  Event.addCommandKeyListener($document.find("body")[0], function (e, hashId, keyCode) {
    var keyString = KeyUtil.keyCodeToString(keyCode);
    var command = hashHandler.findKeyCommand(hashId, keyString);
    
    if (command && command.exec) {
      command.exec(e);
      event.stopEvent(e);
    }
  });
}]);