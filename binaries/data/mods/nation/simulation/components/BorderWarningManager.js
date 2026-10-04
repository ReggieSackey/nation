function BorderWarningManager() {}

BorderWarningManager.prototype.Schema =
	"<a:component type='system'/><empty/>";

BorderWarningManager.prototype.Init = function()
{
	// One warning per offender-defender pair. The defender has warned the offender.
	this.warnings = [];
};

BorderWarningManager.prototype.FindWarning = function(offender, defender)
{
	for (let i = 0; i < this.warnings.length; ++i)
	{
		const warning = this.warnings[i];
		if (warning.offender === offender && warning.defender === defender)
			return warning;
	}
	return undefined;
};

/**
 * Has the defender warned the offender?
 * The arguments match the border-incident pair, not issuer then recipient.
 * @return {boolean}
 */
BorderWarningManager.prototype.HasActiveWarning = function(offender, defender)
{
	const warning = this.FindWarning(offender, defender);
	return !!warning && warning.active;
};

/**
 * @return {Object|null} - Copy of the warning, or null.
 */
BorderWarningManager.prototype.GetWarning = function(offender, defender)
{
	const warning = this.FindWarning(offender, defender);
	return warning ? clone(warning) : null;
};

BorderWarningManager.prototype.OnGlobalBorderIncidentStarted = function(msg)
{
	if (!Number.isInteger(msg.offender) || msg.offender <= 0)
		return;
	if (!Number.isInteger(msg.defender) || msg.defender <= 0 || msg.offender === msg.defender)
		return;
	if (this.FindWarning(msg.offender, msg.defender))
		return;

	this.warnings.push({
		"offender": msg.offender,
		"defender": msg.defender,
		"active": true
	});

	Engine.BroadcastMessage(MT_BorderWarningIssued, {
		"issuer": msg.defender,
		"recipient": msg.offender
	});
};

/**
 * A later incursion can open a new warning cycle only after the previous one
 * was completed. An open cycle is left alone, so continuous presence does not
 * issue another warning.
 */
BorderWarningManager.prototype.OnGlobalBorderIncursionContinued = function(msg)
{
	if (!Number.isInteger(msg.offender) || msg.offender <= 0)
		return;
	if (!Number.isInteger(msg.defender) || msg.defender <= 0 || msg.offender === msg.defender)
		return;

	const warning = this.FindWarning(msg.offender, msg.defender);
	if (!warning || warning.active)
		return;

	warning.active = true;
	Engine.BroadcastMessage(MT_BorderWarningIssued, {
		"issuer": msg.defender,
		"recipient": msg.offender
	});
};

/**
 * Close the open cycle after its deadline has seen the troops leave.
 * The warning record stays. IsWarningCompliedWith is only meaningful while the cycle is open.
 */
BorderWarningManager.prototype.CompleteWarningCycle = function(offender, defender)
{
	const warning = this.FindWarning(offender, defender);
	if (!warning || !warning.active)
		return;
	if (!this.IsWarningCompliedWith(offender, defender))
		return;
	warning.active = false;
};

/**
 * True only while this warning cycle is open and the offender has no tracked
 * units left inside the defender.
 * @return {boolean}
 */
BorderWarningManager.prototype.IsWarningCompliedWith = function(offender, defender)
{
	if (!this.HasActiveWarning(offender, defender))
		return false;
	const cmpPresence = Engine.QueryInterface(SYSTEM_ENTITY, IID_ForeignMilitaryPresence);
	return !!cmpPresence && !cmpPresence.HasForeignMilitaryPresence(offender, defender);
};

Engine.RegisterSystemComponentType(IID_BorderWarningManager, "BorderWarningManager", BorderWarningManager);
