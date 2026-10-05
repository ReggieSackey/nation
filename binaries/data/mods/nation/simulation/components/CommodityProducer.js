function CommodityProducer() {}

CommodityProducer.prototype.Schema =
	"<a:help>Aggregate production and stock of one economic commodity. This is not a gatherable resource pile.</a:help>" +
	"<element name='Commodity' a:help='Commodity id, such as cocoa.'>" +
		"<data type='string'>" +
			"<param name='minLength'>1</param>" +
		"</data>" +
	"</element>" +
	"<element name='ProductionPerTick' a:help='Units added each production interval.'>" +
		"<data type='nonNegativeInteger'/>" +
	"</element>" +
	"<element name='Stock' a:help='Units on hand at the start of the match.'>" +
		"<data type='nonNegativeInteger'/>" +
	"</element>";

/**
 * @return {boolean}
 */
CommodityProducer.prototype.DataIsValid = function(commodity, production, stock)
{
	return typeof commodity === "string" && commodity.trim().length > 0 &&
		Number.isInteger(production) && production >= 0 &&
		Number.isInteger(stock) && stock >= 0;
};

CommodityProducer.prototype.Init = function()
{
	const commodity = this.template && this.template.Commodity != null ? String(this.template.Commodity) : "";
	const production = this.template ? +this.template.ProductionPerTick : NaN;
	const stock = this.template ? +this.template.Stock : NaN;
	if (!this.DataIsValid(commodity, production, stock))
	{
		error("Invalid CommodityProducer data on entity " + this.entity);
		this.commodity = "";
		this.productionPerTick = 0;
		this.stock = 0;
		return;
	}

	this.commodity = commodity;
	this.productionPerTick = production;
	this.stock = stock;
};

/**
 * @return {string}
 */
CommodityProducer.prototype.GetCommodity = function()
{
	return this.commodity;
};

/**
 * @return {number}
 */
CommodityProducer.prototype.GetStock = function()
{
	return this.stock;
};

/**
 * @return {number}
 */
CommodityProducer.prototype.GetProductionPerTick = function()
{
	return this.productionPerTick;
};

/**
 * Add this producer's interval output to stock.
 * @return {number} - Stock after production.
 */
CommodityProducer.prototype.Produce = function()
{
	this.stock += this.productionPerTick;
	return this.stock;
};

/**
 * Put units back onto this producer. Used when a delivery is rolled back.
 * @return {boolean}
 */
CommodityProducer.prototype.AddStock = function(amount)
{
	if (!Number.isInteger(amount) || amount <= 0)
		return false;
	this.stock += amount;
	return true;
};

/**
 * Remove a positive integer amount. Failure leaves stock unchanged.
 * @return {boolean}
 */
CommodityProducer.prototype.RemoveStock = function(amount)
{
	if (!Number.isInteger(amount) || amount <= 0 || amount > this.stock)
		return false;

	this.stock -= amount;
	return true;
};

Engine.RegisterComponentType(IID_CommodityProducer, "CommodityProducer", CommodityProducer);
