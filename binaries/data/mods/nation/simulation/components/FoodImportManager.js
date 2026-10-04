function FoodImportManager() {}

FoodImportManager.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * Prototype purchase size. Gameplay tuning, not a market price.
 * A scenario offer may set its own amount. This is the value used when it does not.
 */
FoodImportManager.prototype.FoodImportAmount = 1000;

/**
 * Prototype treasury cost of one food purchase. Gameplay tuning, not a currency conversion.
 */
FoodImportManager.prototype.FoodImportCost = 500000;

FoodImportManager.prototype.Init = function()
{
	// Configured offers. A purchase does not remove an offer.
	this.offers = [];
	AttachFoodImportToSimulationState();
};

FoodImportManager.prototype.OnInitGame = function()
{
	const settings = typeof InitAttributes !== "undefined" && InitAttributes.settings;
	this.ReadOffers(settings ? settings.FoodImports : undefined);
};

/**
 * Loaded games restore offers without Init. The quote wrapper is not saved state.
 */
FoodImportManager.prototype.OnUpdate = function()
{
	AttachFoodImportToSimulationState();
};

/**
 * @param {Object[]|undefined} offers
 * @return {boolean} - False when the list is present but malformed. Malformed data stores no offers.
 */
FoodImportManager.prototype.ReadOffers = function(offers)
{
	this.offers = [];
	if (offers === undefined || offers === null)
		return true;
	if (!Array.isArray(offers))
	{
		error("FoodImportManager: expected an array of offers");
		return false;
	}

	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	const numPlayers = cmpPlayerManager ? cmpPlayerManager.GetNumPlayers() : undefined;
	const parsed = [];
	const seen = {};
	for (let i = 0; i < offers.length; ++i)
	{
		const offer = offers[i];
		const id = offer && typeof offer.id === "string" ? offer.id : "";
		const buyer = offer ? +offer.buyer : NaN;
		const seller = offer ? +offer.seller : NaN;
		const resource = offer && typeof offer.resource === "string" ? offer.resource : "";
		const amount = offer && offer.amount !== undefined ? +offer.amount : this.FoodImportAmount;
		const cost = offer && offer.cost !== undefined ? +offer.cost : this.FoodImportCost;
		if (!id || seen[id] ||
			!Number.isInteger(buyer) || buyer <= 0 ||
			!Number.isInteger(seller) || seller <= 0 || seller === buyer ||
			resource !== "food" ||
			!Number.isInteger(amount) || amount <= 0 ||
			!Number.isInteger(cost) || cost <= 0 ||
			(numPlayers !== undefined && (buyer >= numPlayers || seller >= numPlayers)))
		{
			error("FoodImportManager: offer " + i + " is not a usable food import");
			this.offers = [];
			return false;
		}
		seen[id] = true;
		parsed.push({
			"id": id,
			"buyer": buyer,
			"seller": seller,
			"resource": resource,
			"amount": amount,
			"cost": cost
		});
	}

	this.offers = parsed;
	return true;
};

/**
 * @param {string} offerId
 * @return {Object|null}
 */
FoodImportManager.prototype.GetOffer = function(offerId)
{
	if (typeof offerId !== "string" || !offerId)
		return null;
	for (let i = 0; i < this.offers.length; ++i)
		if (this.offers[i].id === offerId)
			return this.offers[i];
	return null;
};

/**
 * @param {number} playerId
 * @return {Object|null}
 */
FoodImportManager.prototype.Player = function(playerId)
{
	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	if (!cmpPlayerManager)
		return null;
	const ent = cmpPlayerManager.GetPlayerByID(playerId);
	return ent ? Engine.QueryInterface(ent, IID_Player) : null;
};

/**
 * Authoritative quote for the offer this player is allowed to buy.
 * The seller's stock is not consulted. International transport is not consulted.
 * @param {number} playerId
 * @return {Object|null}
 */
FoodImportManager.prototype.GetQuote = function(playerId)
{
	if (!Number.isInteger(playerId) || playerId <= 0)
		return null;

	let offer = null;
	for (let i = 0; i < this.offers.length; ++i)
	{
		if (this.offers[i].buyer === playerId)
		{
			offer = this.offers[i];
			break;
		}
	}
	if (!offer)
		return null;

	const cmpTrade = Engine.QueryInterface(SYSTEM_ENTITY, IID_TradeAccess);
	const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
	const tradeAllowed = !!(cmpTrade && cmpTrade.CanTrade(playerId, offer.seller));
	const canAfford = !!(cmpFinance && cmpFinance.CanAfford(playerId, offer.cost));
	return {
		"id": offer.id,
		"seller": offer.seller,
		"resource": offer.resource,
		"amount": offer.amount,
		"cost": offer.cost,
		"tradeAllowed": tradeAllowed,
		"canAfford": canAfford,
		"available": tradeAllowed && canAfford
	};
};

/**
 * Spend treasury and add food in one purchase. A failed check changes neither.
 * The seller's food and treasury are left alone. Shortage state is not written.
 * @param {number} playerId - The buyer. Must be the offer's buyer.
 * @param {string} offerId
 * @return {boolean}
 */
FoodImportManager.prototype.Purchase = function(playerId, offerId)
{
	if (!Number.isInteger(playerId) || playerId <= 0 || typeof offerId !== "string" || !offerId)
		return false;

	const offer = this.GetOffer(offerId);
	if (!offer || offer.buyer !== playerId)
		return false;

	const cmpTrade = Engine.QueryInterface(SYSTEM_ENTITY, IID_TradeAccess);
	if (!cmpTrade || !cmpTrade.CanTrade(playerId, offer.seller))
		return false;

	const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
	if (!cmpFinance || !cmpFinance.CanAfford(playerId, offer.cost))
		return false;

	const cmpPlayer = this.Player(playerId);
	if (!cmpPlayer)
		return false;
	const before = cmpPlayer.GetResourceCounts()[offer.resource];
	if (!Number.isFinite(before))
		return false;

	if (!cmpFinance.Spend(playerId, offer.cost))
		return false;

	cmpPlayer.AddResource(offer.resource, offer.amount);
	const after = cmpPlayer.GetResourceCounts()[offer.resource];
	if (after !== before + offer.amount)
	{
		cmpFinance.AddFunds(playerId, offer.cost);
		if (Number.isFinite(after) && after > before)
			cmpPlayer.TrySubtractResources({ [offer.resource]: after - before });
		return false;
	}
	return true;
};

Engine.RegisterSystemComponentType(IID_FoodImportManager, "FoodImportManager", FoodImportManager);

/**
 * Commands.js creates g_Commands while helpers load.
 * The lookup happens when the command arrives, including after a loaded game.
 */
function RegisterFoodImportCommand()
{
	if (typeof g_Commands === "undefined")
		return;

	g_Commands["nation-purchase-import"] = function(player, cmd)
	{
		const cmpImport = Engine.QueryInterface(SYSTEM_ENTITY, IID_FoodImportManager);
		if (!cmpImport || !cmd || typeof cmd.offer !== "string")
			return;
		cmpImport.Purchase(player, cmd.offer);
	};
}

RegisterFoodImportCommand();

/**
 * GetSimulationState has no mod hook. Attach the import quote beside the food status.
 * A later wrap of the same function keeps this flag so the two readouts both survive.
 */
function AttachFoodImportToSimulationState()
{
	if (typeof GuiInterface === "undefined" || !GuiInterface.prototype.GetSimulationState)
		return;
	if (GuiInterface.prototype.GetSimulationState.nationFoodImportWrapped)
		return;

	const original = GuiInterface.prototype.GetSimulationState;
	const wrapped = function()
	{
		const state = original.apply(this, arguments);
		if (!state || !state.players)
			return state;
		const cmpImport = Engine.QueryInterface(SYSTEM_ENTITY, IID_FoodImportManager);
		if (!cmpImport)
			return state;
		for (let playerId = 1; playerId < state.players.length; ++playerId)
		{
			const quote = cmpImport.GetQuote(playerId);
			if (quote)
				state.players[playerId].nationFoodImport = quote;
		}
		return state;
	};
	wrapped.nationFoodImportWrapped = true;
	if (original.nationFoodWrapped)
		wrapped.nationFoodWrapped = true;
	GuiInterface.prototype.GetSimulationState = wrapped;
}

AttachFoodImportToSimulationState();
