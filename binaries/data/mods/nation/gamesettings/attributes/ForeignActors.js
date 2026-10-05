GameSettings.prototype.Attributes.ForeignActors = class ForeignActors extends GameSetting
{
	init()
	{
		this.actors = undefined;
		this.settings.map.watch(() => this.onMapChange(), ["map"]);
	}

	toInitAttributes(attribs)
	{
		if (this.actors)
			attribs.settings.ForeignActors = clone(this.actors);
	}

	fromInitAttributes(attribs)
	{
		const actors = this.getLegacySetting(attribs, "ForeignActors");
		if (actors)
			this.actors = clone(actors);
	}

	onMapChange()
	{
		const actors = this.getMapSetting("ForeignActors");
		this.actors = actors ? clone(actors) : undefined;
	}
};
