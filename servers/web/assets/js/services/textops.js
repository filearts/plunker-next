var _ = require("lodash")
  , ottext = require("../../vendor/ottypes/ottypes");


var module = angular.module("plunker.service.textops", []);

module.factory("textops", [function(){
  return {
    apply: applyOp,
    createInsertOp: createInsertOp,
    createRemoveOp: createRemoveOp,
    forEach: forEach,
  };
  
  function applyOp(snapshot, op) {
    return ottext.ot.apply(snapshot, op);
  }
  
  function createInsertOp(position, text) {
    return [{p: position, i: text}];
  }
  
  function createRemoveOp(position, text) {
    return [{p: position, d: text}];
  }

  function forEach(ops, iterator) {
    _.forEach(ops, function(op) {
      if (op.d) {
        iterator({
          type: "remove",
          offset: op.p,
          text: op.d
        });
      } else if (op.i) {
        iterator({
          type: "insert",
          offset: op.p,
          text: op.i
        });
      }
    });
  }
}]);