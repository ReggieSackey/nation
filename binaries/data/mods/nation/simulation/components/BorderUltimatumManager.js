function BorderUltimatumManager() {}

BorderUltimatumManager.prototype.Schema =
	"<a:component type='system'/><empty/>";

BorderUltimatumManager.prototype.Init = function()
{
	// One ultimatum per offender-defender pair. The defender has escalated.
	this.ultimatums = [];
};

BorderUltimatumManager.prototype.Find = function(offender, defender)
{
	for (let i = 0; i < this.ultimatums.length; ++i)
	{
		const ultimatum = this.ultimatums[i];
		if (ultimatum.offender === offender && ultimatum.defender === defender)
			return ultimatum;
	}
	return undefined;
};

/**
 * @return {boolean}
 */
BorderUltimatumManager.prototype.HasActiveUltimatum = function(offender, defender)
{
	const ultimatum = this.Find(offender, defender);
	return !!ultimatum && ultimatum.active;
};

/**
 * @return {Object|null} - Copy of the ultimatum, or null.
 */
BorderUltimatumManager.prototype.GetUltimatum = function(offender, defender)
{
	const ultimatum = this.Find(offender, defender);
	return ultimatum ? clone(ultimatum) : null;
};

/**
 * Record the defender's ultimatum to the offender. A second call for the same pair does nothing.
 */
BorderUltimatumManager.prototype.IssueUltimatum = function(offender, defender)
{
	if (!Number.isInteger(offender) || offender <= 0)
		return;
	if (!Number.isInteger(defender) || defender <= 0 || offender === defender)
		return;
	if (this.Find(offender, defender))
		return;

	this.ultimatums.push({
		"offender": offender,
		"defender": defender,
		"active": true
	});

	Engine.BroadcastMessage(MT_BorderUltimatumIssued, {
		"issuer": defender,
		"recipient": offender
	});
};

Engine.RegisterSystemComponentType(IID_BorderUltimatumManager, "BorderUltimatumManager", BorderUltimatumManager);
