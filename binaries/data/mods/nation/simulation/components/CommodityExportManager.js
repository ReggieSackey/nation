function CommodityExportManager() {}

CommodityExportManager.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * Prototype interval in simulation milliseconds.
 * The first export is at 25 seconds and then every 25 seconds.
 * Production is every 10 seconds, so the first export sees two production
 * ticks and does not share that timestamp. Later shared timestamps are
 * handled by Timer schedule order: production is started first, so it runs
 * before export when both are due together.
 */
CommodityExportManager.prototype.ExportInterval = 25000;

/**
 * Prototype sale price in currency units per commodity unit.
 * Fixed. Not a market.
 */
CommodityExportManager.prototype.UnitPrices = {
	"cocoa": 10
};

CommodityExportManager.prototype.Init = function()
{
	this.timer = 0;
	// player -> commodity -> units sold
	this.exported = {};
	// player -> currency received
	this.exportRevenue = {};
};

CommodityExportManager.prototype.OnInitGame = function()
{
	this.StartExports();
};

/**
 * One repeating timer. A second call does not schedule another.
 */
CommodityExportManager.prototype.StartExports = function()
{
	if (this.timer)
		return;

	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (!cmpTimer)
		return;

	this.timer = cmpTimer.SetInterval(
		SYSTEM_ENTITY,
		IID_CommodityExportManager,
		"ApplyExports",
		this.ExportInterval,
		this.ExportInterval,
		null
	);
};

/**
 * Sovereign owner of the land under the producer. Not the entity's Ownership.
 * @return {number}
 */
CommodityExportManager.prototype.SovereignOwner = function(ent)
{
	const cmpPosition = Engine.QueryInterface(ent, IID_Position);
	if (!cmpPosition || !cmpPosition.IsInWorld())
		return INVALID_PLAYER;
	const pos = cmpPosition.GetPosition2D();
	const cmpSovereignty = Engine.QueryInterface(SYSTEM_ENTITY, IID_Sovereignty);
	if (!pos || !cmpSovereignty)
		return INVALID_PLAYER;

	return cmpSovereignty.GetSovereignOwner({ "x": pos.x, "z": pos.y });
};

/**
 * @return {number}
 */
CommodityExportManager.prototype.GetTotalExported = function(playerId, commodity)
{
	const byCommodity = this.exported[playerId];
	if (!byCommodity || byCommodity[commodity] === undefined)
		return 0;
	return byCommodity[commodity];
};

/**
 * @return {number}
 */
CommodityExportManager.prototype.GetTotalExportRevenue = function(playerId)
{
	if (this.exportRevenue[playerId] === undefined)
		return 0;
	return this.exportRevenue[playerId];
};

CommodityExportManager.prototype.RecordExport = function(playerId, commodity, amount, revenue)
{
	if (!this.exported[playerId])
		this.exported[playerId] = {};
	if (this.exported[playerId][commodity] === undefined)
		this.exported[playerId][commodity] = 0;
	this.exported[playerId][commodity] += amount;
	if (this.exportRevenue[playerId] === undefined)
		this.exportRevenue[playerId] = 0;
	this.exportRevenue[playerId] += revenue;
};

/**
 * Units that can leave on this tick. Transport condition is an integer 0–100.
 * Unexported stock stays on the producer.
 * @return {number}
 */
CommodityExportManager.prototype.ExportAmount = function(ent, stock)
{
	const cmpTransport = Engine.QueryInterface(SYSTEM_ENTITY, IID_TransportEfficiency);
	const condition = cmpTransport ? cmpTransport.GetRouteCondition(ent) : 0;
	if (condition <= 0)
		return 0;
	return Math.floor(stock * condition / 100);
};

/**
 * Sell the transport-limited share of each producer's stock to an abstract buyer.
 * Proceeds go to the sovereign of the producer's position through GovernmentFinance.AddFunds.
 * A producer with no stock, or with no usable route, is skipped. The price stays fixed.
 */
CommodityExportManager.prototype.ApplyExports = function()
{
	const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
	if (!cmpFinance)
		return;

	for (const ent of Engine.GetEntitiesWithInterface(IID_CommodityProducer))
	{
		const cmpProducer = Engine.QueryInterface(ent, IID_CommodityProducer);
		if (!cmpProducer)
			continue;

		const stock = cmpProducer.GetStock();
		if (stock <= 0)
			continue;

		const commodity = cmpProducer.GetCommodity();
		const price = this.UnitPrices[commodity];
		if (!Number.isInteger(price) || price <= 0)
		{
			error("CommodityExportManager: no export price for " + commodity);
			continue;
		}

		const owner = this.SovereignOwner(ent);
		if (!Number.isInteger(owner) || owner <= 0)
			continue;

		const amount = this.ExportAmount(ent, stock);
		if (amount <= 0)
			continue;

		const revenue = amount * price;
		if (!cmpProducer.RemoveStock(amount))
			continue;
		if (!cmpFinance.AddFunds(owner, revenue))
		{
			error("CommodityExportManager: failed to pay player " + owner);
			continue;
		}
		this.RecordExport(owner, commodity, amount, revenue);
	}
};

Engine.RegisterSystemComponentType(IID_CommodityExportManager, "CommodityExportManager", CommodityExportManager);
