function AgreementEvaluator() {}

var NationParticipantKey = typeof NationParticipantKey === "function" ? NationParticipantKey : function(participant)
{
	if (typeof participant === "number" && Number.isInteger(participant) && participant > 0)
		return "player:" + participant;
	if (participant && participant.type === "foreign_actor" &&
		typeof participant.id === "string" && /^[a-z][a-z0-9_]*$/.test(participant.id))
		return "foreign_actor:" + participant.id;
	return "";
};

var NationSameParticipant = typeof NationSameParticipant === "function" ? NationSameParticipant : function(left, right)
{
	const key = NationParticipantKey(left);
	return key !== "" && key === NationParticipantKey(right);
};

AgreementEvaluator.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * Utility is an integer. Positive favors the evaluating country.
 * AcceptAt is the acceptance line. CounterAt is the floor of a counteroffer.
 * Below CounterAt the proposal is rejected. A hard-rejected item is rejected
 * whatever the sum is.
 */
AgreementEvaluator.prototype.AcceptAt = 0;
AgreementEvaluator.prototype.CounterAt = -200;

AgreementEvaluator.prototype.CashScale = 132;
AgreementEvaluator.prototype.CashReference = 500000;

AgreementEvaluator.prototype.ShortageDivisor = 2500;
AgreementEvaluator.prototype.SurplusIntervals = 8;
AgreementEvaluator.prototype.SurplusFactor = 0.5;
AgreementEvaluator.prototype.ImpossibleCost = 5000;

AgreementEvaluator.prototype.MilitaryReceive = 25;
AgreementEvaluator.prototype.MilitaryGrant = 40;
AgreementEvaluator.prototype.MilitaryGrantOccupied = 120;
AgreementEvaluator.prototype.MilitaryHostile = 1000;

AgreementEvaluator.prototype.TradeReceive = 15;
AgreementEvaluator.prototype.TradeGrant = 8;

/**
 * Receiving transit that opens an otherwise closed commercial route.
 * A route that only improves capacity is worth less. An existing legal
 * route of equal capacity is worth nothing more.
 */
AgreementEvaluator.prototype.TransitUnlock = 120;
AgreementEvaluator.prototype.TransitImprove = 40;
AgreementEvaluator.prototype.TransitGrantBase = 25;
AgreementEvaluator.prototype.TransitGrantCorridor = 70;

/**
 * Each prototype interval keeps 9/10 of a future payment's present weight.
 * Integer thousandths. Long enough grace stays better for the borrower
 * even though interest accrues during grace.
 */
AgreementEvaluator.prototype.DiscountKeep = 9;
AgreementEvaluator.prototype.DiscountBase = 10;
AgreementEvaluator.prototype.BurdenReference = 5000000;

AgreementEvaluator.prototype.Init = function()
{
};

/**
 * @return {Object|null}
 */
AgreementEvaluator.prototype.ResourceProfile = function(code)
{
	if (code === "food")
		return { "scale": 2, "reference": 400 };
	if (code === "wood" || code === "stone")
		return { "scale": 1, "reference": 300 };
	if (code === "metal")
		return { "scale": 1, "reference": 200 };
	return { "scale": 1, "reference": 200 };
};

/**
 * Integral of scale * reference / (reference + stock) between two stocks.
 * @return {number}
 */
AgreementEvaluator.prototype.RangeValue = function(scale, reference, fromStock, toStock)
{
	if (toStock === fromStock)
		return 0;
	const low = reference + fromStock;
	const high = reference + toStock;
	if (low <= 0 || high <= 0)
		return 0;
	return scale * reference * Math.log(high / low);
};

AgreementEvaluator.prototype.Stock = function(playerId, code)
{
	const cmpPlayer = QueryPlayerIDInterface(playerId);
	const counts = cmpPlayer && cmpPlayer.GetResourceCounts();
	const amount = counts && counts[code];
	return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

AgreementEvaluator.prototype.Treasury = function(participant)
{
	if (typeof participant === "number")
	{
		const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
		return cmpFinance ? cmpFinance.GetTreasury(participant) : 0;
	}
	if (typeof IID_ForeignActorManager === "undefined")
		return 0;
	const cmpActors = Engine.QueryInterface(SYSTEM_ENTITY, IID_ForeignActorManager);
	return cmpActors && participant ? cmpActors.GetTreasury(participant.id) : 0;
};

/**
 * Positive log span of moving amount onto a treasury. Amount is not signed.
 * @return {number}
 */
AgreementEvaluator.prototype.CashMagnitude = function(treasury, amount)
{
	if (!Number.isInteger(amount) || amount <= 0 || treasury < 0)
		return 0;
	const low = this.CashReference + treasury;
	const high = this.CashReference + treasury + amount;
	return this.CashScale * Math.log(high / low);
};

/**
 * (9/10)^ahead applied to a utility magnitude, in integer thousandths.
 * @return {number}
 */
AgreementEvaluator.prototype.Discounted = function(value, ahead)
{
	let scaled = Math.round(value * 1000);
	for (let i = 0; i < ahead; ++i)
		scaled = Math.floor(scaled * this.DiscountKeep / this.DiscountBase);
	return scaled / 1000;
};

/**
 * Principal slices and the interest due with each one. Grace interest is added to the first payment.
 * @return {Object[]}
 */
AgreementEvaluator.prototype.LoanSchedule = function(item)
{
	const events = [];
	let outstanding = item.principal;
	let bag = 0;
	for (let grace = 1; grace <= item.graceIntervals; ++grace)
		bag += Math.floor(outstanding * item.interestRateBps / 10000);

	let uncharged = item.principal;
	for (let installment = 1; installment <= item.installments; ++installment)
	{
		const remaining = item.installments - installment + 1;
		const slice = remaining <= 1 ? uncharged : Math.floor(uncharged / remaining);
		uncharged -= slice;
		const interest = Math.floor(outstanding * item.interestRateBps / 10000) + (installment === 1 ? bag : 0);
		bag = 0;
		outstanding -= slice;
		events.push({
			"pay": slice + interest,
			"ahead": item.graceIntervals + installment
		});
	}
	return events;
};

/**
 * Borrower utility is principal now, minus discounted repayments.
 * Existing debt increases that future cost. Lender utility is the reverse, at full repayment.
 * @return {number}
 */
AgreementEvaluator.prototype.LoanUtility = function(item, treasury, burden, asBorrower)
{
	if (!asBorrower && treasury < item.principal)
		return -this.ImpossibleCost;

	const factor = asBorrower ? (this.BurdenReference + burden) / this.BurdenReference : 1;
	let cursor = asBorrower ? treasury + item.principal : treasury - item.principal;
	let utility = asBorrower ?
		this.CashMagnitude(treasury, item.principal) :
		-this.CashMagnitude(cursor, item.principal);
	const events = this.LoanSchedule(item);
	for (let i = 0; i < events.length; ++i)
	{
		const payment = events[i].pay;
		const payable = asBorrower ? Math.min(payment, cursor) : payment;
		const magnitude = this.CashMagnitude(asBorrower ? cursor - payable : cursor, payable);
		const weighted = this.Discounted(magnitude, events[i].ahead) * factor;
		utility += asBorrower ? -weighted : weighted;
		if (asBorrower && payment > cursor)
			utility -= (payment - cursor) / 10000 * factor;
		cursor = asBorrower ? Math.max(0, cursor - payment) : cursor + payment;
	}
	return Math.round(utility);
};

/**
 * Forgiveness is valued from the size of the claim, not from a cash transfer.
 * @return {number}
 */
AgreementEvaluator.prototype.ForgivenessUtility = function(amount, outstanding)
{
	const reference = 1000000;
	const capped = Math.min(amount, outstanding);
	if (capped <= 0 || outstanding <= 0)
		return 0;
	return Math.round(this.CashScale * Math.log((reference + outstanding) / (reference + outstanding - capped)));
};

AgreementEvaluator.prototype.DebtBurden = function(participant)
{
	if (typeof IID_DebtLedger === "undefined")
		return 0;
	const ledger = Engine.QueryInterface(SYSTEM_ENTITY, IID_DebtLedger);
	return ledger ? ledger.Burden(participant) : 0;
};

/**
 * Shortage and coverage against PopulationFoodConsumption. Missing demand is neutral.
 * @return {number}
 */
AgreementEvaluator.prototype.FoodSecurity = function(playerId, stock)
{
	const cmpFood = Engine.QueryInterface(SYSTEM_ENTITY, IID_PopulationFoodConsumption);
	const status = cmpFood && cmpFood.GetFoodStatus && cmpFood.GetFoodStatus(playerId);
	if (!status)
		return 1;

	const shortage = Number.isFinite(status.shortageBps) && status.shortageBps > 0 ? status.shortageBps : 0;
	const shortageFactor = 1 + shortage / this.ShortageDivisor;
	const required = status.required || 0;
	if (required <= 0)
		return shortageFactor;

	const coverage = stock / required;
	let coverageFactor = 1;
	if (coverage >= this.SurplusIntervals)
		coverageFactor = this.SurplusFactor;
	else if (coverage < 1)
		coverageFactor = 4;
	else if (coverage < 3)
		coverageFactor = 2;
	return shortageFactor * coverageFactor;
};

/**
 * consolidation, development, or advanced. A missing technology manager is consolidation.
 * @return {string}
 */
AgreementEvaluator.prototype.Phase = function(playerId)
{
	const cmpTech = QueryPlayerIDInterface(playerId, IID_TechnologyManager);
	if (!cmpTech || !cmpTech.IsTechnologyResearched)
		return "consolidation";

	const city = ["phase_city", "phase_city_athen", "phase_city_generic"];
	for (let i = 0; i < city.length; ++i)
		if (cmpTech.IsTechnologyResearched(city[i]))
			return "advanced";

	const town = ["phase_town", "phase_town_athen", "phase_town_generic"];
	for (let i = 0; i < town.length; ++i)
		if (cmpTech.IsTechnologyResearched(town[i]))
			return "development";
	return "consolidation";
};

/**
 * @return {boolean}
 */
AgreementEvaluator.prototype.MutuallyHostile = function(first, second)
{
	const from = QueryPlayerIDInterface(first, IID_Diplomacy);
	const to = QueryPlayerIDInterface(second, IID_Diplomacy);
	if (!from || !to || !from.IsEnemy || !to.IsEnemy)
		return false;
	return !!from.IsEnemy(second) && !!to.IsEnemy(first);
};

/**
 * @return {number}
 */
AgreementEvaluator.prototype.SoldierCount = function(playerId)
{
	const cmpRange = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	if (!cmpRange || !cmpRange.GetEntitiesByPlayer || typeof IID_Identity === "undefined")
		return 0;
	const entities = cmpRange.GetEntitiesByPlayer(playerId) || [];
	let count = 0;
	for (let i = 0; i < entities.length; ++i)
	{
		const cmpIdentity = Engine.QueryInterface(entities[i], IID_Identity);
		if (cmpIdentity && cmpIdentity.HasClass && cmpIdentity.HasClass("Soldier"))
			++count;
	}
	return count;
};

/**
 * Beneficiary already holds this right.
 * @return {boolean}
 */
AgreementEvaluator.prototype.RightAlreadyHeld = function(item)
{
	if (item.type === "military_access")
	{
		const cmpAccess = Engine.QueryInterface(SYSTEM_ENTITY, IID_DiplomaticAccess);
		return !!(cmpAccess && cmpAccess.HasMilitaryAccess(item.beneficiary, item.provider));
	}
	if (item.type === "trade_access")
	{
		const cmpTrade = Engine.QueryInterface(SYSTEM_ENTITY, IID_TradeAccess);
		return !!(cmpTrade && cmpTrade.CanTrade(item.beneficiary, item.provider));
	}
	if (item.type === "transit_rights")
	{
		const cmpTransit = typeof IID_TransitAccess !== "undefined" &&
			Engine.QueryInterface(SYSTEM_ENTITY, IID_TransitAccess);
		return !!(cmpTransit && cmpTransit.CanTransit(item.beneficiary, item.provider));
	}
	return false;
};

/**
 * @return {boolean}
 */
AgreementEvaluator.prototype.BeneficiaryOccupiesProvider = function(beneficiary, provider)
{
	if (typeof Engine.GetEntitiesWithInterface !== "function" || typeof IID_NationSettlement === "undefined")
		return false;
	const cmpOccupation = Engine.QueryInterface(SYSTEM_ENTITY, IID_MilitaryOccupation);
	if (!cmpOccupation)
		return false;
	const settlements = Engine.GetEntitiesWithInterface(IID_NationSettlement) || [];
	for (let i = 0; i < settlements.length; ++i)
	{
		const cmpSettlement = Engine.QueryInterface(settlements[i], IID_NationSettlement);
		if (!cmpSettlement || cmpSettlement.GetSovereignOwner() !== provider)
			continue;
		if (cmpOccupation.GetOccupier(settlements[i]) === beneficiary)
			return true;
	}
	return false;
};

/**
 * A same-package trade grant counts. The contract does not require the right to exist beforehand.
 * @return {boolean}
 */
AgreementEvaluator.prototype.SaleLegallyOpen = function(seller, buyer)
{
	const cmpTrade = typeof IID_TradeAccess !== "undefined" &&
		Engine.QueryInterface(SYSTEM_ENTITY, IID_TradeAccess);
	if (cmpTrade && cmpTrade.CanTrade(buyer, seller))
		return true;
	const proposal = this.scoringProposal;
	if (!proposal)
		return false;
	const items = (proposal.offer || []).concat(proposal.request || []);
	for (let i = 0; i < items.length; ++i)
	{
		const item = items[i];
		if (item && item.type === "trade_access" && item.provider === seller && item.beneficiary === buyer)
			return true;
	}
	return false;
};

/**
 * Living markets owned by one player, in ascending entity id.
 * @return {number[]}
 */
AgreementEvaluator.prototype.LivingMarkets = function(playerId)
{
	if (typeof IID_Market === "undefined")
		return [];
	const markets = Engine.GetEntitiesWithInterface(IID_Market).slice().sort((a, b) => a - b);
	const living = [];
	for (let i = 0; i < markets.length; ++i)
	{
		const cmpOwnership = Engine.QueryInterface(markets[i], IID_Ownership);
		if (!cmpOwnership || cmpOwnership.GetOwner() !== playerId)
			continue;
		if (typeof IID_Health !== "undefined")
		{
			const cmpHealth = Engine.QueryInterface(markets[i], IID_Health);
			if (cmpHealth && cmpHealth.GetHitpoints && cmpHealth.GetHitpoints() <= 0)
				continue;
		}
		living.push(markets[i]);
	}
	return living;
};

/**
 * Both states have a living market. This is the physical endpoint, not the legal right.
 * @return {boolean}
 */
AgreementEvaluator.prototype.PlayerHasMarket = function(playerId)
{
	return this.LivingMarkets(playerId).length > 0;
};

/**
 * Best physical corridor between the seller's markets and the buyer's markets.
 * Tie-break is the lower seller market id, then the lower buyer market id.
 * @return {{connected: boolean, condition: number, links: number[], origin: number, destination: number}}
 */
AgreementEvaluator.prototype.BestCommercialRoute = function(seller, buyer)
{
	const empty = { "connected": false, "condition": 0, "links": [], "origin": 0, "destination": 0 };
	if (typeof IID_TransportEfficiency === "undefined")
		return empty;
	const cmpTransport = Engine.QueryInterface(SYSTEM_ENTITY, IID_TransportEfficiency);
	if (!cmpTransport || !cmpTransport.GetCommercialRoute)
		return empty;

	const origins = this.LivingMarkets(seller);
	const destinations = this.LivingMarkets(buyer);
	let best = empty;
	for (let i = 0; i < origins.length; ++i)
	{
		for (let j = 0; j < destinations.length; ++j)
		{
			const route = cmpTransport.GetCommercialRoute(origins[i], destinations[j]);
			if (!route.connected || route.condition <= 0)
				continue;
			const better = !best.connected || route.condition > best.condition ||
				(route.condition === best.condition &&
					(origins[i] < best.origin || (origins[i] === best.origin && destinations[j] < best.destination)));
			if (!better)
				continue;
			best = {
				"connected": true,
				"condition": route.condition,
				"links": route.links,
				"origin": origins[i],
				"destination": destinations[j]
			};
		}
	}
	return best;
};

/**
 * Transit grants in the proposal currently being scored. The right does not have to exist yet.
 * @return {number[]}
 */
AgreementEvaluator.prototype.AssumedTransit = function(user)
{
	const extra = [];
	const proposal = this.scoringProposal;
	if (!proposal)
		return extra;
	const items = (proposal.offer || []).concat(proposal.request || []);
	for (let i = 0; i < items.length; ++i)
	{
		const item = items[i];
		if (!item || item.type !== "transit_rights" || item.beneficiary !== user)
			continue;
		if (!Number.isInteger(item.provider) || extra.indexOf(item.provider) !== -1)
			continue;
		extra.push(item.provider);
	}
	extra.sort((a, b) => a - b);
	return extra;
};

/**
 * Best legally usable corridor. assumed grantors count as already permitting the seller.
 * @return {Object}
 */
AgreementEvaluator.prototype.BestUsableCommercialRoute = function(seller, buyer, assumed)
{
	const empty = {
		"connected": false,
		"condition": 0,
		"links": [],
		"origin": 0,
		"destination": 0
	};
	if (typeof IID_TransportEfficiency === "undefined")
		return empty;
	const cmpTransport = Engine.QueryInterface(SYSTEM_ENTITY, IID_TransportEfficiency);
	if (!cmpTransport || !cmpTransport.GetUsableCommercialRoute)
		return empty;

	const origins = this.LivingMarkets(seller);
	const destinations = this.LivingMarkets(buyer);
	let best = empty;
	for (let i = 0; i < origins.length; ++i)
	{
		for (let j = 0; j < destinations.length; ++j)
		{
			const route = cmpTransport.GetUsableCommercialRoute(
				seller, origins[i], destinations[j], buyer, assumed);
			if (!route.connected || route.condition <= 0)
				continue;
			const better = !best.connected || route.condition > best.condition ||
				(route.condition === best.condition &&
					(origins[i] < best.origin || (origins[i] === best.origin && destinations[j] < best.destination)));
			if (!better)
				continue;
			best = {
				"connected": true,
				"condition": route.condition,
				"links": route.links,
				"origin": origins[i],
				"destination": destinations[j]
			};
		}
	}
	return best;
};

/**
 * Highest usable capacity from seller to buyer, or 0.
 * @return {number}
 */
AgreementEvaluator.prototype.CommercialCapacity = function(seller, buyer, assumed)
{
	return this.BestUsableCommercialRoute(seller, buyer, assumed).condition;
};

/**
 * True when some physical route from the beneficiary crosses the grantor's territory.
 * @return {boolean}
 */
AgreementEvaluator.prototype.GrantorOnCorridor = function(beneficiary, grantor)
{
	if (typeof IID_TransportEfficiency === "undefined" || typeof IID_PlayerManager === "undefined")
		return false;
	const cmpTransport = Engine.QueryInterface(SYSTEM_ENTITY, IID_TransportEfficiency);
	const cmpPlayers = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	if (!cmpTransport || !cmpTransport.DescribeCommercialRoute || !cmpPlayers)
		return false;
	const origins = this.LivingMarkets(beneficiary);
	const numPlayers = cmpPlayers.GetNumPlayers();
	for (let buyer = 1; buyer < numPlayers; ++buyer)
	{
		if (buyer === beneficiary)
			continue;
		const destinations = this.LivingMarkets(buyer);
		for (let i = 0; i < origins.length; ++i)
			for (let j = 0; j < destinations.length; ++j)
			{
				const route = cmpTransport.DescribeCommercialRoute(
					origins[i], destinations[j], beneficiary, buyer);
				if (route.transitStates && route.transitStates.indexOf(grantor) !== -1)
					return true;
			}
	}
	return false;
};

/**
 * Value to the state that receives the right. Compared with and without this grant.
 * @return {number}
 */
AgreementEvaluator.prototype.TransitBenefit = function(item)
{
	const user = item.beneficiary;
	const grantor = item.provider;
	if (!Number.isInteger(user) || !Number.isInteger(grantor))
		return 0;
	const assumed = this.AssumedTransit(user);
	const without = [];
	for (let i = 0; i < assumed.length; ++i)
		if (assumed[i] !== grantor)
			without.push(assumed[i]);
	const withGrant = without.slice();
	withGrant.push(grantor);
	withGrant.sort((a, b) => a - b);

	if (typeof IID_PlayerManager === "undefined")
		return 0;
	const cmpPlayers = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	if (!cmpPlayers)
		return 0;
	let kind = 0;
	const numPlayers = cmpPlayers.GetNumPlayers();
	for (let buyer = 1; buyer < numPlayers; ++buyer)
	{
		if (buyer === user)
			continue;
		const before = this.CommercialCapacity(user, buyer, without);
		const after = this.CommercialCapacity(user, buyer, withGrant);
		if (before === 0 && after > 0)
			kind = 2;
		else if (after > before && kind < 2)
			kind = 1;
	}
	if (kind === 2)
		return this.TransitUnlock;
	if (kind === 1)
		return this.TransitImprove;
	return 0;
};

/**
 * Cost to the state that gives the right. Higher when their territory is on a real corridor.
 * @return {number}
 */
AgreementEvaluator.prototype.TransitGrantCost = function(item)
{
	if (this.GrantorOnCorridor(item.beneficiary, item.provider))
		return -this.TransitGrantCorridor;
	return -this.TransitGrantBase;
};

/**
 * Legal permission and a physical corridor that can still carry goods.
 * @return {boolean}
 */
AgreementEvaluator.prototype.SaleRouteOpen = function(item)
{
	if (!this.SaleLegallyOpen(item.provider, item.beneficiary))
		return false;
	return this.BestCommercialRoute(item.provider, item.beneficiary).connected;
};

/**
 * Buyer benefit is the commodity. Buyer cost is the promised payment.
 * Seller benefit is the payment. Seller cost is the commodity.
 * A missing route shrinks a wanted deal and worsens an unwanted one.
 * @return {number}
 */
AgreementEvaluator.prototype.ResourceSaleUtility = function(item, evaluatingPlayer, treasury, received)
{
	const stock = this.Stock(evaluatingPlayer, item.resource);
	const profile = this.ResourceProfile(item.resource);
	const from = received ? stock : Math.max(0, stock - item.quantity);
	const to = received ? stock + item.quantity : stock;
	let worth = this.RangeValue(profile.scale, profile.reference, from, to);
	if (item.resource === "food")
		worth *= this.FoodSecurity(evaluatingPlayer, stock);
	const resourcePoints = Math.round(worth);

	let pricePoints = 0;
	if (received)
	{
		if (treasury < item.totalPrice)
			pricePoints = this.ImpossibleCost;
		else
			pricePoints = Math.round(this.CashScale * Math.log(
				(this.CashReference + treasury) / (this.CashReference + treasury - item.totalPrice)));
	}
	else
		pricePoints = Math.round(this.CashMagnitude(treasury, item.totalPrice));

	let utility = received ? resourcePoints - pricePoints : pricePoints - resourcePoints;
	const legal = this.SaleLegallyOpen(item.provider, item.beneficiary);
	const physical = this.BestCommercialRoute(item.provider, item.beneficiary);
	const usable = this.BestUsableCommercialRoute(
		item.provider, item.beneficiary, this.AssumedTransit(item.provider));
	if (!legal || !physical.connected)
	{
		if (utility > 0)
			utility = Math.round(utility * 0.25);
		else
			utility -= 40;
	}
	else if (!usable.connected)
	{
		if (utility > 0)
			utility = Math.round(utility * 0.5);
		else
			utility -= 20;
	}
	else if (usable.condition < 100 && utility > 0)
		utility = Math.round(utility * (100 + usable.condition) / 200);
	return utility;
};

/**
 * Score one item from the working stock and treasury. Does not read other items.
 * @return {Object}
 */
AgreementEvaluator.prototype.ScoreItem = function(item, evaluatingPlayer, stock, treasury, burden)
{
	const received = NationSameParticipant(item.beneficiary, evaluatingPlayer);
	const row = {
		"type": item.type,
		"direction": received ? "received" : "given",
		"utility": 0,
		"hardReject": false
	};
	if (item.resource)
		row.resource = item.resource;
	if (item.amount !== undefined)
		row.amount = item.amount;
	if (item.principal !== undefined)
		row.principal = item.principal;
	if (item.debtId !== undefined)
		row.debtId = item.debtId;

	if (!NationSameParticipant(item.provider, evaluatingPlayer) && !received)
		return row;

	const foreign = NationParticipantKey(item.provider).indexOf("foreign_actor:") === 0 ||
		NationParticipantKey(item.beneficiary).indexOf("foreign_actor:") === 0;
	if (foreign && (item.type === "resource" || item.type === "military_access" ||
		item.type === "trade_access" || item.type === "transit_rights" || item.type === "resource_sale"))
		return row;

	if (item.type === "resource_sale")
	{
		row.resource = item.resource;
		row.quantity = item.quantity;
		row.totalPrice = item.totalPrice;
		row.utility = this.ResourceSaleUtility(item, evaluatingPlayer, treasury, received);
		return row;
	}

	if (item.type === "loan")
	{
		const load = burden === undefined ? this.DebtBurden(evaluatingPlayer) : burden;
		row.utility = this.LoanUtility(item, treasury, load, received);
		return row;
	}

	if (item.type === "debt_forgiveness")
	{
		let outstanding = item.amount;
		if (typeof IID_DebtLedger !== "undefined")
		{
			const ledger = Engine.QueryInterface(SYSTEM_ENTITY, IID_DebtLedger);
			const debt = ledger && ledger.Find(item.debtId);
			if (debt)
				outstanding = debt.principalOutstanding;
		}
		const relief = this.ForgivenessUtility(item.amount, outstanding);
		row.utility = received ? relief : -relief;
		return row;
	}

	if (item.type === "military_access" || item.type === "trade_access")
	{
		if (this.RightAlreadyHeld(item))
			return row;

		if (item.type === "military_access" && !received &&
			this.MutuallyHostile(item.provider, item.beneficiary))
		{
			row.utility = -this.MilitaryHostile;
			row.hardReject = true;
			return row;
		}

		if (item.type === "military_access")
		{
			if (received)
				row.utility = this.MilitaryReceive;
			else if (this.BeneficiaryOccupiesProvider(item.beneficiary, item.provider))
				row.utility = -this.MilitaryGrantOccupied;
			else
			{
				const cmpPresence = Engine.QueryInterface(SYSTEM_ENTITY, IID_ForeignMilitaryPresence);
				const inside = cmpPresence && cmpPresence.HasForeignMilitaryPresence &&
					cmpPresence.HasForeignMilitaryPresence(item.beneficiary, item.provider);
				row.utility = inside || this.SoldierCount(item.beneficiary) > 0 ?
					-this.MilitaryGrantOccupied : -this.MilitaryGrant;
			}
			return row;
		}

		row.utility = received ? this.TradeReceive : -this.TradeGrant;
		return row;
	}

	if (item.type === "transit_rights")
	{
		if (this.RightAlreadyHeld(item))
			return row;
		if (!received && this.MutuallyHostile(item.provider, item.beneficiary))
		{
			row.utility = -this.MilitaryHostile;
			row.hardReject = true;
			return row;
		}
		row.utility = received ? this.TransitBenefit(item) : this.TransitGrantCost(item);
		return row;
	}

	const amount = item.amount;
	if (item.type === "cash")
	{
		const from = received ? treasury : treasury - amount;
		const to = received ? treasury + amount : treasury;
		if (!received && treasury < amount)
		{
			row.utility = -this.ImpossibleCost;
			return row;
		}
		const span = this.CashScale * Math.log((this.CashReference + Math.max(from, to)) / (this.CashReference + Math.min(from, to)));
		row.utility = Math.round(received ? span : -span);
		return row;
	}

	const held = stock[item.resource] || 0;
	const from = received ? held : held - amount;
	const to = received ? held + amount : held;
	if (!received && held < amount)
	{
		row.utility = -this.ImpossibleCost;
		return row;
	}

	const profile = this.ResourceProfile(item.resource);
	let span = this.RangeValue(profile.scale, profile.reference, Math.min(from, to), Math.max(from, to));
	if (item.resource === "food")
		span *= this.FoodSecurity(evaluatingPlayer, held);
	row.utility = Math.round(received ? span : -span);
	return row;
};

/**
 * @return {Object}
 */
AgreementEvaluator.prototype.EvaluateItem = function(item, evaluatingPlayer)
{
	const stock = {};
	if (item && item.type === "resource")
		stock[item.resource] = this.Stock(evaluatingPlayer, item.resource);
	return this.ScoreItem(item, evaluatingPlayer, stock, this.Treasury(evaluatingPlayer));
};

AgreementEvaluator.prototype.SortItems = function(items)
{
	return items.slice().sort((left, right) =>
	{
		if (left.type < right.type)
			return -1;
		if (left.type > right.type)
			return 1;
		const leftCode = left.resource || "";
		const rightCode = right.resource || "";
		if (leftCode < rightCode)
			return -1;
		if (leftCode > rightCode)
			return 1;
		return (left.amount || left.quantity || 0) - (right.amount || right.quantity || 0);
	});
};

/**
 * Given items are scored from the current stock, then received items from what remains.
 * @return {Object}
 */
AgreementEvaluator.prototype.EvaluateProposalData = function(proposal, evaluatingPlayer)
{
	const empty = {
		"totalUtility": 0,
		"receivedUtility": 0,
		"givenUtility": 0,
		"hardReject": false,
		"decision": "reject",
		"items": []
	};
	if (!proposal)
		return empty;

	const playerKey = NationParticipantKey(evaluatingPlayer);
	const cmpPlayer = playerKey.indexOf("player:") === 0 ? QueryPlayerIDInterface(evaluatingPlayer) : null;
	const counts = cmpPlayer && cmpPlayer.GetResourceCounts() || {};
	const stock = {};
	for (const code in counts)
		stock[code] = Number.isFinite(counts[code]) && counts[code] > 0 ? counts[code] : 0;
	let treasury = this.Treasury(evaluatingPlayer);
	let burden = this.DebtBurden(evaluatingPlayer);

	const given = [];
	const received = [];
	const source = (proposal.offer || []).concat(proposal.request || []);
	for (let i = 0; i < source.length; ++i)
	{
		const item = source[i];
		if (!item)
			continue;
		if (NationSameParticipant(item.provider, evaluatingPlayer))
			given.push(item);
		else if (NationSameParticipant(item.beneficiary, evaluatingPlayer))
			received.push(item);
	}

	this.scoringProposal = proposal;
	const rows = [];
	const ordered = this.SortItems(given).concat(this.SortItems(received));
	for (let i = 0; i < ordered.length; ++i)
	{
		const item = ordered[i];
		const row = this.ScoreItem(item, evaluatingPlayer, stock, treasury, burden);
		rows.push(row);
		if (item.type === "resource" && NationSameParticipant(item.provider, evaluatingPlayer))
			stock[item.resource] = Math.max(0, (stock[item.resource] || 0) - item.amount);
		else if (item.type === "resource" && NationSameParticipant(item.beneficiary, evaluatingPlayer))
			stock[item.resource] = (stock[item.resource] || 0) + item.amount;
		else if (item.type === "cash" && NationSameParticipant(item.provider, evaluatingPlayer))
			treasury = Math.max(0, treasury - item.amount);
		else if (item.type === "cash" && NationSameParticipant(item.beneficiary, evaluatingPlayer))
			treasury += item.amount;
		else if (item.type === "loan" && NationSameParticipant(item.provider, evaluatingPlayer))
			treasury = Math.max(0, treasury - item.principal);
		else if (item.type === "loan" && NationSameParticipant(item.beneficiary, evaluatingPlayer))
		{
			treasury += item.principal;
			burden += item.principal;
		}
		else if (item.type === "debt_forgiveness" && NationSameParticipant(item.beneficiary, evaluatingPlayer))
			burden = Math.max(0, burden - item.amount);
	}

	let receivedUtility = 0;
	let givenUtility = 0;
	let hardReject = false;
	for (let i = 0; i < rows.length; ++i)
	{
		if (rows[i].hardReject)
			hardReject = true;
		if (rows[i].utility >= 0)
			receivedUtility += rows[i].utility;
		else
			givenUtility += -rows[i].utility;
	}

	const totalUtility = receivedUtility - givenUtility;
	let decision = "reject";
	if (!hardReject && totalUtility >= this.AcceptAt)
		decision = "accept";
	else if (!hardReject && totalUtility >= this.CounterAt)
		decision = "counter";

	this.scoringProposal = null;
	return {
		"totalUtility": totalUtility,
		"receivedUtility": receivedUtility,
		"givenUtility": givenUtility,
		"hardReject": hardReject,
		"decision": decision,
		"items": rows
	};
};

/**
 * @return {Object|null}
 */
AgreementEvaluator.prototype.EvaluateProposal = function(proposalId, evaluatingPlayer)
{
	const cmpAgreements = Engine.QueryInterface(SYSTEM_ENTITY, IID_AgreementManager);
	const proposal = cmpAgreements && cmpAgreements.Find(proposalId);
	if (!proposal)
		return null;
	return this.EvaluateProposalData(proposal, evaluatingPlayer);
};

Engine.RegisterSystemComponentType(IID_AgreementEvaluator, "AgreementEvaluator", AgreementEvaluator);
