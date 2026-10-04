function BorderWarningEscalation() {}

BorderWarningEscalation.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * Prototype grace period in simulation milliseconds.
 * This is sandbox timing, not a final gameplay duration and not a calendar date.
 */
BorderWarningEscalation.prototype.GracePeriod = 10000;

BorderWarningEscalation.prototype.Init = function()
{
	// One pending deadline per offender-defender pair. timer is a Timer id.
	this.deadlines = [];
};

BorderWarningEscalation.prototype.Find = function(offender, defender)
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
 * @return {boolean} - True while this pair is waiting for its grace period to end.
 */
BorderWarningEscalation.prototype.HasPendingDeadline = function(offender, defender)
{
	return !!this.Find(offender, defender);
};

BorderWarningEscalation.prototype.ClearDeadline = function(offender, defender)
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

BorderWarningEscalation.prototype.OnGlobalBorderWarningIssued = function(msg)
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
		IID_BorderWarningEscalation,
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
 * The grace period elapsed. Compliance is read now, not from when the warning was issued.
 * A met warning sends nothing. Troops that leave after an ultimatum do not clear it.
 */
BorderWarningEscalation.prototype.DeadlineReached = function(data)
{
	this.ClearDeadline(data.offender, data.defender);

	const cmpWarnings = Engine.QueryInterface(SYSTEM_ENTITY, IID_BorderWarningManager);
	if (!cmpWarnings || cmpWarnings.IsWarningCompliedWith(data.offender, data.defender))
		return;

	const cmpUltimatums = Engine.QueryInterface(SYSTEM_ENTITY, IID_BorderUltimatumManager);
	if (cmpUltimatums)
		cmpUltimatums.IssueUltimatum(data.offender, data.defender);
};

Engine.RegisterSystemComponentType(IID_BorderWarningEscalation, "BorderWarningEscalation", BorderWarningEscalation);
