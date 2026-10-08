/**
 * Copies the scenario's Nation endgame configuration into init attributes.
 */
GameSettings.prototype.Attributes.NationEndgame = class NationEndgame extends GameSetting
{
	init()
	{
		this.endgame = undefined;
		this.settings.map.watch(() => this.onMapChange(), ["map"]);
	}

	toInitAttributes(attribs)
	{
		if (this.endgame)
			attribs.settings.NationEndgame = clone(this.endgame);
	}

	fromInitAttributes(attribs)
	{
		const endgame = this.getLegacySetting(attribs, "NationEndgame");
		if (endgame)
			this.endgame = clone(endgame);
	}

	onMapChange()
	{
		const endgame = this.getMapSetting("NationEndgame");
		this.endgame = endgame ? clone(endgame) : undefined;
	}
};
