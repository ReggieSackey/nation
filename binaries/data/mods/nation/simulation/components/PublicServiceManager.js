function PublicServiceManager() {}

PublicServiceManager.prototype.Schema =
	"<a:component type='system'/><empty/>";

PublicServiceManager.prototype.ServiceTypes = ["education", "healthcare", "electricity"];

PublicServiceManager.prototype.Position = function(entity)
{
	const cmpPosition = Engine.QueryInterface(entity, IID_Position);
	if (!cmpPosition || !cmpPosition.IsInWorld())
		return null;
	const position = cmpPosition.GetPosition2D();
	return { "x": position.x, "y": position.y };
};

PublicServiceManager.prototype.IsUsable = function(entity)
{
	const cmpHealth = Engine.QueryInterface(entity, IID_Health);
	if (cmpHealth && cmpHealth.GetHitpoints() <= 0)
		return false;
	const cmpFoundation = Engine.QueryInterface(entity, IID_Foundation);
	return !cmpFoundation;
};

/**
 * Highest service level reaching a settlement. Buildings only serve settlements
 * in the same sovereign state as their current owner.
 */
PublicServiceManager.prototype.GetCoverage = function(settlement)
{
	const coverage = { "education": 0, "healthcare": 0, "electricity": 0 };
	const cmpSettlement = Engine.QueryInterface(settlement, IID_NationSettlement);
	const destination = this.Position(settlement);
	if (!cmpSettlement || !destination)
		return coverage;
	const sovereign = cmpSettlement.GetSovereignOwner();
	for (const entity of Engine.GetEntitiesWithInterface(IID_PublicService).slice().sort((a, b) => a - b))
	{
		if (!this.IsUsable(entity))
			continue;
		const cmpOwnership = Engine.QueryInterface(entity, IID_Ownership);
		const cmpService = Engine.QueryInterface(entity, IID_PublicService);
		const source = this.Position(entity);
		if (!cmpOwnership || cmpOwnership.GetOwner() !== sovereign || !cmpService || !source)
			continue;
		const service = cmpService.GetService();
		const dx = source.x - destination.x;
		const dy = source.y - destination.y;
		if (dx * dx + dy * dy <= service.radius * service.radius)
			coverage[service.type] = Math.max(coverage[service.type], service.level);
	}
	return coverage;
};

PublicServiceManager.prototype.GetMissing = function(settlement)
{
	const coverage = this.GetCoverage(settlement);
	return this.ServiceTypes.filter(type => !coverage[type]);
};

Engine.RegisterSystemComponentType(IID_PublicServiceManager, "PublicServiceManager", PublicServiceManager);
