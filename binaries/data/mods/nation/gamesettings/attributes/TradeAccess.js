GameSettings.prototype.Attributes.TradeAccess = class TradeAccess extends GameSetting
{
	init()
	{
		this.grants = undefined;
		this.settings.map.watch(() => this.onMapChange(), ["map"]);
	}

	toInitAttributes(attribs)
	{
		if (this.grants)
			attribs.settings.TradeAccess = clone(this.grants);
	}

	fromInitAttributes(attribs)
	{
		const grants = this.getLegacySetting(attribs, "TradeAccess");
		if (grants)
			this.grants = clone(grants);
	}

	onMapChange()
	{
		const grants = this.getMapSetting("TradeAccess");
		this.grants = grants ? clone(grants) : undefined;
	}
};
