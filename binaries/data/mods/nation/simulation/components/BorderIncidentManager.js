function BorderIncidentManager() {}

BorderIncidentManager.prototype.Schema =
	"<a:component type='system'/><empty/>";

BorderIncidentManager.prototype.Init = function()
{
	// One record per offender-defender pair. Direction is the pair order.
	this.incidents = [];
};

BorderIncidentManager.prototype.FindIncident = function(offender, defender)
{
	for (let i = 0; i < this.incidents.length; ++i)
	{
		const incident = this.incidents[i];
		if (incident.offender === offender && incident.defender === defender)
			return incident;
	}
	return undefined;
};

/**
 * @return {boolean}
 */
BorderIncidentManager.prototype.HasActiveIncident = function(offender, defender)
{
	const incident = this.FindIncident(offender, defender);
	return !!incident && incident.active;
};

/**
 * @return {Object|null} - Copy of the incident, or null.
 */
BorderIncidentManager.prototype.GetIncident = function(offender, defender)
{
	const incident = this.FindIncident(offender, defender);
	return incident ? clone(incident) : null;
};

/**
 * @return {Object[]} - Copies of active incidents.
 */
BorderIncidentManager.prototype.GetActiveIncidents = function()
{
	const active = [];
	for (let i = 0; i < this.incidents.length; ++i)
		if (this.incidents[i].active)
			active.push(clone(this.incidents[i]));
	return active;
};

BorderIncidentManager.prototype.OnGlobalSovereignEntryClassified = function(msg)
{
	if (msg.authorized)
		return;

	// Gaia is 0 and unclaimed land is INVALID_PLAYER. Domestic entry is not an incident.
	if (!Number.isInteger(msg.entityOwner) || msg.entityOwner <= 0)
		return;
	if (!Number.isInteger(msg.to) || msg.to <= 0 || msg.entityOwner === msg.to)
		return;

	const existing = this.FindIncident(msg.entityOwner, msg.to);
	if (existing)
	{
		++existing.incursions;
		return;
	}

	this.incidents.push({
		"offender": msg.entityOwner,
		"defender": msg.to,
		"active": true,
		"incursions": 1
	});

	Engine.BroadcastMessage(MT_BorderIncidentStarted, {
		"offender": msg.entityOwner,
		"defender": msg.to,
		"entity": msg.entity
	});
};

Engine.RegisterSystemComponentType(IID_BorderIncidentManager, "BorderIncidentManager", BorderIncidentManager);
