GameSettings.prototype.Attributes.GovernmentFinance = class GovernmentFinance extends GameSetting
{
	init()
	{
		this.accounts = undefined;
		this.settings.map.watch(() => this.onMapChange(), ["map"]);
	}

	toInitAttributes(attribs)
	{
		if (this.accounts)
			attribs.settings.GovernmentFinance = clone(this.accounts);
	}

	fromInitAttributes(attribs)
	{
		const accounts = this.getLegacySetting(attribs, "GovernmentFinance");
		if (accounts)
			this.accounts = clone(accounts);
	}

	onMapChange()
	{
		const accounts = this.getMapSetting("GovernmentFinance");
		this.accounts = accounts ? clone(accounts) : undefined;
	}
};
