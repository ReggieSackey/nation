function BorderUltimatumEscalation() {}

BorderUltimatumEscalation.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * Prototype grace period in simulation milliseconds.
 * This is sandbox timing, not a final gameplay duration and not a calendar date.
 */
BorderUltimatumEscalation.prototype.GracePeriod = 10000;

BorderUltimatumEscalation.prototype.Init = function()
{
	// One pending deadline per offender-defender pair. timer is a Timer id.
	this.deadlines = [];
};

BorderUltimatumEscalation.prototype.Find = function(offender, defender)
{
	for (let i = 0; i < this.deadlines.length; ++i)
	{
		const deadline = this.deadlines[i];
		if (deadline.offender === offender && deadline.defender === defender)
			return deadline;
	}
	return undefined;
};

/**
 * @return {boolean} - True while this pair is waiting for its ultimatum period to end.
 */
BorderUltimatumEscalation.prototype.HasPendingDeadline = function(offender, defender)
{
	return !!this.Find(offender, defender);
};

BorderUltimatumEscalation.prototype.ClearDeadline = function(offender, defender)
{
	for (let i = 0; i < this.deadlines.length; ++i)
	{
		const deadline = this.deadlines[i];
		if (deadline.offender !== offender || deadline.defender !== defender)
			continue;
		this.deadlines.splice(i, 1);
		return;
	}
};

BorderUltimatumEscalation.prototype.OnGlobalBorderUltimatumIssued = function(msg)
{
	const offender = msg.recipient;
	const defender = msg.issuer;
	if (!Number.isInteger(offender) || offender <= 0)
		return;
	if (!Number.isInteger(defender) || defender <= 0 || offender === defender)
		return;
	if (this.Find(offender, defender))
		return;

	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (!cmpTimer)
		return;

	const timer = cmpTimer.SetTimeout(
		SYSTEM_ENTITY,
		IID_BorderUltimatumEscalation,
		"DeadlineReached",
		this.GracePeriod,
		{
			"offender": offender,
			"defender": defender
		}
	);
	this.deadlines.push({
		"offender": offender,
		"defender": defender,
		"timer": timer
	});
};

/**
 * The ultimatum period elapsed. Presence is read now.
 * Withdrawal sends nothing and leaves the ultimatum recorded.
 * Remaining forces open one escalated crisis. That crisis is not war.
 */
BorderUltimatumEscalation.prototype.DeadlineReached = function(data)
{
	this.ClearDeadline(data.offender, data.defender);

	const cmpPresence = Engine.QueryInterface(SYSTEM_ENTITY, IID_ForeignMilitaryPresence);
	if (!cmpPresence || !cmpPresence.HasForeignMilitaryPresence(data.offender, data.defender))
		return;

	const cmpCrises = Engine.QueryInterface(SYSTEM_ENTITY, IID_BorderCrisisManager);
	if (cmpCrises)
		cmpCrises.EscalateCrisis(data.offender, data.defender);
};

Engine.RegisterSystemComponentType(IID_BorderUltimatumEscalation, "BorderUltimatumEscalation", BorderUltimatumEscalation);
