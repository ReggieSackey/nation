GameSettings.prototype.Attributes.Sovereignty = class Sovereignty extends GameSetting
{
	init()
	{
		this.regions = undefined;
		this.settings.map.watch(() => this.onMapChange(), ["map"]);
	}

	toInitAttributes(attribs)
	{
		if (this.regions)
			attribs.settings.Sovereignty = clone(this.regions);
	}

	fromInitAttributes(attribs)
	{
		const regions = this.getLegacySetting(attribs, "Sovereignty");
		if (regions)
			this.regions = clone(regions);
	}

	onMapChange()
	{
		const regions = this.getMapSetting("Sovereignty");
		this.regions = regions ? clone(regions) : undefined;
	}
};
