function AgreementAI() {}

AgreementAI.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * One simulation second. The same proposal is answered once.
 */
AgreementAI.prototype.ResponseDelay = 1000;

/**
 * Extra cash is requested in these steps. Resource parcels are one fixed chunk,
 * then the remainder, not a search of every quantity.
 */
AgreementAI.prototype.CashStep = 10000;
AgreementAI.prototype.ResourceParcel = 100;

AgreementAI.prototype.Init = function()
{
	// proposal id -> timer id. Answered ids are not scheduled again.
	this.timers = {};
	this.answered = {};
	this.responders = [];
};

AgreementAI.prototype.OnInitGame = function()
{
	const settings = typeof InitAttributes !== "undefined" && InitAttributes.settings;
	const listed = settings && settings.AgreementResponders;
	if (!Array.isArray(listed))
		return;

	const responders = [];
	for (let i = 0; i < listed.length; ++i)
		if (Number.isInteger(listed[i]) && listed[i] > 0 && responders.indexOf(listed[i]) === -1)
			responders.push(listed[i]);
	responders.sort((left, right) => left - right);
	this.responders = responders;
};

/**
 * Listed responders and Petra-marked players. Rebels are not negotiators.
 * A missing list still answers IsAI players, so an off-map actor does not need Petra.
 * @return {boolean}
 */
AgreementAI.prototype.ShouldRespond = function(playerId)
{
	const cmpRebellion = typeof IID_RebellionManager !== "undefined" &&
		Engine.QueryInterface(SYSTEM_ENTITY, IID_RebellionManager);
	if (cmpRebellion && cmpRebellion.GetRebelPlayer && cmpRebellion.GetRebelPlayer() === playerId)
		return false;

	if (this.responders.indexOf(playerId) !== -1)
		return true;

	const cmpPlayer = QueryPlayerIDInterface(playerId);
	return !!(cmpPlayer && cmpPlayer.IsAI && cmpPlayer.IsAI());
};

/**
 * Schedule one answer. A second notice for the same id does nothing.
 */
AgreementAI.prototype.NoticeProposal = function(proposalId)
{
	if (!Number.isInteger(proposalId) || proposalId <= 0)
		return;
	if (this.answered[proposalId] || this.timers[proposalId])
		return;

	const cmpAgreements = Engine.QueryInterface(SYSTEM_ENTITY, IID_AgreementManager);
	const proposal = cmpAgreements && cmpAgreements.Find(proposalId);
	if (!proposal || proposal.status !== "pending" || !this.ShouldRespond(proposal.recipient))
		return;

	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (!cmpTimer)
	{
		this.Respond(proposalId);
		return;
	}

	this.timers[proposalId] = cmpTimer.SetTimeout(
		SYSTEM_ENTITY,
		IID_AgreementAI,
		"Respond",
		this.ResponseDelay,
		proposalId
	);
};

/**
 * @return {number}
 */
AgreementAI.prototype.Promised = function(items, type, resource)
{
	let total = 0;
	for (let i = 0; i < items.length; ++i)
	{
		const item = items[i];
		if (!item || item.type !== type)
			continue;
		if (type === "resource" && item.resource !== resource)
			continue;
		total += item.amount || 0;
	}
	return total;
};

/**
 * One cash row, so a search sees the same total Propose will store.
 * @return {Object[]}
 */
AgreementAI.prototype.WithCash = function(items, amount, provider, beneficiary)
{
	const copy = clone(items);
	for (let i = 0; i < copy.length; ++i)
		if (copy[i].type === "cash")
		{
			copy[i] = clone(copy[i]);
			copy[i].amount += amount;
			return copy;
		}
	copy.push({
		"type": "cash",
		"amount": amount,
		"provider": provider,
		"beneficiary": beneficiary
	});
	return copy;
};

/**
 * @return {Object}
 */
AgreementAI.prototype.Candidate = function(original, offer, request)
{
	return {
		"proposer": original.recipient,
		"recipient": original.proposer,
		"offer": offer,
		"request": request,
		"parentProposal": original.id
	};
};

/**
 * @return {Object|null} - The counter proposal data, or null when none improves the deal.
 */
AgreementAI.prototype.BuildCounter = function(original, evaluation)
{
	const cmpEvaluator = Engine.QueryInterface(SYSTEM_ENTITY, IID_AgreementEvaluator);
	const cmpPlayer = QueryPlayerIDInterface(original.proposer);
	const counts = cmpPlayer && cmpPlayer.GetResourceCounts() || {};
	const treasury = cmpEvaluator.Treasury(original.proposer);
	const offer = clone(original.request);
	const baseRequest = clone(original.offer);
	const ai = original.recipient;
	const cashAlready = this.Promised(baseRequest, "cash");
	const maxExtra = Math.max(0, treasury - cashAlready);
	const steps = Math.floor(maxExtra / this.CashStep);

	let best = null;
	const consider = candidate =>
	{
		const scored = cmpEvaluator.EvaluateProposalData(candidate, ai);
		if (scored.hardReject)
			return;
		if (!best || scored.totalUtility > best.scored.totalUtility)
			best = { "candidate": candidate, "scored": scored };
	};

	if (steps > 0)
	{
		let low = 1;
		let high = steps;
		let found = 0;
		while (low <= high)
		{
			const mid = Math.floor((low + high) / 2);
			const request = this.WithCash(baseRequest, mid * this.CashStep, original.proposer, ai);
			const candidate = this.Candidate(original, offer, request);
			const scored = cmpEvaluator.EvaluateProposalData(candidate, ai);
			if (!scored.hardReject && scored.totalUtility >= cmpEvaluator.AcceptAt)
			{
				found = mid;
				high = mid - 1;
			}
			else
				low = mid + 1;
		}
		if (found > 0)
		{
			const request = this.WithCash(baseRequest, found * this.CashStep, original.proposer, ai);
			return this.Candidate(original, clone(offer), request);
		}
		if (steps > 0)
		{
			const request = this.WithCash(baseRequest, steps * this.CashStep, original.proposer, ai);
			consider(this.Candidate(original, clone(offer), request));
		}
	}

	const codes = Object.keys(counts).filter(code => counts[code] > 0).sort();
	codes.sort((left, right) =>
	{
		const leftValue = cmpEvaluator.EvaluateItem({
			"type": "resource",
			"resource": left,
			"amount": 1,
			"provider": original.proposer,
			"beneficiary": ai
		}, ai).utility;
		const rightValue = cmpEvaluator.EvaluateItem({
			"type": "resource",
			"resource": right,
			"amount": 1,
			"provider": original.proposer,
			"beneficiary": ai
		}, ai).utility;
		if (rightValue !== leftValue)
			return rightValue - leftValue;
		if (left < right)
			return -1;
		return left > right ? 1 : 0;
	});

	for (let i = 0; i < codes.length; ++i)
	{
		const available = counts[codes[i]] - this.Promised(baseRequest, "resource", codes[i]);
		if (available <= 0)
			continue;
		const amounts = [];
		const parcel = Math.min(this.ResourceParcel, available);
		amounts.push(parcel);
		if (available !== parcel)
			amounts.push(available);
		for (let a = 0; a < amounts.length; ++a)
		{
			const request = clone(baseRequest);
			request.push({
				"type": "resource",
				"resource": codes[i],
				"amount": amounts[a],
				"provider": original.proposer,
				"beneficiary": ai
			});
			const candidate = this.Candidate(original, clone(offer), request);
			const scored = cmpEvaluator.EvaluateProposalData(candidate, ai);
			if (!scored.hardReject && scored.totalUtility >= cmpEvaluator.AcceptAt)
				return candidate;
			consider(candidate);
		}
		break;
	}

	let painful = null;
	for (let i = 0; i < offer.length; ++i)
	{
		const item = offer[i];
		if (!item || item.type !== "resource" || !item.amount || item.amount < 2)
			continue;
		const scored = cmpEvaluator.EvaluateItem(item, ai);
		if (!painful || scored.utility < painful.utility)
			painful = { "index": i, "utility": scored.utility };
	}
	if (painful)
	{
		const reduced = clone(offer);
		reduced[painful.index] = clone(reduced[painful.index]);
		reduced[painful.index].amount = Math.max(1, Math.floor(reduced[painful.index].amount / 2));
		const candidate = this.Candidate(original, reduced, clone(baseRequest));
		const scored = cmpEvaluator.EvaluateProposalData(candidate, ai);
		if (!scored.hardReject && scored.totalUtility >= cmpEvaluator.AcceptAt)
			return candidate;
		consider(candidate);
	}

	if (!best || best.scored.totalUtility <= evaluation.totalUtility)
		return null;
	if (best.scored.totalUtility < cmpEvaluator.CounterAt)
		return null;
	return best.candidate;
};

/**
 * Accept, reject, or replace a pending proposal. A second call does nothing.
 */
AgreementAI.prototype.Respond = function(proposalId)
{
	if (!Number.isInteger(proposalId) || this.answered[proposalId])
		return;
	this.answered[proposalId] = true;
	delete this.timers[proposalId];

	const cmpAgreements = Engine.QueryInterface(SYSTEM_ENTITY, IID_AgreementManager);
	const cmpEvaluator = Engine.QueryInterface(SYSTEM_ENTITY, IID_AgreementEvaluator);
	const proposal = cmpAgreements && cmpAgreements.Find(proposalId);
	if (!proposal || proposal.status !== "pending" || !cmpEvaluator)
		return;
	if (!this.ShouldRespond(proposal.recipient))
		return;

	const evaluation = cmpEvaluator.EvaluateProposalData(proposal, proposal.recipient);
	if (evaluation.decision === "accept")
	{
		cmpAgreements.Accept(proposal.recipient, proposal.id);
		return;
	}
	if (evaluation.decision === "reject" || evaluation.hardReject)
	{
		cmpAgreements.Reject(proposal.recipient, proposal.id);
		return;
	}

	const counter = this.BuildCounter(proposal, evaluation);
	if (!counter)
	{
		cmpAgreements.Reject(proposal.recipient, proposal.id);
		return;
	}

	const counterId = cmpAgreements.Propose(
		counter.proposer,
		counter.recipient,
		counter.offer,
		counter.request,
		proposal.id
	);
	if (!counterId || !cmpAgreements.MarkCountered(proposal.recipient, proposal.id))
	{
		if (!counterId)
			cmpAgreements.Reject(proposal.recipient, proposal.id);
		return;
	}
};

Engine.RegisterSystemComponentType(IID_AgreementAI, "AgreementAI", AgreementAI);
