function InfrastructureLink() {}

InfrastructureLink.prototype.Schema =
	"<a:help>A physical connection between two infrastructure endpoints. Endpoints are settlements or other infrastructure nodes. Operational condition is separate from state integration and from who owns the link.</a:help>" +
	"<element name='From' a:help='Entity id of one endpoint. An endpoint is a settlement or an infrastructure node.'>" +
		"<data type='positiveInteger'/>" +
	"</element>" +
	"<element name='To' a:help='Entity id of the other endpoint.'>" +
		"<data type='positiveInteger'/>" +
	"</element>" +
	"<optional>" +
		"<element name='Condition' a:help='Initial operational condition from 0 to 100. Omitted means 100.'>" +
			"<ref name='nonNegativeDecimal'/>" +
		"</element>" +
	"</optional>";

InfrastructureLink.prototype.Init = function()
{
	const from = this.template ? +this.template.From : NaN;
	const to = this.template ? +this.template.To : NaN;
	// Full condition until a health change or SetCondition says otherwise.
	// Health cannot be the stored value: a dead entity cannot be restored through Health.
	// An optional template condition is the initial bottleneck, still overwritten by later damage.
	this.condition = 100;
	if (this.template && this.template.Condition !== undefined)
	{
		const initial = Math.round(+this.template.Condition);
		if (Number.isInteger(initial))
			this.condition = Math.max(0, Math.min(100, initial));
	}
	if (!Number.isInteger(from) || from <= 0 || !Number.isInteger(to) || to <= 0 || from === to)
	{
		error("InfrastructureLink: entity " + this.entity + " needs two different endpoint entity ids");
		this.from = 0;
		this.to = 0;
		return;
	}

	this.from = from;
	this.to = to;
	this.NotifyGraph();
};

/**
 * @return {number}
 */
InfrastructureLink.prototype.GetFrom = function()
{
	return this.from;
};

/**
 * @return {number}
 */
InfrastructureLink.prototype.GetTo = function()
{
	return this.to;
};

/**
 * True when the stored endpoints are two different entity ids.
 * Settlement existence is checked when the connectivity graph is updated.
 * @return {boolean}
 */
InfrastructureLink.prototype.IsUsable = function()
{
	return this.from > 0 && this.to > 0 && this.from !== this.to;
};

/**
 * Operational condition from 0 to 100. 100 is fully open. 0 carries nothing.
 * @return {number}
 */
InfrastructureLink.prototype.GetCondition = function()
{
	return this.condition;
};

/**
 * @return {number} - Condition divided by 100, from 0 to 1.
 */
InfrastructureLink.prototype.GetConditionFraction = function()
{
	return this.condition / 100;
};

/**
 * A positive condition can still carry traffic. Zero cannot.
 * @return {boolean}
 */
InfrastructureLink.prototype.IsOperational = function()
{
	return this.condition > 0;
};

/**
 * Clamp a finite number onto 0–100 and tell the connectivity graph.
 * This is the restoration path. Health.SetHitpoints cannot raise a road from 0.
 * @return {boolean}
 */
InfrastructureLink.prototype.SetCondition = function(value)
{
	if (typeof value !== "number" || !isFinite(value))
		return false;

	this.condition = Math.max(0, Math.min(100, Math.round(value)));
	this.NotifyGraph();
	return true;
};

/**
 * Copy the current health fraction into condition.
 * Any positive hitpoints stay at least condition 1, so a scratched road remains a connection.
 * Zero hitpoints make the link unusable without deleting the entity when DeathType is remain.
 */
InfrastructureLink.prototype.SyncConditionFromHealth = function()
{
	const cmpHealth = Engine.QueryInterface(this.entity, IID_Health);
	if (!cmpHealth)
		return;

	const max = cmpHealth.GetMaxHitpoints();
	const hitpoints = cmpHealth.GetHitpoints();
	if (!(max > 0) || !(hitpoints > 0))
		this.condition = 0;
	else
		this.condition = Math.max(1, Math.min(100, Math.round(hitpoints / max * 100)));
	this.NotifyGraph();
};

InfrastructureLink.prototype.OnHealthChanged = function()
{
	this.SyncConditionFromHealth();
};

InfrastructureLink.prototype.NotifyGraph = function()
{
	const cmpConnectivity = Engine.QueryInterface(SYSTEM_ENTITY, IID_SettlementConnectivity);
	if (cmpConnectivity)
		cmpConnectivity.RefreshPhysicalLink(this.entity);
};

InfrastructureLink.prototype.OnDestroy = function()
{
	const cmpConnectivity = Engine.QueryInterface(SYSTEM_ENTITY, IID_SettlementConnectivity);
	if (cmpConnectivity)
		cmpConnectivity.RemovePhysicalLink(this.entity);
};

Engine.RegisterComponentType(IID_InfrastructureLink, "InfrastructureLink", InfrastructureLink);
