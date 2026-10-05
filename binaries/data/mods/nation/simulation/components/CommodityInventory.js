function CommodityInventory() {}

CommodityInventory.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * The first commodity is cocoa. Later crops and minerals use the same record.
 * referenceValue is the prototype worth of one unit, in treasury units.
 * referenceStock is the scarcity pivot. Negotiated prices are not stored here.
 */
CommodityInventory.prototype.CatalogData = {
	"cocoa": {
		"code": "cocoa",
		"name": "Cocoa",
		"referenceValue": 2000,
		"referenceStock": 500
	}
};

CommodityInventory.prototype.Init = function()
{
	// player -> commodity -> units received, not sitting on a producer.
	this.held = {};
};

/**
 * @return {boolean}
 */
CommodityInventory.prototype.Known = function(code)
{
	return !!(code && this.CatalogData[code]);
};

/**
 * @return {Object|null}
 */
CommodityInventory.prototype.Get = function(code)
{
	const row = this.CatalogData[code];
	return row ? {
		"code": row.code,
		"name": row.name,
		"referenceValue": row.referenceValue,
		"referenceStock": row.referenceStock
	} : null;
};

/**
 * @return {Object[]}
 */
CommodityInventory.prototype.Catalog = function()
{
	const codes = Object.keys(this.CatalogData).sort();
	const rows = [];
	for (let i = 0; i < codes.length; ++i)
		rows.push(this.Get(codes[i]));
	return rows;
};

/**
 * Sovereign of the land under the entity. Not the entity's Ownership.
 * @return {number}
 */
CommodityInventory.prototype.SovereignOwner = function(ent)
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
 * Producer entities of this sovereign, sorted by entity id.
 * @return {number[]}
 */
CommodityInventory.prototype.Producers = function(playerId, commodity)
{
	const found = [];
	const ents = Engine.GetEntitiesWithInterface(IID_CommodityProducer);
	for (let i = 0; i < ents.length; ++i)
	{
		const cmpProducer = Engine.QueryInterface(ents[i], IID_CommodityProducer);
		if (!cmpProducer || cmpProducer.GetCommodity() !== commodity)
			continue;
		if (this.SovereignOwner(ents[i]) !== playerId)
			continue;
		found.push(ents[i]);
	}
	found.sort((a, b) => a - b);
	return found;
};

/**
 * Units on producers plus units received by delivery.
 * @return {number}
 */
CommodityInventory.prototype.GetStock = function(playerId, commodity)
{
	if (!this.Known(commodity) || !Number.isInteger(playerId))
		return 0;
	let total = 0;
	const producers = this.Producers(playerId, commodity);
	for (let i = 0; i < producers.length; ++i)
	{
		const cmpProducer = Engine.QueryInterface(producers[i], IID_CommodityProducer);
		if (cmpProducer)
			total += cmpProducer.GetStock();
	}
	const byCommodity = this.held[playerId];
	if (byCommodity && byCommodity[commodity])
		total += byCommodity[commodity];
	return total;
};

/**
 * Received goods stay off the producer, so a farm does not re-export them as output.
 * @return {boolean}
 */
CommodityInventory.prototype.Add = function(playerId, commodity, amount)
{
	if (!this.Known(commodity) || !Number.isInteger(playerId) || playerId <= 0 ||
		!Number.isInteger(amount) || amount <= 0)
		return false;
	if (!this.held[playerId])
		this.held[playerId] = {};
	if (!this.held[playerId][commodity])
		this.held[playerId][commodity] = 0;
	this.held[playerId][commodity] += amount;
	return true;
};

/**
 * Remove from producers in entity-id order, then from received stock.
 * Failure restores every slice already taken.
 * @return {Object[]|null}
 */
CommodityInventory.prototype.Take = function(playerId, commodity, amount)
{
	if (!this.Known(commodity) || !Number.isInteger(amount) || amount <= 0 || amount > this.GetStock(playerId, commodity))
		return null;

	const receipt = [];
	let left = amount;
	const producers = this.Producers(playerId, commodity);
	for (let i = 0; i < producers.length && left > 0; ++i)
	{
		const cmpProducer = Engine.QueryInterface(producers[i], IID_CommodityProducer);
		const have = cmpProducer ? cmpProducer.GetStock() : 0;
		const slice = Math.min(have, left);
		if (slice <= 0)
			continue;
		if (!cmpProducer.RemoveStock(slice))
		{
			this.Restore(receipt);
			return null;
		}
		receipt.push({ "ent": producers[i], "amount": slice });
		left -= slice;
	}

	if (left > 0)
	{
		const held = this.held[playerId] && this.held[playerId][commodity] || 0;
		if (held < left)
		{
			this.Restore(receipt);
			return null;
		}
		this.held[playerId][commodity] -= left;
		receipt.push({ "player": playerId, "commodity": commodity, "amount": left });
	}
	return receipt;
};

/**
 * Put a failed delivery back where it was taken from.
 */
CommodityInventory.prototype.Restore = function(receipt)
{
	if (!receipt)
		return;
	for (let i = 0; i < receipt.length; ++i)
	{
		const row = receipt[i];
		if (row.ent)
		{
			const cmpProducer = Engine.QueryInterface(row.ent, IID_CommodityProducer);
			if (cmpProducer)
				cmpProducer.AddStock(row.amount);
		}
		else if (row.player)
			this.Add(row.player, row.commodity, row.amount);
	}
};

Engine.RegisterSystemComponentType(IID_CommodityInventory, "CommodityInventory", CommodityInventory);
