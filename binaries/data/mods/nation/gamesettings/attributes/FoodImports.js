GameSettings.prototype.Attributes.FoodImports = class FoodImports extends GameSetting
{
	init()
	{
		this.offers = undefined;
		this.settings.map.watch(() => this.onMapChange(), ["map"]);
	}

	toInitAttributes(attribs)
	{
		if (this.offers)
			attribs.settings.FoodImports = clone(this.offers);
	}

	fromInitAttributes(attribs)
	{
		const offers = this.getLegacySetting(attribs, "FoodImports");
		if (offers)
			this.offers = clone(offers);
	}

	onMapChange()
	{
		const offers = this.getMapSetting("FoodImports");
		this.offers = offers ? clone(offers) : undefined;
	}
};
