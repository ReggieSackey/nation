/**
 * Copies the scenario RebelPlayer id into init attributes.
 * RebellionManager reads it. The value is a player slot, not a diplomacy stance.
 */
GameSettings.prototype.Attributes.RebelPlayer = class RebelPlayer extends GameSetting
{
	init()
	{
		this.player = undefined;
		this.settings.map.watch(() => this.onMapChange(), ["map"]);
	}

	toInitAttributes(attribs)
	{
		if (Number.isInteger(this.player) && this.player > 0)
			attribs.settings.RebelPlayer = this.player;
	}

	fromInitAttributes(attribs)
	{
		const player = this.getLegacySetting(attribs, "RebelPlayer");
		if (Number.isInteger(player) && player > 0)
			this.player = player;
	}

	onMapChange()
	{
		const player = this.getMapSetting("RebelPlayer");
		this.player = Number.isInteger(player) && player > 0 ? player : undefined;
	}
};
