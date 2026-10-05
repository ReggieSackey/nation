function TradeContractManager() {}

TradeContractManager.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * One representative trip moves at most this many units when the corridor is intact.
 */
TradeContractManager.prototype.LotSize = 100;

TradeContractManager.prototype.Init = function()
{
	this.nextId = 1;
	this.contracts = [];
};

/**
 * @return {Object|null}
 */
TradeContractManager.prototype.Find = function(id)
{
	if (!Number.isInteger(id) || id <= 0)
		return null;
	for (let i = 0; i < this.contracts.length; ++i)
		if (this.contracts[i].id === id)
			return this.contracts[i];
	return null;
};

/**
 * @return {Object[]}
 */
TradeContractManager.prototype.GetContracts = function()
{
	return clone(this.contracts);
};

/**
 * An open sale still owns the seller's commodity. The abstract world buyer must not take it too.
 * @return {boolean}
 */
TradeContractManager.prototype.HasOpenObligation = function(playerId, commodity)
{
	for (let i = 0; i < this.contracts.length; ++i)
	{
		const contract = this.contracts[i];
		if (contract.seller === playerId && contract.commodity === commodity && contract.status !== "fulfilled")
			return true;
	}
	return false;
};

/**
 * Worst link on the physical corridor between the two assigned markets, from 0 to 100.
 * National commodity stock is already at the seller's endpoint. The path from a producer
 * to the capital does not set this number.
 * @return {number}
 */
TradeContractManager.prototype.CorridorCondition = function(origin, destination)
{
	if (typeof IID_TransportEfficiency === "undefined")
		return 0;
	const cmpTransport = Engine.QueryInterface(SYSTEM_ENTITY, IID_TransportEfficiency);
	if (!cmpTransport || !cmpTransport.GetCommercialRoute)
		return 0;
	const route = cmpTransport.GetCommercialRoute(origin, destination);
	if (!route || !route.connected || !Number.isInteger(route.condition) || route.condition <= 0)
		return 0;
	return route.condition;
};

/**
 * Infrastructure-scaled lot. Stock and the remaining promise can only make it smaller.
 * @return {number}
 */
TradeContractManager.prototype.LotCapacity = function(origin, destination)
{
	const condition = this.CorridorCondition(origin, destination);
	if (condition <= 0)
		return 0;
	return Math.floor(this.LotSize * condition / 100);
};

/**
 * Acceptance records the promise. Stock and treasury stay where they are.
 * @return {number}
 */
TradeContractManager.prototype.Create = function(agreementId, item)
{
	const cmpInventory = Engine.QueryInterface(SYSTEM_ENTITY, IID_CommodityInventory);
	if (!cmpInventory || !item || !cmpInventory.Known(item.commodity))
		return 0;
	if (!Number.isInteger(item.provider) || item.provider <= 0 ||
		!Number.isInteger(item.beneficiary) || item.beneficiary <= 0 ||
		item.provider === item.beneficiary)
		return 0;
	if (!Number.isInteger(item.quantity) || item.quantity <= 0 ||
		!Number.isInteger(item.totalPrice) || item.totalPrice <= 0)
		return 0;

	const contract = {
		"id": this.nextId++,
		"agreementId": agreementId || 0,
		"seller": item.provider,
		"buyer": item.beneficiary,
		"commodity": item.commodity,
		"quantityAgreed": item.quantity,
		"quantityDelivered": 0,
		"totalPrice": item.totalPrice,
		"amountPaid": 0,
		"status": "active",
		"blockReason": "",
		"trader": 0,
		"sellerMarket": 0,
		"buyerMarket": 0
	};
	this.contracts.push(contract);
	return contract.id;
};

/**
 * Remove a contract that acceptance rolled back. A settled contract is left alone.
 * @return {boolean}
 */
TradeContractManager.prototype.Drop = function(id)
{
	for (let i = 0; i < this.contracts.length; ++i)
	{
		const contract = this.contracts[i];
		if (contract.id !== id)
			continue;
		if (contract.quantityDelivered !== 0 || contract.amountPaid !== 0)
			return false;
		this.contracts.splice(i, 1);
		return true;
	}
	return false;
};

/**
 * @return {boolean}
 */
TradeContractManager.prototype.EndpointOwned = function(ent, owner)
{
	const cmpOwnership = Engine.QueryInterface(ent, IID_Ownership);
	return !cmpOwnership || !cmpOwnership.GetOwner || cmpOwnership.GetOwner() === owner;
};

/**
 * @return {boolean}
 */
TradeContractManager.prototype.EntityAlive = function(ent)
{
	if (!ent)
		return false;
	if (typeof IID_Health === "undefined")
		return true;
	const cmpHealth = Engine.QueryInterface(ent, IID_Health);
	if (!cmpHealth || !cmpHealth.GetHitpoints)
		return true;
	return cmpHealth.GetHitpoints() > 0;
};

/**
 * Bind one representative trader to one contract and start the upstream route.
 * The first market is the seller. The second market is the buyer.
 * @return {boolean}
 */
TradeContractManager.prototype.Assign = function(player, contractId, trader, sellerMarket, buyerMarket)
{
	const contract = this.Find(contractId);
	if (!contract || contract.status === "fulfilled")
		return false;
	if (player !== contract.seller && player !== contract.buyer)
		return false;
	if (!trader || !sellerMarket || !buyerMarket || sellerMarket === buyerMarket)
		return false;
	if (!Engine.QueryInterface(sellerMarket, IID_Market) || !Engine.QueryInterface(buyerMarket, IID_Market))
		return false;
	if (!this.EndpointOwned(sellerMarket, contract.seller) || !this.EndpointOwned(buyerMarket, contract.buyer))
		return false;
	if (!this.EntityAlive(trader) || !this.EntityAlive(sellerMarket) || !this.EntityAlive(buyerMarket))
		return false;

	contract.trader = trader;
	contract.sellerMarket = sellerMarket;
	contract.buyerMarket = buyerMarket;
	contract.blockReason = "";

	if (typeof IID_UnitAI !== "undefined")
	{
		const cmpUnitAI = Engine.QueryInterface(trader, IID_UnitAI);
		if (cmpUnitAI && cmpUnitAI.SetupTradeRoute)
			cmpUnitAI.SetupTradeRoute(buyerMarket, sellerMarket, null, false);
	}
	return true;
};

/**
 * Buyer may purchase from the seller. TradeAccess is not implied by the contract.
 * @return {boolean}
 */
TradeContractManager.prototype.AccessAllows = function(contract)
{
	const cmpTrade = Engine.QueryInterface(SYSTEM_ENTITY, IID_TradeAccess);
	return !!(cmpTrade && cmpTrade.CanTrade(contract.buyer, contract.seller));
};

/**
 * @return {boolean}
 */
TradeContractManager.prototype.Enemies = function(seller, buyer)
{
	const cmpSeller = QueryPlayerIDInterface(seller);
	return !!(cmpSeller && cmpSeller.IsEnemy && cmpSeller.IsEnemy(buyer));
};

/**
 * Cumulative payment so the last unit closes on the exact total.
 * @return {number}
 */
TradeContractManager.prototype.PaymentFor = function(contract, nextDelivered)
{
	const target = Math.floor(contract.totalPrice * nextDelivered / contract.quantityAgreed);
	return target - contract.amountPaid;
};

/**
 * One arrival. Nothing moves unless the whole transfer can be written.
 * @return {Object}
 */
TradeContractManager.prototype.TryDeliver = function(contractId)
{
	const none = { "delivered": 0, "paid": 0, "reason": "" };
	const contract = this.Find(contractId);
	if (!contract)
		return none;
	if (contract.status === "fulfilled")
	{
		none.reason = "fulfilled";
		return none;
	}

	const refuse = reason =>
	{
		contract.blockReason = reason;
		return { "delivered": 0, "paid": 0, "reason": reason };
	};

	if (!contract.trader || !this.EntityAlive(contract.trader))
		return refuse("no_trader");
	if (!contract.sellerMarket || !contract.buyerMarket ||
		!Engine.QueryInterface(contract.sellerMarket, IID_Market) ||
		!Engine.QueryInterface(contract.buyerMarket, IID_Market) ||
		!this.EntityAlive(contract.sellerMarket) || !this.EntityAlive(contract.buyerMarket) ||
		!this.EndpointOwned(contract.sellerMarket, contract.seller) ||
		!this.EndpointOwned(contract.buyerMarket, contract.buyer))
		return refuse("no_endpoint");
	if (!this.AccessAllows(contract))
		return refuse("no_access");
	if (this.Enemies(contract.seller, contract.buyer))
		return refuse("enemies");

	const lot = this.LotCapacity(contract.sellerMarket, contract.buyerMarket);
	if (lot <= 0)
		return refuse("no_route");

	const cmpInventory = Engine.QueryInterface(SYSTEM_ENTITY, IID_CommodityInventory);
	const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
	if (!cmpInventory || !cmpFinance)
		return refuse("no_capacity");

	const remaining = contract.quantityAgreed - contract.quantityDelivered;
	const stock = cmpInventory.GetStock(contract.seller, contract.commodity);
	const qty = Math.min(lot, remaining, stock);
	if (qty <= 0)
		return refuse("no_supply");

	const payment = this.PaymentFor(contract, contract.quantityDelivered + qty);
	if (payment < 0)
		return refuse("buyer_cannot_pay");
	if (payment > 0 && !cmpFinance.CanAfford(contract.buyer, payment))
	{
		contract.status = "blocked";
		return refuse("buyer_cannot_pay");
	}

	const receipt = cmpInventory.Take(contract.seller, contract.commodity, qty);
	if (!receipt)
		return refuse("no_supply");
	if (payment > 0 && !cmpFinance.Spend(contract.buyer, payment))
	{
		cmpInventory.Restore(receipt);
		contract.status = "blocked";
		return refuse("buyer_cannot_pay");
	}
	if (!cmpInventory.Add(contract.buyer, contract.commodity, qty))
	{
		cmpInventory.Restore(receipt);
		if (payment > 0)
			cmpFinance.AddFunds(contract.buyer, payment);
		return refuse("no_supply");
	}
	if (payment > 0 && !cmpFinance.AddFunds(contract.seller, payment))
	{
		cmpInventory.Take(contract.buyer, contract.commodity, qty);
		cmpInventory.Restore(receipt);
		if (payment > 0)
			cmpFinance.AddFunds(contract.buyer, payment);
		return refuse("buyer_cannot_pay");
	}

	contract.quantityDelivered += qty;
	contract.amountPaid += payment;
	if (contract.quantityDelivered === contract.quantityAgreed && contract.amountPaid === contract.totalPrice)
		contract.status = "fulfilled";
	else
		contract.status = "active";
	contract.blockReason = "";
	return { "delivered": qty, "paid": payment, "reason": "settled" };
};

/**
 * Called when a representative trader finishes a leg at a market.
 * The return to the seller is not a delivery.
 */
TradeContractManager.prototype.SettleArrival = function(trader, market)
{
	for (let i = 0; i < this.contracts.length; ++i)
	{
		const contract = this.contracts[i];
		if (contract.trader !== trader || contract.buyerMarket !== market)
			continue;
		if (contract.status === "fulfilled")
			continue;
		this.TryDeliver(contract.id);
	}
};

Engine.RegisterSystemComponentType(IID_TradeContractManager, "TradeContractManager", TradeContractManager);

function RegisterTradeRouteCommands()
{
	if (typeof g_Commands === "undefined")
		return;

	g_Commands["nation-assign-trade-route"] = function(player, cmd)
	{
		const cmpContracts = Engine.QueryInterface(SYSTEM_ENTITY, IID_TradeContractManager);
		if (!cmpContracts || !cmd)
			return;
		cmpContracts.Assign(player, cmd.contract, cmd.trader, cmd.sellerMarket, cmd.buyerMarket);
	};
}

RegisterTradeRouteCommands();
