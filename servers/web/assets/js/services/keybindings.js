var _ = require("lodash");


var module = angular.module("plunker.service.keybindings", [
  "plunker.service.commands"
]);

module.directive("keybindings", ["keybindings", function(keybindings){
  return {
    link: function($scope, $el){
      keybindings.attachTo($el[0]);
    }
  };
}]);

module.factory("keybindings", ["$injector", "commands", function($injector, commands){
  var KeyBinding = ace.require("ace/keyboard/keybinding").KeyBinding
    , HashHandler = ace.require("ace/keyboard/hash_handler").HashHandler
    , Event = ace.require("ace/lib/event");
  
  function KeyBindings() {
    // Set up this class so that it will work with ace's KeyBinding class out of the box
    this.commands = new HashHandler();
    this.commands.exec = function(command){
      command.exec();
      return true;
    };

    this.keyBinding = new KeyBinding(this);
  }

  KeyBindings.prototype.attachTo = function(el){
    Event.addCommandKeyListener(el, this.keyBinding.onCommandKey.bind(this.keyBinding));
  };
  
  KeyBindings.prototype.bindKey = function(bindKey, commandId, locals){
    this.commands.addCommand({
      exec: _.bind(commands.exec, commands, commandId, locals),
      bindKey: bindKey,
      name: commandId
    });
  };
  
  return new KeyBindings;
}]);