GameSettings.prototype.Attributes.InfrastructureProjects = class InfrastructureProjects extends GameSetting
{
	init()
	{
		this.projects = undefined;
		this.settings.map.watch(() => this.onMapChange(), ["map"]);
	}

	toInitAttributes(attribs)
	{
		if (this.projects)
			attribs.settings.InfrastructureProjects = clone(this.projects);
	}

	fromInitAttributes(attribs)
	{
		const projects = this.getLegacySetting(attribs, "InfrastructureProjects");
		if (projects)
			this.projects = clone(projects);
	}

	onMapChange()
	{
		const projects = this.getMapSetting("InfrastructureProjects");
		this.projects = projects ? clone(projects) : undefined;
	}
};
