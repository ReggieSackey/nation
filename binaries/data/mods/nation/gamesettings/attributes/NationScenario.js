/**
 * Copies the scenario objective settings into init attributes.
 * The controller reads them. The gamesetup does not interpret them.
 */
GameSettings.prototype.Attributes.NationScenario = class NationScenario extends GameSetting
{
	init()
	{
		this.scenario = undefined;
		this.settings.map.watch(() => this.onMapChange(), ["map"]);
	}

	toInitAttributes(attribs)
	{
		if (this.scenario)
			attribs.settings.NationScenario = clone(this.scenario);
	}

	fromInitAttributes(attribs)
	{
		const scenario = this.getLegacySetting(attribs, "NationScenario");
		if (scenario)
			this.scenario = clone(scenario);
	}

	onMapChange()
	{
		const scenario = this.getMapSetting("NationScenario");
		this.scenario = scenario ? clone(scenario) : undefined;
	}
};
