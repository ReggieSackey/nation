function AgreementManager() {}

AgreementManager.prototype.Schema =
	"<a:component type='system'/><empty/>";

AgreementManager.prototype.ItemTypes = {
	"resource": true,
	"cash": true,
	"military_access": true,
	"trade_access": true
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

	return normalized;
};

/**
 * @return {Object|null} - A proposal without an id. Null when the shape is unusable.
 */
AgreementManager.prototype.Normalize = function(proposer, recipient, offer, request)
{
	if (!this.IsPlayer(proposer) || !this.IsPlayer(recipient) || proposer === recipient)
		return null;

	const normalizedOffer = this.NormalizeSide(offer, proposer, recipient);
	const normalizedRequest = this.NormalizeSide(request, recipient, proposer);
	if (!normalizedOffer || !normalizedRequest || (!normalizedOffer.length && !normalizedRequest.length))
		return null;

	return {
		"proposer": proposer,
		"recipient": recipient,
		"offer": normalizedOffer,
		"request": normalizedRequest
	};
};

/**
 * Outgoing totals per provider. Incoming totals are applied only after every outgoing total fits.
 */
AgreementManager.prototype.Duties = function(proposal)
{
	const resourcesOut = {};
	const resourcesIn = {};
	const cashOut = {};
	const cashIn = {};
	const military = [];
	const trade = [];
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
			cashOut[item.provider] = item.amount;
			cashIn[item.beneficiary] = item.amount;
		}
		else if (item.type === "military_access")
			military.push({ "from": item.beneficiary, "to": item.provider });
		else if (item.type === "trade_access")
			trade.push({ "from": item.beneficiary, "to": item.provider });
	}

	military.sort((a, b) => a.from - b.from || a.to - b.to);
	trade.sort((a, b) => a.from - b.from || a.to - b.to);
	return {
		"resourcesOut": resourcesOut,
		"resourcesIn": resourcesIn,
		"cashOut": cashOut,
		"cashIn": cashIn,
		"military": military,
		"trade": trade
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

	if (this.SortedIds(duties.cashOut).length || this.SortedIds(duties.cashIn).length)
	{
		const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
		if (!cmpFinance)
			return false;
		const payersCash = this.SortedIds(duties.cashOut);
		for (let i = 0; i < payersCash.length; ++i)
			if (!cmpFinance.CanAfford(payersCash[i], duties.cashOut[payersCash[i]]))
				return false;
	}

	if (duties.military.length && !Engine.QueryInterface(SYSTEM_ENTITY, IID_DiplomaticAccess))
		return false;
	if (duties.trade.length && !Engine.QueryInterface(SYSTEM_ENTITY, IID_TradeAccess))
		return false;
	return true;
};

AgreementManager.prototype.Snapshot = function(playerIds)
{
	const resources = {};
	const treasury = {};
	const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
	for (let i = 0; i < playerIds.length; ++i)
	{
		const cmpPlayer = QueryPlayerIDInterface(playerIds[i]);
		resources[playerIds[i]] = clone(cmpPlayer.GetResourceCounts());
		treasury[playerIds[i]] = cmpFinance ? cmpFinance.GetTreasury(playerIds[i]) : 0;
	}
	return {
		"resources": resources,
		"treasury": treasury
	};
};

AgreementManager.prototype.Restore = function(snapshot)
{
	const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
	const playerIds = this.SortedIds(snapshot.resources);
	for (let i = 0; i < playerIds.length; ++i)
	{
		const playerId = playerIds[i];
		QueryPlayerIDInterface(playerId).SetResourceCounts(snapshot.resources[playerId]);
		if (!cmpFinance)
			continue;
		const now = cmpFinance.GetTreasury(playerId);
		const target = snapshot.treasury[playerId];
		if (now > target)
			cmpFinance.Spend(playerId, now - target);
		else if (target > now)
			cmpFinance.AddFunds(playerId, target - now);
	}
};

/**
 * Subtract every outgoing total, then add every incoming total, then grant rights.
 * A failed write restores the resource and treasury snapshot. Rights run last.
 * @return {boolean}
 */
AgreementManager.prototype.Execute = function(proposal)
{
	const duties = this.Duties(proposal);
	const involved = {};
	for (const group of [duties.resourcesOut, duties.resourcesIn, duties.cashOut, duties.cashIn])
	{
		const ids = this.SortedIds(group);
		for (let i = 0; i < ids.length; ++i)
			involved[ids[i]] = true;
	}
	const playerIds = this.SortedIds(involved);
	const snapshot = this.Snapshot(playerIds);

	const payers = this.SortedIds(duties.resourcesOut);
	for (let i = 0; i < payers.length; ++i)
	{
		const codes = Object.keys(duties.resourcesOut[payers[i]]).sort();
		for (let c = 0; c < codes.length; ++c)
			if (!QueryPlayerIDInterface(payers[i]).TrySubtractResources({
				[codes[c]]: duties.resourcesOut[payers[i]][codes[c]]
			}))
			{
				this.Restore(snapshot);
				return false;
			}
	}

	const receivers = this.SortedIds(duties.resourcesIn);
	for (let i = 0; i < receivers.length; ++i)
	{
		const codes = Object.keys(duties.resourcesIn[receivers[i]]).sort();
		for (let c = 0; c < codes.length; ++c)
			QueryPlayerIDInterface(receivers[i]).AddResource(codes[c], duties.resourcesIn[receivers[i]][codes[c]]);
	}

	const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
	const cashPayers = this.SortedIds(duties.cashOut);
	for (let i = 0; i < cashPayers.length; ++i)
		if (!cmpFinance.Spend(cashPayers[i], duties.cashOut[cashPayers[i]]))
		{
			this.Restore(snapshot);
			return false;
		}

	const cashReceivers = this.SortedIds(duties.cashIn);
	for (let i = 0; i < cashReceivers.length; ++i)
		if (!cmpFinance.AddFunds(cashReceivers[i], duties.cashIn[cashReceivers[i]]))
		{
			this.Restore(snapshot);
			return false;
		}

	const cmpAccess = Engine.QueryInterface(SYSTEM_ENTITY, IID_DiplomaticAccess);
	for (let i = 0; i < duties.military.length; ++i)
		if (!cmpAccess.GrantMilitaryAccess(duties.military[i].from, duties.military[i].to))
		{
			this.Restore(snapshot);
			return false;
		}

	const cmpTrade = Engine.QueryInterface(SYSTEM_ENTITY, IID_TradeAccess);
	for (let i = 0; i < duties.trade.length; ++i)
		if (!cmpTrade.GrantTrade(duties.trade[i].from, duties.trade[i].to))
		{
			this.Restore(snapshot);
			return false;
		}

	return true;
};

/**
 * Store a pending proposal. Nothing is spent.
 * @return {number} - Proposal id, or 0 when the proposal is refused.
 */
AgreementManager.prototype.Propose = function(proposer, recipient, offer, request)
{
	const proposal = this.Normalize(proposer, recipient, offer, request);
	if (!proposal || !this.CanExecute(proposal))
		return 0;

	proposal.id = this.nextId++;
	proposal.status = "pending";
	this.proposals.push(proposal);
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
	if (!proposal || proposal.status !== "pending" || proposal.recipient !== player)
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
	if (player !== proposal.proposer && player !== proposal.recipient)
		return false;
	proposal.status = "rejected";
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
