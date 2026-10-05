GameSettings.prototype.Attributes.AgreementResponders = class AgreementResponders extends GameSetting
{
	init()
	{
		this.responders = undefined;
		this.settings.map.watch(() => this.onMapChange(), ["map"]);
	}

	toInitAttributes(attribs)
	{
		if (this.responders)
			attribs.settings.AgreementResponders = clone(this.responders);
	}

	fromInitAttributes(attribs)
	{
		const responders = this.getLegacySetting(attribs, "AgreementResponders");
		if (responders)
			this.responders = clone(responders);
	}

	onMapChange()
	{
		const responders = this.getMapSetting("AgreementResponders");
		this.responders = responders ? clone(responders) : undefined;
	}
};
