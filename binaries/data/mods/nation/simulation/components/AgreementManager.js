function AgreementManager() {}

AgreementManager.prototype.Schema =
	"<a:component type='system'/><empty/>";

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

AgreementManager.prototype.ItemTypes = {
	"resource": true,
	"cash": true,
	"military_access": true,
	"trade_access": true,
	"transit_rights": true,
	"loan": true,
	"debt_forgiveness": true,
	"commodity_sale": true
};

AgreementManager.prototype.Init = function()
{
	this.nextId = 1;
	this.proposals = [];
};

/**
 * Positive integer. Rejects NaN, infinities, floats, and numeric strings.
 * @return {boolean}
 */
AgreementManager.prototype.IsPositiveInt = function(value)
{
	return typeof value === "number" && Number.isInteger(value) && value > 0;
};

/**
 * @return {boolean}
 */
AgreementManager.prototype.IsPlayer = function(playerId)
{
	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	const numPlayers = cmpPlayerManager ? cmpPlayerManager.GetNumPlayers() : 0;
	return Number.isInteger(playerId) && playerId > 0 && playerId < numPlayers &&
		!!QueryPlayerIDInterface(playerId);
};

AgreementManager.prototype.ForeignActors = function()
{
	if (typeof IID_ForeignActorManager === "undefined")
		return null;
	return Engine.QueryInterface(SYSTEM_ENTITY, IID_ForeignActorManager);
};

AgreementManager.prototype.Ledger = function()
{
	if (typeof IID_DebtLedger === "undefined")
		return null;
	return Engine.QueryInterface(SYSTEM_ENTITY, IID_DebtLedger);
};

/**
 * @return {boolean}
 */
AgreementManager.prototype.KnownCommodity = function(code)
{
	if (typeof IID_CommodityInventory === "undefined")
		return false;
	const cmpInventory = Engine.QueryInterface(SYSTEM_ENTITY, IID_CommodityInventory);
	return !!(cmpInventory && cmpInventory.Known(code));
};

/**
 * A registered off-map actor. A plain object with the right shape is not enough.
 * @return {boolean}
 */
AgreementManager.prototype.IsForeign = function(participant)
{
	const actors = this.ForeignActors();
	return !!(actors && participant && participant.type === "foreign_actor" && actors.Get(participant.id));
};

/**
 * @return {boolean}
 */
AgreementManager.prototype.IsParticipant = function(participant)
{
	return this.IsPlayer(participant) || this.IsForeign(participant);
};

/**
 * Player treasuries stay in GovernmentFinance. Actor treasuries stay on the actor.
 */
AgreementManager.prototype.TreasuryOf = function(participant)
{
	if (this.IsPlayer(participant))
	{
		const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
		return cmpFinance ? cmpFinance.GetTreasury(participant) : 0;
	}
	const actors = this.ForeignActors();
	return actors && participant ? actors.GetTreasury(participant.id) : 0;
};

AgreementManager.prototype.CanAfford = function(participant, amount)
{
	if (this.IsPlayer(participant))
	{
		const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
		return !!(cmpFinance && cmpFinance.CanAfford(participant, amount));
	}
	const actors = this.ForeignActors();
	return !!(actors && participant && actors.CanAfford(participant.id, amount));
};

AgreementManager.prototype.Spend = function(participant, amount)
{
	if (this.IsPlayer(participant))
	{
		const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
		return !!(cmpFinance && cmpFinance.Spend(participant, amount));
	}
	const actors = this.ForeignActors();
	return !!(actors && participant && actors.Spend(participant.id, amount));
};

AgreementManager.prototype.AddMoney = function(participant, amount)
{
	if (this.IsPlayer(participant))
	{
		const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
		return !!(cmpFinance && cmpFinance.AddFunds(participant, amount));
	}
	const actors = this.ForeignActors();
	return !!(actors && participant && actors.AddFunds(participant.id, amount));
};

/**
 * Registered Player resource codes. No resource is special-cased.
 * @return {string[]}
 */
AgreementManager.prototype.ResourceCodes = function()
{
	return typeof Resources !== "undefined" && Resources.GetCodes ? Resources.GetCodes() : [];
};

/**
 * @return {string}
 */
AgreementManager.prototype.ResourceName = function(code)
{
	if (typeof Resources === "undefined" || !Resources.GetResource)
		return code;
	const resource = Resources.GetResource(code);
	return resource && resource.name || code;
};

/**
 * Duplicate resource and cash rows on one side become one total.
 * Duplicate rights become one grant. Totals are what validation spends.
 * @return {Object|null}
 */
AgreementManager.prototype.NormalizeSide = function(items, provider, beneficiary)
{
	if (items === undefined || items === null)
		items = [];
	if (!Array.isArray(items))
		return null;

	const resources = {};
	const rights = {};
	const loans = [];
	const forgiveness = [];
	const sales = [];
	const forgivenessIds = {};
	let cash = 0;
	let sawCash = false;

	for (let i = 0; i < items.length; ++i)
	{
		const item = items[i];
		if (!item || typeof item.type !== "string" || !this.ItemTypes[item.type])
			return null;

		if (item.type === "resource")
		{
			if (typeof item.resource !== "string" || this.ResourceCodes().indexOf(item.resource) === -1 ||
				!this.IsPositiveInt(item.amount))
				return null;
			resources[item.resource] = (resources[item.resource] || 0) + item.amount;
			if (!this.IsPositiveInt(resources[item.resource]))
				return null;
		}
		else if (item.type === "cash")
		{
			if (!this.IsPositiveInt(item.amount))
				return null;
			cash += item.amount;
			if (!this.IsPositiveInt(cash))
				return null;
			sawCash = true;
		}
		else if (item.type === "loan")
		{
			// paymentInterval is not part of the item. The ledger owns that clock.
			if (item.amount !== undefined || !this.IsPositiveInt(item.principal) ||
				!Number.isInteger(item.interestRateBps) || item.interestRateBps < 0 || item.interestRateBps > 10000 ||
				!this.IsPositiveInt(item.installments) || item.installments > 60 ||
				item.principal < item.installments ||
				!Number.isInteger(item.graceIntervals) || item.graceIntervals < 0 || item.graceIntervals > 24)
				return null;
			loans.push({
				"type": "loan",
				"principal": item.principal,
				"interestRateBps": item.interestRateBps,
				"installments": item.installments,
				"graceIntervals": item.graceIntervals,
				"provider": provider,
				"beneficiary": beneficiary
			});
		}
		else if (item.type === "debt_forgiveness")
		{
			if (!this.IsPositiveInt(item.debtId) || !this.IsPositiveInt(item.amount))
				return null;
			if (forgivenessIds[item.debtId])
				return null;
			forgivenessIds[item.debtId] = true;
			forgiveness.push({
				"type": "debt_forgiveness",
				"debtId": item.debtId,
				"amount": item.amount,
				"provider": provider,
				"beneficiary": beneficiary
			});
		}
		else if (item.type === "commodity_sale")
		{
			// Quantity may exceed stock. Payment is not collected at signing.
			if (!this.KnownCommodity(item.commodity) || !this.IsPositiveInt(item.quantity) ||
				!this.IsPositiveInt(item.totalPrice))
				return null;
			sales.push({
				"type": "commodity_sale",
				"commodity": item.commodity,
				"quantity": item.quantity,
				"totalPrice": item.totalPrice,
				"provider": provider,
				"beneficiary": beneficiary
			});
		}
		else if (item.amount !== undefined)
			return null;
		else
			rights[item.type] = true;
	}

	const normalized = [];
	const codes = Object.keys(resources).sort();
	for (let i = 0; i < codes.length; ++i)
		normalized.push({
			"type": "resource",
			"resource": codes[i],
			"amount": resources[codes[i]],
			"provider": provider,
			"beneficiary": beneficiary
		});

	if (sawCash)
		normalized.push({
			"type": "cash",
			"amount": cash,
			"provider": provider,
			"beneficiary": beneficiary
		});

	const rightTypes = Object.keys(rights).sort();
	for (let i = 0; i < rightTypes.length; ++i)
		normalized.push({
			"type": rightTypes[i],
			"provider": provider,
			"beneficiary": beneficiary
		});

	loans.sort((left, right) => left.principal - right.principal ||
		left.interestRateBps - right.interestRateBps ||
		left.installments - right.installments ||
		left.graceIntervals - right.graceIntervals);
	for (let i = 0; i < loans.length; ++i)
		normalized.push(loans[i]);

	forgiveness.sort((left, right) => left.debtId - right.debtId);
	for (let i = 0; i < forgiveness.length; ++i)
		normalized.push(forgiveness[i]);

	sales.sort((left, right) =>
	{
		if (left.commodity < right.commodity)
			return -1;
		if (left.commodity > right.commodity)
			return 1;
		return left.quantity - right.quantity || left.totalPrice - right.totalPrice;
	});
	for (let i = 0; i < sales.length; ++i)
		normalized.push(sales[i]);

	return normalized;
};

/**
 * @return {Object|null} - A proposal without an id. Null when the shape is unusable.
 */
AgreementManager.prototype.Normalize = function(proposer, recipient, offer, request)
{
	if (!this.IsParticipant(proposer) || !this.IsParticipant(recipient) || NationSameParticipant(proposer, recipient))
		return null;

	const normalizedOffer = this.NormalizeSide(offer, proposer, recipient);
	const normalizedRequest = this.NormalizeSide(request, recipient, proposer);
	if (!normalizedOffer || !normalizedRequest || (!normalizedOffer.length && !normalizedRequest.length))
		return null;

	if (this.IsForeign(proposer) || this.IsForeign(recipient))
	{
		const items = normalizedOffer.concat(normalizedRequest);
		for (let i = 0; i < items.length; ++i)
			if (items[i].type === "resource" || items[i].type === "military_access" ||
				items[i].type === "trade_access" || items[i].type === "transit_rights" ||
				items[i].type === "commodity_sale")
				return null;
	}

	return {
		"proposer": proposer,
		"recipient": recipient,
		"offer": normalizedOffer,
		"request": normalizedRequest
	};
};

AgreementManager.prototype.AddMoneyDuty = function(map, participant, amount)
{
	const key = NationParticipantKey(participant);
	if (!key)
		return;
	if (!map[key])
		map[key] = {
			"participant": typeof participant === "number" ? participant : {
				"type": participant.type,
				"id": participant.id
			},
			"amount": 0
		};
	map[key].amount += amount;
};

/**
 * Outgoing totals per provider. Cash and loan principal share one treasury total.
 * Incoming totals are applied only after every outgoing total fits.
 */
AgreementManager.prototype.Duties = function(proposal)
{
	const resourcesOut = {};
	const resourcesIn = {};
	const moneyOut = {};
	const moneyIn = {};
	const military = [];
	const trade = [];
	const transit = [];
	const loans = [];
	const forgiveness = [];
	const sales = [];
	const items = proposal.offer.concat(proposal.request);

	for (let i = 0; i < items.length; ++i)
	{
		const item = items[i];
		if (item.type === "resource")
		{
			if (!resourcesOut[item.provider])
				resourcesOut[item.provider] = {};
			if (!resourcesIn[item.beneficiary])
				resourcesIn[item.beneficiary] = {};
			resourcesOut[item.provider][item.resource] = item.amount;
			resourcesIn[item.beneficiary][item.resource] = item.amount;
		}
		else if (item.type === "cash")
		{
			this.AddMoneyDuty(moneyOut, item.provider, item.amount);
			this.AddMoneyDuty(moneyIn, item.beneficiary, item.amount);
		}
		else if (item.type === "loan")
		{
			this.AddMoneyDuty(moneyOut, item.provider, item.principal);
			this.AddMoneyDuty(moneyIn, item.beneficiary, item.principal);
			loans.push(item);
		}
		else if (item.type === "debt_forgiveness")
			forgiveness.push(item);
		else if (item.type === "commodity_sale")
			sales.push(item);
		else if (item.type === "military_access")
			military.push({ "from": item.beneficiary, "to": item.provider });
		else if (item.type === "trade_access")
			trade.push({ "from": item.beneficiary, "to": item.provider });
		else if (item.type === "transit_rights")
			transit.push({ "from": item.beneficiary, "to": item.provider });
	}

	military.sort((a, b) => a.from - b.from || a.to - b.to);
	trade.sort((a, b) => a.from - b.from || a.to - b.to);
	transit.sort((a, b) => a.from - b.from || a.to - b.to);
	loans.sort((left, right) =>
	{
		const leftKey = NationParticipantKey(left.provider);
		const rightKey = NationParticipantKey(right.provider);
		if (leftKey < rightKey)
			return -1;
		if (leftKey > rightKey)
			return 1;
		return left.principal - right.principal || left.interestRateBps - right.interestRateBps ||
			left.installments - right.installments || left.graceIntervals - right.graceIntervals;
	});
	forgiveness.sort((left, right) => left.debtId - right.debtId);
	sales.sort((left, right) =>
	{
		if (left.commodity < right.commodity)
			return -1;
		if (left.commodity > right.commodity)
			return 1;
		return left.quantity - right.quantity || left.totalPrice - right.totalPrice ||
			left.provider - right.provider || left.beneficiary - right.beneficiary;
	});
	return {
		"resourcesOut": resourcesOut,
		"resourcesIn": resourcesIn,
		"moneyOut": moneyOut,
		"moneyIn": moneyIn,
		"military": military,
		"trade": trade,
		"transit": transit,
		"loans": loans,
		"forgiveness": forgiveness,
		"sales": sales
	};
};

AgreementManager.prototype.SortedIds = function(map)
{
	return Object.keys(map).map(id => +id).sort((a, b) => a - b);
};

/**
 * @return {boolean} - True when every immediate obligation can be paid now.
 */
AgreementManager.prototype.CanExecute = function(proposal)
{
	const duties = this.Duties(proposal);
	const payers = this.SortedIds(duties.resourcesOut);
	for (let i = 0; i < payers.length; ++i)
	{
		const cmpPlayer = QueryPlayerIDInterface(payers[i]);
		const counts = cmpPlayer && cmpPlayer.GetResourceCounts();
		if (!counts)
			return false;
		const codes = Object.keys(duties.resourcesOut[payers[i]]).sort();
		for (let c = 0; c < codes.length; ++c)
			if (counts[codes[c]] === undefined || counts[codes[c]] < duties.resourcesOut[payers[i]][codes[c]])
				return false;
	}

	const moneyPayers = Object.keys(duties.moneyOut).sort();
	for (let i = 0; i < moneyPayers.length; ++i)
		if (!this.CanAfford(duties.moneyOut[moneyPayers[i]].participant, duties.moneyOut[moneyPayers[i]].amount))
			return false;

	if (duties.loans.length || duties.forgiveness.length)
	{
		const ledger = this.Ledger();
		if (!ledger)
			return false;
		const claimed = {};
		for (let i = 0; i < duties.forgiveness.length; ++i)
		{
			const item = duties.forgiveness[i];
			const debt = ledger.Find(item.debtId);
			if (!debt || debt.status !== "active" ||
				!NationSameParticipant(debt.creditor, item.provider) ||
				!NationSameParticipant(debt.debtor, item.beneficiary))
				return false;
			claimed[item.debtId] = (claimed[item.debtId] || 0) + item.amount;
			if (claimed[item.debtId] > debt.principalOutstanding)
				return false;
		}
	}

	if (duties.military.length && !Engine.QueryInterface(SYSTEM_ENTITY, IID_DiplomaticAccess))
		return false;
	if (duties.trade.length && !Engine.QueryInterface(SYSTEM_ENTITY, IID_TradeAccess))
		return false;
	if (duties.transit.length && (typeof IID_TransitAccess === "undefined" ||
		!Engine.QueryInterface(SYSTEM_ENTITY, IID_TransitAccess)))
		return false;
	if (duties.sales.length && (typeof IID_TradeContractManager === "undefined" ||
		!Engine.QueryInterface(SYSTEM_ENTITY, IID_TradeContractManager)))
		return false;
	return true;
};

AgreementManager.prototype.Snapshot = function(parties)
{
	const resources = {};
	const treasury = {};
	const keys = Object.keys(parties).sort();
	for (let i = 0; i < keys.length; ++i)
	{
		const participant = parties[keys[i]];
		if (this.IsPlayer(participant))
		{
			const cmpPlayer = QueryPlayerIDInterface(participant);
			resources[participant] = clone(cmpPlayer.GetResourceCounts());
		}
		treasury[keys[i]] = this.TreasuryOf(participant);
	}
	return {
		"resources": resources,
		"treasury": treasury,
		"parties": parties
	};
};

AgreementManager.prototype.Restore = function(snapshot)
{
	const playerIds = this.SortedIds(snapshot.resources);
	for (let i = 0; i < playerIds.length; ++i)
		QueryPlayerIDInterface(playerIds[i]).SetResourceCounts(snapshot.resources[playerIds[i]]);

	const keys = Object.keys(snapshot.treasury).sort();
	for (let i = 0; i < keys.length; ++i)
	{
		const participant = snapshot.parties[keys[i]];
		const now = this.TreasuryOf(participant);
		const target = snapshot.treasury[keys[i]];
		if (now > target)
			this.Spend(participant, now - target);
		else if (target > now)
			this.AddMoney(participant, target - now);
	}
};

/**
 * Subtract every outgoing total, pay principal, create debt, forgive, then grant rights.
 * A failed write restores resources, treasuries, and the debt ledger. Rights run last.
 * @return {boolean}
 */
AgreementManager.prototype.Execute = function(proposal)
{
	const duties = this.Duties(proposal);
	const parties = {};
	const remember = participant =>
	{
		const key = NationParticipantKey(participant);
		if (!key || parties[key])
			return;
		parties[key] = typeof participant === "number" ? participant : {
			"type": participant.type,
			"id": participant.id
		};
	};
	const resourceIds = this.SortedIds(duties.resourcesOut).concat(this.SortedIds(duties.resourcesIn));
	for (let i = 0; i < resourceIds.length; ++i)
		remember(resourceIds[i]);
	const moneyKeys = Object.keys(duties.moneyOut).concat(Object.keys(duties.moneyIn));
	for (let i = 0; i < moneyKeys.length; ++i)
	{
		const row = duties.moneyOut[moneyKeys[i]] || duties.moneyIn[moneyKeys[i]];
		if (row)
			remember(row.participant);
	}

	const ledger = this.Ledger();
	const debtBefore = ledger ? ledger.Capture() : null;
	const createdTimers = [];
	const createdContracts = [];
	const snapshot = this.Snapshot(parties);
	const fail = () =>
	{
		const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
		if (cmpTimer)
			for (let i = 0; i < createdTimers.length; ++i)
				cmpTimer.CancelTimer(createdTimers[i]);
		if (ledger && debtBefore)
			ledger.Restore(debtBefore);
		if (typeof IID_TradeContractManager !== "undefined")
		{
			const cmpContracts = Engine.QueryInterface(SYSTEM_ENTITY, IID_TradeContractManager);
			if (cmpContracts)
				for (let i = 0; i < createdContracts.length; ++i)
					cmpContracts.Drop(createdContracts[i]);
		}
		this.Restore(snapshot);
		return false;
	};

	const payers = this.SortedIds(duties.resourcesOut);
	for (let i = 0; i < payers.length; ++i)
	{
		const codes = Object.keys(duties.resourcesOut[payers[i]]).sort();
		for (let c = 0; c < codes.length; ++c)
			if (!QueryPlayerIDInterface(payers[i]).TrySubtractResources({
				[codes[c]]: duties.resourcesOut[payers[i]][codes[c]]
			}))
				return fail();
	}

	const receivers = this.SortedIds(duties.resourcesIn);
	for (let i = 0; i < receivers.length; ++i)
	{
		const codes = Object.keys(duties.resourcesIn[receivers[i]]).sort();
		for (let c = 0; c < codes.length; ++c)
			QueryPlayerIDInterface(receivers[i]).AddResource(codes[c], duties.resourcesIn[receivers[i]][codes[c]]);
	}

	const moneyPayers = Object.keys(duties.moneyOut).sort();
	for (let i = 0; i < moneyPayers.length; ++i)
		if (!this.Spend(duties.moneyOut[moneyPayers[i]].participant, duties.moneyOut[moneyPayers[i]].amount))
			return fail();

	const moneyReceivers = Object.keys(duties.moneyIn).sort();
	for (let i = 0; i < moneyReceivers.length; ++i)
		if (!this.AddMoney(duties.moneyIn[moneyReceivers[i]].participant, duties.moneyIn[moneyReceivers[i]].amount))
			return fail();

	for (let i = 0; i < duties.loans.length; ++i)
	{
		const item = duties.loans[i];
		const debtId = ledger.Create(item.provider, item.beneficiary, {
			"principal": item.principal,
			"interestRateBps": item.interestRateBps,
			"installments": item.installments,
			"graceIntervals": item.graceIntervals
		});
		if (!debtId)
			return fail();
		const debt = ledger.Find(debtId);
		if (debt && debt.timer)
			createdTimers.push(debt.timer);
	}

	for (let i = 0; i < duties.forgiveness.length; ++i)
	{
		const item = duties.forgiveness[i];
		if (!ledger.Forgive(item.provider, item.beneficiary, item.debtId, item.amount))
			return fail();
	}

	const cmpAccess = Engine.QueryInterface(SYSTEM_ENTITY, IID_DiplomaticAccess);
	for (let i = 0; i < duties.military.length; ++i)
		if (!cmpAccess.GrantMilitaryAccess(duties.military[i].from, duties.military[i].to))
			return fail();

	const cmpTrade = Engine.QueryInterface(SYSTEM_ENTITY, IID_TradeAccess);
	for (let i = 0; i < duties.trade.length; ++i)
		if (!cmpTrade.GrantTrade(duties.trade[i].from, duties.trade[i].to))
			return fail();

	const cmpTransit = typeof IID_TransitAccess !== "undefined" &&
		Engine.QueryInterface(SYSTEM_ENTITY, IID_TransitAccess);
	const grantedTransit = [];
	for (let i = 0; i < duties.transit.length; ++i)
	{
		const grant = duties.transit[i];
		if (!cmpTransit || !cmpTransit.GrantTransit(grant.from, grant.to))
		{
			if (cmpTransit)
				for (let g = 0; g < grantedTransit.length; ++g)
					cmpTransit.RevokeTransit(grantedTransit[g].from, grantedTransit[g].to);
			return fail();
		}
		grantedTransit.push(grant);
	}

	if (duties.sales.length)
	{
		const cmpContracts = Engine.QueryInterface(SYSTEM_ENTITY, IID_TradeContractManager);
		for (let i = 0; i < duties.sales.length; ++i)
		{
			const contractId = cmpContracts.Create(proposal.id, duties.sales[i]);
			if (!contractId)
				return fail();
			createdContracts.push(contractId);
		}
	}

	return true;
};

/**
 * Store a pending proposal. Nothing is spent.
 * @return {number} - Proposal id, or 0 when the proposal is refused.
 */
AgreementManager.prototype.Propose = function(proposer, recipient, offer, request, parentProposal)
{
	const proposal = this.Normalize(proposer, recipient, offer, request);
	if (!proposal || !this.CanExecute(proposal))
		return 0;

	proposal.id = this.nextId++;
	proposal.status = "pending";
	if (this.IsPositiveInt(parentProposal) && this.Find(parentProposal))
		proposal.parentProposal = parentProposal;
	this.proposals.push(proposal);
	if (typeof IID_AgreementAI !== "undefined")
	{
		const cmpAI = Engine.QueryInterface(SYSTEM_ENTITY, IID_AgreementAI);
		if (cmpAI)
			cmpAI.NoticeProposal(proposal.id);
	}
	return proposal.id;
};

AgreementManager.prototype.Find = function(id)
{
	if (!this.IsPositiveInt(id))
		return null;
	for (let i = 0; i < this.proposals.length; ++i)
		if (this.proposals[i].id === id)
			return this.proposals[i];
	return null;
};

/**
 * Revalidate, then execute. A failed revalidation marks the proposal invalidated and writes nothing.
 * @return {boolean}
 */
AgreementManager.prototype.Accept = function(player, id)
{
	const proposal = this.Find(id);
	if (!proposal || proposal.status !== "pending" || !NationSameParticipant(proposal.recipient, player))
		return false;

	if (!this.CanExecute(proposal) || !this.Execute(proposal))
	{
		proposal.status = "invalidated";
		return false;
	}

	proposal.status = "accepted";
	return true;
};

/**
 * @return {boolean}
 */
AgreementManager.prototype.Reject = function(player, id)
{
	const proposal = this.Find(id);
	if (!proposal || proposal.status !== "pending")
		return false;
	if (!NationSameParticipant(player, proposal.proposer) && !NationSameParticipant(player, proposal.recipient))
		return false;
	proposal.status = "rejected";
	return true;
};

/**
 * The recipient answered with a new proposal. The original can no longer execute.
 * @return {boolean}
 */
AgreementManager.prototype.MarkCountered = function(player, id)
{
	const proposal = this.Find(id);
	if (!proposal || proposal.status !== "pending" || !NationSameParticipant(proposal.recipient, player))
		return false;
	proposal.status = "countered";
	return true;
};

/**
 * Structured proposals for the session. No display sentences are stored.
 * @return {Object[]}
 */
AgreementManager.prototype.GetProposals = function()
{
	return clone(this.proposals);
};

/**
 * Resource codes and names for the negotiation screen.
 * @return {Object[]}
 */
AgreementManager.prototype.GetResourceChoices = function()
{
	const codes = this.ResourceCodes();
	const choices = [];
	for (let i = 0; i < codes.length; ++i)
		choices.push({
			"code": codes[i],
			"name": this.ResourceName(codes[i])
		});
	return choices;
};

Engine.RegisterSystemComponentType(IID_AgreementManager, "AgreementManager", AgreementManager);

/**
 * Commands.js creates g_Commands while helpers load.
 * The lookup happens when the command arrives, including after a loaded game.
 */
function RegisterAgreementCommands()
{
	if (typeof g_Commands === "undefined")
		return;

	g_Commands["nation-propose-agreement"] = function(player, cmd)
	{
		const cmpAgreements = Engine.QueryInterface(SYSTEM_ENTITY, IID_AgreementManager);
		if (!cmpAgreements || !cmd)
			return;
		cmpAgreements.Propose(player, cmd.recipient, cmd.offer, cmd.request);
	};

	g_Commands["nation-accept-agreement"] = function(player, cmd)
	{
		const cmpAgreements = Engine.QueryInterface(SYSTEM_ENTITY, IID_AgreementManager);
		if (!cmpAgreements || !cmd)
			return;
		cmpAgreements.Accept(player, cmd.id);
	};

	g_Commands["nation-reject-agreement"] = function(player, cmd)
	{
		const cmpAgreements = Engine.QueryInterface(SYSTEM_ENTITY, IID_AgreementManager);
		if (!cmpAgreements || !cmd)
			return;
		cmpAgreements.Reject(player, cmd.id);
	};
}

RegisterAgreementCommands();

/**
 * GetSimulationState has no mod hook. Attach proposals and treasury for the negotiation screen.
 */
function AttachAgreementsToSimulationState()
{
	if (typeof GuiInterface === "undefined" || !GuiInterface.prototype.GetSimulationState)
		return;
	if (GuiInterface.prototype.GetSimulationState.nationAgreementWrapped)
		return;

	const original = GuiInterface.prototype.GetSimulationState;
	const wrapped = function()
	{
		const state = original.apply(this, arguments);
		if (!state || !state.players)
			return state;
		const cmpAgreements = Engine.QueryInterface(SYSTEM_ENTITY, IID_AgreementManager);
		const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
		if (cmpAgreements)
		{
			state.nationAgreements = cmpAgreements.GetProposals();
			state.nationAgreementResources = cmpAgreements.GetResourceChoices();
		}
		if (cmpFinance)
			for (let playerId = 1; playerId < state.players.length; ++playerId)
				state.players[playerId].nationTreasury = cmpFinance.GetTreasury(playerId);
		const cmpInventory = typeof IID_CommodityInventory !== "undefined" &&
			Engine.QueryInterface(SYSTEM_ENTITY, IID_CommodityInventory);
		const cmpContracts = typeof IID_TradeContractManager !== "undefined" &&
			Engine.QueryInterface(SYSTEM_ENTITY, IID_TradeContractManager);
		if (cmpInventory)
		{
			state.nationCommodities = cmpInventory.Catalog();
			for (let playerId = 1; playerId < state.players.length; ++playerId)
				state.players[playerId].nationCommodityStock = {};
			const catalog = state.nationCommodities;
			for (let playerId = 1; playerId < state.players.length; ++playerId)
				for (let i = 0; i < catalog.length; ++i)
					state.players[playerId].nationCommodityStock[catalog[i].code] =
						cmpInventory.GetStock(playerId, catalog[i].code);
		}
		if (cmpContracts)
			state.nationTradeContracts = cmpContracts.GetContracts();
		return state;
	};
	wrapped.nationAgreementWrapped = true;
	if (original.nationFoodWrapped)
		wrapped.nationFoodWrapped = true;
	if (original.nationFoodImportWrapped)
		wrapped.nationFoodImportWrapped = true;
	if (original.nationDiscontentWrapped)
		wrapped.nationDiscontentWrapped = true;
	if (original.nationRebellionWrapped)
		wrapped.nationRebellionWrapped = true;
	GuiInterface.prototype.GetSimulationState = wrapped;
}

AttachAgreementsToSimulationState();
