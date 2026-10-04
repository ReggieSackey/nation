function BorderCrisisManager() {}

BorderCrisisManager.prototype.Schema =
	"<a:component type='system'/><empty/>";

BorderCrisisManager.prototype.Init = function()
{
	// One escalated crisis per offender-defender pair.
	this.crises = [];
};

BorderCrisisManager.prototype.Find = function(offender, defender)
{
	for (let i = 0; i < this.crises.length; ++i)
	{
		const crisis = this.crises[i];
		if (crisis.offender === offender && crisis.defender === defender)
			return crisis;
	}
	return undefined;
};

/**
 * @return {boolean}
 */
BorderCrisisManager.prototype.HasEscalatedCrisis = function(offender, defender)
{
	const crisis = this.Find(offender, defender);
	return !!crisis && crisis.active;
};

/**
 * @return {Object|null} - Copy of the crisis, or null.
 */
BorderCrisisManager.prototype.GetCrisis = function(offender, defender)
{
	const crisis = this.Find(offender, defender);
	return crisis ? clone(crisis) : null;
};

/**
 * Record that this ultimatum expired with offending forces still inside.
 * A second call for the same pair does nothing.
 */
BorderCrisisManager.prototype.EscalateCrisis = function(offender, defender)
{
	if (!Number.isInteger(offender) || offender <= 0)
		return;
	if (!Number.isInteger(defender) || defender <= 0 || offender === defender)
		return;
	if (this.Find(offender, defender))
		return;

	this.crises.push({
		"offender": offender,
		"defender": defender,
		"active": true
	});

	Engine.BroadcastMessage(MT_BorderCrisisEscalated, {
		"offender": offender,
		"defender": defender
	});
};

Engine.RegisterSystemComponentType(IID_BorderCrisisManager, "BorderCrisisManager", BorderCrisisManager);
