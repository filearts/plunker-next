module.exports = ["commander", "workspace", function (commander, workspace) {
  commander.addCommand({
    name: "workspace.split",
    description: "Split the workspace",
    handler: ["parent", "file", workspace.split.bind(workspace)],
    defaults: function () {
      return { parent: workspace.root };
    }
  });
}];