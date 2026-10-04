GameSettings.prototype.Attributes.MilitaryAccess = class MilitaryAccess extends GameSetting
{
	init()
	{
		this.grants = undefined;
		this.settings.map.watch(() => this.onMapChange(), ["map"]);
	}

	toInitAttributes(attribs)
	{
		if (this.grants)
			attribs.settings.MilitaryAccess = clone(this.grants);
	}

	fromInitAttributes(attribs)
	{
		const grants = this.getLegacySetting(attribs, "MilitaryAccess");
		if (grants)
			this.grants = clone(grants);
	}

	onMapChange()
	{
		const grants = this.getMapSetting("MilitaryAccess");
		this.grants = grants ? clone(grants) : undefined;
	}
};
