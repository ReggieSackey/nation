/**
 * Copies scenario PlayerData.Diplomacy into init attributes.
 * LoadPlayerSettings applies that array with SetDiplomacy.
 * Values follow Diplomacy: greater than 0 ally, 0 neutral, less than 0 enemy.
 */
GameSettings.prototype.Attributes.PlayerDiplomacy = class PlayerDiplomacy extends GameSetting
{
	init()
	{
		this.values = [];
		this.settings.map.watch(() => this.onMapChange(), ["map"]);
	}

	toInitAttributes(attribs)
	{
		if (!this.values.some(value => value))
			return;
		if (!attribs.settings.PlayerData)
			attribs.settings.PlayerData = [];
		while (attribs.settings.PlayerData.length < this.values.length)
			attribs.settings.PlayerData.push({});
		for (let i = 0; i < this.values.length; ++i)
			if (this.values[i])
				attribs.settings.PlayerData[i].Diplomacy = clone(this.values[i]);
	}

	fromInitAttributes(attribs)
	{
		const playerData = this.getLegacySetting(attribs, "PlayerData");
		if (!playerData)
			return;
		this.values = [];
		for (let i = 0; i < playerData.length; ++i)
			this.values[i] = playerData[i] && playerData[i].Diplomacy ? clone(playerData[i].Diplomacy) : undefined;
	}

	onMapChange()
	{
		const playerData = this.getMapSetting("PlayerData");
		this.values = [];
		if (!playerData)
			return;
		for (let i = 0; i < playerData.length; ++i)
			this.values[i] = playerData[i] && playerData[i].Diplomacy ? clone(playerData[i].Diplomacy) : undefined;
	}
};
