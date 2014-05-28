var _ = require("lodash");


function Workspace () {
  this.nextPaneNum = 0;
  this.activeCoords = [0, 0];
  this.layout = [[]];
  this.history = [];
  this.panes = {};
  this.paneCoords = {};
  
  this.split([0, 0]);
}

Workspace.prototype.activate = function (coords) {
  coords = this.normalizeCoords(coords);
  
  var x = coords[0];
  var y = coords[1];
  
  if (x < 0 || x >= this.layout.length) throw new Error("Invalid coordinates: " + coords);
  if (y < 0 || y >= this.layout[x].length) throw new Error("Invalid coordinates: " + coords);
  
  var paneNum = this.layout[x][y];
  
  // Remove the active pane from the recent panes list
  _.pull(this.history, paneNum);
  
  // Add it back at the head (most recent)
  this.history.unshift(paneNum);
};

Workspace.prototype.close = function (coords) {
  this.unsplit(coords);
};

Workspace.prototype.getActivePane = function () {
  return this.panes[this.getActivePaneNum()];
};

Workspace.prototype.getActivePaneCoords = function () {
  if (!this.history.length) return;
  
  var coords = this.paneCoords[this.history[0]];
  
  if (coords) return [coords[0], coords[1]];
};

Workspace.prototype.getActivePaneNum = function () {
  var activeCoords = this.getActivePaneCoords();
  
  return this.layout[activeCoords[0]][activeCoords[1]];
};

Workspace.prototype.getCoords = function (type, id) {
  return this.paneCoords[this.getPaneNum(type, id)];
};

Workspace.prototype.getCoordsForPaneNum = function (paneNum) {
  return this.paneCoords[paneNum];
};

Workspace.prototype.getLastPaneNum = function () {
  if (!this.history.length) return;

  var index = Math.min(this.history.length - 1, 1);
  
  return this.history[index];
};

Workspace.prototype.getPane = function (coords) {
  coords = this.normalizeCoords(coords);
  
  if (coords) {
    var paneNum = this.layout[coords[0]][coords[1]];
    
    return this.panes[paneNum];
  }
};

Workspace.prototype.getPaneNum = function (type, id) {
  return _.findKey(this.panes, {id: id, type: type});
};

Workspace.prototype.isActive = function (type, id) {
  var coords = this.normalizeCoords(type, id);
  
  return coords && _.isEqual(this.getActivePaneCoords(), coords);
};

Workspace.prototype.isOpen = function (type, id) {
  return 0 <= this.getPaneNum(type, id);
};

Workspace.prototype.normalizeCoords = function (coordsOrPaneNum, nullOrId) {
  var coords;
  var paneNum;  
  
  if (_.isNumber(coordsOrPaneNum)) {
    coords = this.paneCoords[coordsOrPaneNum];
  } else if (_.isArray(coordsOrPaneNum) && coordsOrPaneNum.length === 2) {
    coords = coordsOrPaneNum;
  } else if (_.isString(coordsOrPaneNum)) {
    paneNum = this.getPaneNum(coordsOrPaneNum, nullOrId);
    coords = this.getCoordsForPaneNum(paneNum);
  } else if (_.isObject(coordsOrPaneNum)) {
    paneNum = this.getPaneNum(coordsOrPaneNum.type, coordsOrPaneNum.id);
    
    coords = this.getCoordsForPaneNum(paneNum);
  }

  return coords;
};

Workspace.prototype.open = function (coords, type, id) {
  if (!coords) coords = this.getActivePaneCoords();
  
  coords = this.normalizeCoords(coords);
  
  var x = coords[0];
  var y = coords[1];
  
  // We have to let x and/or y be 0 otherwise it will never be possible to split
  if (x < 0 || (x > 0 && x >= this.layout.length)) throw new Error("Invalid coordinates: " + coords);
  if (y < 0 || (y > 0 && y >= this.layout[x].length)) throw new Error("Invalid coordinates: " + coords);
  
  var paneNum = this.layout[x][y];
  
  if (this.isOpen(type, id)) throw new Error("Cannot open the same paneDef in two panes");
  
  this.panes[paneNum] = {
    type: type,
    id: id
  };
};

Workspace.prototype.split = function (coords, splitChild, splitBefore) {
  coords = this.normalizeCoords(coords);
  
  var x = coords[0];
  var y = coords[1];
  
  // We have to let x and/or y be 0 otherwise it will never be possible to split
  if (x < 0 || (x > 0 && x >= this.layout.length)) throw new Error("Invalid coordinates: " + coords);
  if (y < 0 || (y > 0 && y >= this.layout[x].length)) throw new Error("Invalid coordinates: " + coords);
  
  var paneNum = this.nextPaneNum++;
  
  if (splitChild) {
    if (!splitBefore) x++;
    y = 0;
    this.layout.splice(x, 0, [paneNum]);
  } else {
    if (!splitBefore) y++;
    this.layout[x].splice(y, 0, paneNum);
  }
  
  this.panes[paneNum] = {type: 'empty', id: paneNum};
  
  this.history.push(paneNum);
  
  this.updatePaneCoords();
  
  return [x, y];
};

Workspace.prototype.unsplit = function (coords) {
  coords = this.normalizeCoords(coords);
  
  var x = coords[0];
  var y = coords[1];
  
  if (x < 0 || x >= this.layout.length) throw new Error("Invalid coordinates: " + coords);
  if (y < 0 || y >= this.layout[x].length) throw new Error("Invalid coordinates: " + coords);
  
  var paneNum = this.layout[x][y];
  var pane = this.panes[paneNum];
  
  this.layout[x].splice(y, 1);
  
  // Remove the parent layout if it is now empty
  if (!this.layout[x].length) this.layout.splice(x, 1);
 
  _.pull(this.history, paneNum);
  
  if (pane) {
    if (_.isFunction(pane.onClose)) pane.onClose();
    
    delete this.panes[paneNum];
  }
  
  // Check to see if no panes / parents exist anymore
  if (!this.layout.length) {
    this.layout.push([]);
    this.split([0,0]);
  }
  
  // Update coordinates before calling activate so that correct pane is activated
  this.updatePaneCoords();
  
  // Activate the first entry in the history
  this.activate(this.history[0]);
};

Workspace.prototype.updatePaneCoords = function () {
  this.paneCoords = {};
  
  for (var x = 0; x < this.layout.length; x++) {
    var parent = this.layout[x];
    
    for (var y = 0; y < parent.length; y++) {
      this.paneCoords[parent[y]] = [x, y];
    }
  }
};

module.exports = Workspace;