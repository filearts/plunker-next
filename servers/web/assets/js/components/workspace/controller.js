module.exports = ["workspace", function (workspace) {
  this.layout = workspace.layout;
  
  this.isActive = workspace.isActive.bind(workspace);
  
  this.activate = workspace.activate.bind(workspace);
  this.split = workspace.split.bind(workspace);
  this.close = workspace.close.bind(workspace);
}];