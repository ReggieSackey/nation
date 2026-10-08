/**
 * Copies the scenario's Adomé strategy configuration into init attributes.
 * The gamesetup does not interpret the strategic thresholds.
 */
GameSettings.prototype.Attributes.AdomeStrategy = class AdomeStrategy extends GameSetting
{
	init()
	{
		this.strategy = undefined;
		this.settings.map.watch(() => this.onMapChange(), ["map"]);
	}

	toInitAttributes(attribs)
	{
		if (this.strategy)
		{
			attribs.settings.AdomeStrategy = clone(this.strategy);
			const player = this.strategy.player;
			if (Number.isInteger(player) && player > 0 && attribs.settings.PlayerData?.[player])
			{
				attribs.settings.PlayerData[player].AI = "petra";
				attribs.settings.PlayerData[player].AIDiff = 3;
				attribs.settings.PlayerData[player].AIBehavior = "balanced";
			}
		}
	}

	fromInitAttributes(attribs)
	{
		const strategy = this.getLegacySetting(attribs, "AdomeStrategy");
		if (strategy)
		{
			this.strategy = clone(strategy);
			this.assignAI();
		}
	}

	onMapChange()
	{
		const strategy = this.getMapSetting("AdomeStrategy");
		this.strategy = strategy ? clone(strategy) : undefined;
		this.assignAI();
	}

	assignAI()
	{
		if (!this.strategy || !this.settings.playerAI)
			return;
		const player = this.strategy.player;
		if (!Number.isInteger(player) || player <= 0)
			return;
		this.settings.playerAI.set(player - 1, {
			"bot": "petra",
			"difficulty": 3,
			"behavior": "balanced"
		});
	}
};
