function TradeContractManager() {}

TradeContractManager.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * One representative trip moves at most this many units when the corridor is intact.
 */
TradeContractManager.prototype.LotSize = 100;

/**
 * How soon a merchant waiting at the seller market looks for a corridor again.
 * One timer per waiting contract. It does not issue a movement order until a route exists.
 */
TradeContractManager.prototype.ResumeDelay = 2000;

TradeContractManager.prototype.Init = function()
{
	this.nextId = 1;
	this.contracts = [];
	this.timers = {};
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
 * Physical path between the contract's markets, including transit legality.
 * @return {Object}
 */
TradeContractManager.prototype.DescribedCorridor = function(contract)
{
	const empty = {
		"connected": false,
		"condition": 0,
		"links": [],
		"nodes": [],
		"transitStates": [],
		"missingTransit": [],
		"legallyUsable": false
	};
	if (typeof IID_TransportEfficiency === "undefined")
		return empty;
	const cmpTransport = Engine.QueryInterface(SYSTEM_ENTITY, IID_TransportEfficiency);
	if (!cmpTransport || !cmpTransport.DescribeCommercialRoute)
		return empty;
	return cmpTransport.DescribeCommercialRoute(
		contract.sellerMarket, contract.buyerMarket, contract.seller, contract.buyer);
};

/**
 * Widest corridor the seller may legally use for this contract.
 * @return {Object}
 */
TradeContractManager.prototype.UsableCorridor = function(contract)
{
	const empty = {
		"connected": false,
		"condition": 0,
		"links": [],
		"nodes": [],
		"transitStates": [],
		"missingTransit": [],
		"legallyUsable": false
	};
	if (typeof IID_TransportEfficiency === "undefined")
		return empty;
	const cmpTransport = Engine.QueryInterface(SYSTEM_ENTITY, IID_TransportEfficiency);
	if (!cmpTransport || !cmpTransport.GetUsableCommercialRoute)
		return empty;
	return cmpTransport.GetUsableCommercialRoute(
		contract.seller, contract.sellerMarket, contract.buyerMarket, contract.buyer);
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
		"missingTransit": [],
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

	const refuse = (reason, missing) =>
	{
		contract.blockReason = reason;
		contract.missingTransit = missing ? missing.slice() : [];
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

	const journey = this.ActiveJourney(contract);
	let lot = 0;
	if (journey)
	{
		const assessed = this.AssessJourney(contract, journey);
		this.ReleaseJourney(contract);
		if (!assessed.operational)
			return refuse("no_route");
		if (!assessed.legallyUsable)
			return refuse("missing_transit", assessed.missingTransit);
		lot = Math.floor(this.LotSize * assessed.condition / 100);
	}
	else
	{
		const usable = this.UsableCorridor(contract);
		if (!usable.connected)
		{
			const described = this.DescribedCorridor(contract);
			if (described.connected && described.missingTransit.length)
				return refuse("missing_transit", described.missingTransit);
			return refuse("no_route");
		}
		lot = Math.floor(this.LotSize * usable.condition / 100);
	}
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
	contract.missingTransit = [];
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

/**
 * Contract currently served by this merchant, if it is still open.
 * @return {Object|null}
 */
TradeContractManager.prototype.FindByTrader = function(trader)
{
	if (!trader)
		return null;
	for (let i = 0; i < this.contracts.length; ++i)
	{
		const contract = this.contracts[i];
		if (contract.trader === trader && contract.status !== "fulfilled")
			return contract;
	}
	return null;
};

/**
 * Departure snapshot for the merchant bound to this contract.
 * Direct settlement, with no snapshot, keeps using the live usable route.
 * @return {Object|null}
 */
TradeContractManager.prototype.ActiveJourney = function(contract)
{
	if (!contract || !contract.trader || typeof IID_Trader === "undefined")
		return null;
	const cmpTrader = Engine.QueryInterface(contract.trader, IID_Trader);
	if (!cmpTrader || !cmpTrader.GetJourney)
		return null;
	const journey = cmpTrader.GetJourney();
	if (!journey || !journey.links || !journey.links.length)
		return null;
	return journey;
};

/**
 * @return {Object}
 */
TradeContractManager.prototype.AssessJourney = function(contract, journey)
{
	const failed = {
		"operational": false,
		"condition": 0,
		"missingTransit": [],
		"legallyUsable": false
	};
	if (typeof IID_TransportEfficiency === "undefined")
		return failed;
	const cmpTransport = Engine.QueryInterface(SYSTEM_ENTITY, IID_TransportEfficiency);
	if (!cmpTransport || !cmpTransport.AssessLinks)
		return failed;
	return cmpTransport.AssessLinks(journey.links, contract.seller, contract.buyer);
};

/**
 * Drop the settlement snapshot. The return trip still has its waypoint list.
 */
TradeContractManager.prototype.ReleaseJourney = function(contract)
{
	if (!contract || !contract.trader || typeof IID_Trader === "undefined")
		return;
	const cmpTrader = Engine.QueryInterface(contract.trader, IID_Trader);
	if (cmpTrader && cmpTrader.ClearJourney)
		cmpTrader.ClearJourney();
};

/**
 * Copy the seller-to-buyer waypoint list onto the live trade order.
 * UnitAI reads it after PerformTrade and reverses it when walking back to the seller.
 */
TradeContractManager.prototype.ApplyCorridor = function(trader)
{
	if (typeof IID_UnitAI === "undefined" || typeof IID_Trader === "undefined")
		return;
	const cmpTrader = Engine.QueryInterface(trader, IID_Trader);
	const cmpUnitAI = Engine.QueryInterface(trader, IID_UnitAI);
	if (!cmpTrader || !cmpTrader.GetCorridor || !cmpUnitAI || !cmpUnitAI.order || !cmpUnitAI.order.data)
		return;
	const corridor = cmpTrader.GetCorridor() || [];
	const route = [];
	for (let i = 0; i < corridor.length; ++i)
		route.push({
			"x": corridor[i].x,
			"z": corridor[i].z,
			"min": corridor[i].min,
			"max": corridor[i].max
		});
	cmpUnitAI.order.data.route = route;
};

/**
 * Record a logistics block and leave the contract active.
 */
TradeContractManager.prototype.NoteBlock = function(contract, reason, missing)
{
	contract.blockReason = reason;
	contract.missingTransit = missing ? missing.slice() : [];
	if (contract.status !== "fulfilled")
		contract.status = contract.status === "blocked" ? "blocked" : "active";
};

/**
 * Stop this delivery leg. A closed corridor does not keep the previous waypoint list.
 * @return {string}
 */
TradeContractManager.prototype.HoldDeparture = function(contract, reason, missing)
{
	this.NoteBlock(contract, reason, missing);
	if (reason !== "no_endpoint" && reason !== "no_trader")
		this.ScheduleResume(contract.id);
	if (typeof IID_UnitAI !== "undefined")
	{
		const cmpUnitAI = Engine.QueryInterface(contract.trader, IID_UnitAI);
		if (cmpUnitAI && cmpUnitAI.order && cmpUnitAI.order.data)
			cmpUnitAI.order.data.route = null;
	}
	return "hold";
};

/**
 * One later attempt to leave the seller. Movement is issued only when a corridor exists.
 */
TradeContractManager.prototype.ScheduleResume = function(contractId)
{
	if (!Number.isInteger(contractId) || contractId <= 0 || this.timers[contractId])
		return;
	if (typeof IID_Timer === "undefined")
		return;
	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (!cmpTimer)
		return;
	this.timers[contractId] = cmpTimer.SetTimeout(
		SYSTEM_ENTITY,
		IID_TradeContractManager,
		"ResumeDeparture",
		this.ResumeDelay,
		contractId
	);
};

/**
 * Called from the timer, or directly in tests. Does not walk when the corridor is still closed.
 */
TradeContractManager.prototype.ResumeDeparture = function(contractId)
{
	delete this.timers[contractId];
	const contract = this.Find(contractId);
	if (!contract || contract.status === "fulfilled")
		return;
	if (!contract.trader || !this.EntityAlive(contract.trader) ||
		!contract.sellerMarket || !contract.buyerMarket ||
		!this.EntityAlive(contract.sellerMarket) || !this.EntityAlive(contract.buyerMarket))
	{
		this.NoteBlock(contract, contract.trader && this.EntityAlive(contract.trader) ? "no_endpoint" : "no_trader");
		return;
	}

	const usable = this.UsableCorridor(contract);
	if (!usable.connected)
	{
		const described = this.DescribedCorridor(contract);
		if (described.connected && described.missingTransit.length)
			this.NoteBlock(contract, "missing_transit", described.missingTransit);
		else
			this.NoteBlock(contract, "no_route");
		this.ScheduleResume(contractId);
		return;
	}

	if (typeof IID_UnitAI === "undefined")
		return;
	const cmpUnitAI = Engine.QueryInterface(contract.trader, IID_UnitAI);
	if (!cmpUnitAI || !cmpUnitAI.SetupTradeRoute)
		return;
	if (cmpUnitAI.order && cmpUnitAI.order.type === "Trade")
		return;
	cmpUnitAI.SetupTradeRoute(contract.buyerMarket, contract.sellerMarket, null, false);
};

/**
 * Choose the corridor at the start of a seller-to-buyer leg.
 * A return leg retraces that corridor. An unbound trader is left to ordinary trade orders.
 * @return {string} "free", "hold", "outbound", or "return"
 */
TradeContractManager.prototype.PrepareDeparture = function(trader, currentMarket, nextMarket)
{
	const contract = this.FindByTrader(trader);
	if (!contract)
		return "free";
	if (currentMarket === contract.buyerMarket && nextMarket === contract.sellerMarket)
	{
		this.ApplyCorridor(trader);
		return "return";
	}
	if (currentMarket !== contract.sellerMarket || nextMarket !== contract.buyerMarket)
		return "free";

	if (!this.EntityAlive(contract.sellerMarket) || !this.EntityAlive(contract.buyerMarket) ||
		!Engine.QueryInterface(contract.sellerMarket, IID_Market) ||
		!Engine.QueryInterface(contract.buyerMarket, IID_Market))
		return this.HoldDeparture(contract, "no_endpoint");
	if (!this.AccessAllows(contract))
		return this.HoldDeparture(contract, "no_access");
	if (this.Enemies(contract.seller, contract.buyer))
		return this.HoldDeparture(contract, "enemies");

	const usable = this.UsableCorridor(contract);
	if (!usable.connected)
	{
		const described = this.DescribedCorridor(contract);
		if (described.connected && described.missingTransit.length)
			return this.HoldDeparture(contract, "missing_transit", described.missingTransit);
		return this.HoldDeparture(contract, "no_route");
	}

	let points = [];
	if (typeof IID_TransportEfficiency !== "undefined")
	{
		const cmpTransport = Engine.QueryInterface(SYSTEM_ENTITY, IID_TransportEfficiency);
		if (cmpTransport && cmpTransport.CorridorWaypoints)
			points = cmpTransport.CorridorWaypoints(usable.nodes);
	}
	const cmpTrader = typeof IID_Trader !== "undefined" && Engine.QueryInterface(trader, IID_Trader);
	if (cmpTrader && cmpTrader.SetJourney)
	{
		cmpTrader.SetJourney({
			"links": usable.links,
			"nodes": usable.nodes,
			"condition": usable.condition,
			"points": points
		});
	}
	this.ApplyCorridor(trader);
	contract.blockReason = "";
	contract.missingTransit = [];
	return "outbound";
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
