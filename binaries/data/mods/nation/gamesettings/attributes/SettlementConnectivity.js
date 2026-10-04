GameSettings.prototype.Attributes.SettlementConnectivity = class SettlementConnectivity extends GameSetting
{
	init()
	{
		this.links = undefined;
		this.settings.map.watch(() => this.onMapChange(), ["map"]);
	}

	toInitAttributes(attribs)
	{
		if (this.links)
			attribs.settings.SettlementConnectivity = clone(this.links);
	}

	fromInitAttributes(attribs)
	{
		const links = this.getLegacySetting(attribs, "SettlementConnectivity");
		if (links)
			this.links = clone(links);
	}

	onMapChange()
	{
		const links = this.getMapSetting("SettlementConnectivity");
		this.links = links ? clone(links) : undefined;
	}
};
