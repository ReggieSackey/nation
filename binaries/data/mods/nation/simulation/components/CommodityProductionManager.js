function CommodityProductionManager() {}

CommodityProductionManager.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * Prototype interval in simulation milliseconds.
 * Sandbox timing, not a growing season.
 */
CommodityProductionManager.prototype.ProductionInterval = 10000;

CommodityProductionManager.prototype.Init = function()
{
	this.timer = 0;
};

CommodityProductionManager.prototype.OnInitGame = function()
{
	this.StartProduction();
};

/**
 * One repeating timer for every producer. A second call does not schedule another.
 */
CommodityProductionManager.prototype.StartProduction = function()
{
	if (this.timer)
		return;

	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (!cmpTimer)
		return;

	this.timer = cmpTimer.SetInterval(
		SYSTEM_ENTITY,
		IID_CommodityProductionManager,
		"ApplyProduction",
		this.ProductionInterval,
		this.ProductionInterval,
		null
	);
};

/**
 * Add each producer's template output to its stock.
 */
CommodityProductionManager.prototype.ApplyProduction = function()
{
	for (const ent of Engine.GetEntitiesWithInterface(IID_CommodityProducer))
	{
		const cmpProducer = Engine.QueryInterface(ent, IID_CommodityProducer);
		if (cmpProducer)
			cmpProducer.Produce();
	}
};

Engine.RegisterSystemComponentType(IID_CommodityProductionManager, "CommodityProductionManager", CommodityProductionManager);
