/**
 * Loaded from gui/session/top_panel, after gui/session has defined the update handler.
 * The draft is local composition. The simulation stores the proposal only after the command.
 */
var g_NationAgreementDraft = {
	"recipient": 0,
	"side": "offer",
	"offer": [],
	"request": [],
	"debtId": 0
};
var g_NationAgreementActionId = 0;

function nationAgreementKey(participant)
{
	if (typeof participant === "number" && participant > 0)
		return "player:" + participant;
	if (participant && participant.type === "foreign_actor" && participant.id)
		return "foreign_actor:" + participant.id;
	return "";
}

function nationAgreementSame(left, right)
{
	const key = nationAgreementKey(left);
	return key !== "" && key === nationAgreementKey(right);
}

function nationAgreementForeign(participant)
{
	return nationAgreementKey(participant).indexOf("foreign_actor:") === 0;
}

function nationAgreementAmount()
{
	const input = Engine.GetGUIObjectByName("nationAgreementAmount");
	if (!input || !/^[1-9][0-9]*$/.test(input.caption))
		return 0;
	const amount = +input.caption;
	return Number.isInteger(amount) && amount > 0 ? amount : 0;
}

function nationAgreementPartners()
{
	const partners = [];
	if (g_SimState && g_SimState.players)
		for (let playerId = 1; playerId < g_SimState.players.length; ++playerId)
			if (playerId !== g_ViewedPlayer && g_SimState.players[playerId])
				partners.push(playerId);
	const actors = g_SimState && g_SimState.nationForeignActors || [];
	for (let i = 0; i < actors.length; ++i)
		partners.push({
			"type": "foreign_actor",
			"id": actors[i].id
		});
	return partners;
}

function nationAgreementName(participant)
{
	if (nationAgreementForeign(participant))
	{
		const actors = g_SimState && g_SimState.nationForeignActors || [];
		for (let i = 0; i < actors.length; ++i)
			if (actors[i].id === participant.id)
				return actors[i].name;
		return participant.id;
	}
	const player = g_SimState && g_SimState.players[participant];
	return player && player.name || ("Player " + participant);
}

function nationAgreementTreasury(participant)
{
	if (nationAgreementForeign(participant))
	{
		const actors = g_SimState && g_SimState.nationForeignActors || [];
		for (let i = 0; i < actors.length; ++i)
			if (actors[i].id === participant.id)
				return actors[i].treasury;
		return 0;
	}
	const player = g_SimState && g_SimState.players[participant];
	return player && player.nationTreasury || 0;
}

function nationAgreementField(name, fallback, allowZero)
{
	const input = Engine.GetGUIObjectByName(name);
	if (!input)
		return fallback;
	const pattern = allowZero ? /^(0|[1-9][0-9]*)$/ : /^[1-9][0-9]*$/;
	if (!pattern.test(input.caption))
		return fallback;
	const amount = +input.caption;
	return Number.isInteger(amount) && amount >= 0 ? amount : fallback;
}

function nationAgreementClaims(provider, beneficiary)
{
	const debts = g_SimState && g_SimState.nationDebts || [];
	const claims = [];
	for (let i = 0; i < debts.length; ++i)
	{
		const debt = debts[i];
		if (debt.status !== "active")
			continue;
		if (nationAgreementSame(debt.creditor, provider) && nationAgreementSame(debt.debtor, beneficiary))
			claims.push(debt);
	}
	return claims;
}

function nationAgreementStock(playerId, code)
{
	const player = g_SimState && g_SimState.players[playerId];
	const counts = player && player.resourceCounts;
	return counts && counts[code] !== undefined ? counts[code] : 0;
}

function nationAgreementDraftTotal(list, type, resource)
{
	let total = 0;
	for (let i = 0; i < list.length; ++i)
		if (list[i].type === type && (type !== "resource" || list[i].resource === resource))
			total += list[i].amount;
	return total;
}

function nationAgreementAdd(type, resource)
{
	const list = g_NationAgreementDraft.side === "request" ? g_NationAgreementDraft.request : g_NationAgreementDraft.offer;
	if (type === "military_access" || type === "trade_access")
	{
		for (let i = 0; i < list.length; ++i)
			if (list[i].type === type)
				return;
		list.push({ "type": type });
		return;
	}

	const amount = nationAgreementAmount();
	if (!amount)
		return;
	const provider = g_NationAgreementDraft.side === "request" ? g_NationAgreementDraft.recipient : g_ViewedPlayer;
	const already = nationAgreementDraftTotal(list, type, resource);
	if (type === "cash")
	{
		if (already + amount > nationAgreementTreasury(provider))
			return;
		list.push({ "type": "cash", "amount": amount });
		return;
	}

	if (type === "loan")
	{
		const interest = nationAgreementField("nationAgreementInterest", 400, true);
		const installments = nationAgreementField("nationAgreementInstallments", 5, false);
		const grace = nationAgreementField("nationAgreementGrace", 1, true);
		if (interest > 10000 || installments > 60 || grace > 24 || amount < installments)
			return;
		let alreadyPrincipal = 0;
		for (let i = 0; i < list.length; ++i)
			if (list[i].type === "loan")
				alreadyPrincipal += list[i].principal;
		if (alreadyPrincipal + amount > nationAgreementTreasury(provider))
			return;
		list.push({
			"type": "loan",
			"principal": amount,
			"interestRateBps": interest,
			"installments": installments,
			"graceIntervals": grace
		});
		return;
	}

	if (type === "debt_forgiveness")
	{
		const claims = nationAgreementClaims(provider, provider === g_ViewedPlayer ? g_NationAgreementDraft.recipient : g_ViewedPlayer);
		let debt = null;
		for (let i = 0; i < claims.length; ++i)
			if (claims[i].id === g_NationAgreementDraft.debtId)
				debt = claims[i];
		if (!debt)
			debt = claims.length ? claims[0] : null;
		if (!debt || amount > debt.principalOutstanding)
			return;
		for (let i = 0; i < list.length; ++i)
			if (list[i].type === "debt_forgiveness" && list[i].debtId === debt.id)
				return;
		list.push({
			"type": "debt_forgiveness",
			"debtId": debt.id,
			"amount": amount
		});
		return;
	}

	if (already + amount > nationAgreementStock(provider, resource))
		return;
	list.push({
		"type": "resource",
		"resource": resource,
		"amount": amount
	});
}

function nationAgreementDescribe(items, provider, beneficiary)
{
	if (!items.length)
		return "    nothing";
	const lines = [];
	for (let i = 0; i < items.length; ++i)
	{
		const item = items[i];
		if (item.type === "resource")
			lines.push("    " + item.amount + " " + item.resource);
		else if (item.type === "cash")
			lines.push("    " + item.amount + " treasury");
		else if (item.type === "military_access")
			lines.push("    " + nationAgreementName(provider) + " grants " + nationAgreementName(beneficiary) + " military access");
		else if (item.type === "trade_access")
			lines.push("    " + nationAgreementName(provider) + " grants " + nationAgreementName(beneficiary) + " trade access");
		else if (item.type === "loan")
			lines.push("    loan " + item.principal + " at " + item.interestRateBps +
				" bps, " + item.installments + " installments, grace " + item.graceIntervals);
		else if (item.type === "debt_forgiveness")
			lines.push("    forgive " + item.amount + " of debt #" + item.debtId);
	}
	return lines.join("\n");
}

function nationAgreementBind()
{
	const open = Engine.GetGUIObjectByName("nationAgreementOpen");
	if (!open || open.nationAgreementBound)
		return;
	open.nationAgreementBound = true;
	open.onPress = function()
	{
		const dialog = Engine.GetGUIObjectByName("nationAgreementDialog");
		if (dialog)
			dialog.hidden = !dialog.hidden;
	};

	const close = Engine.GetGUIObjectByName("nationAgreementClose");
	close.onPress = function()
	{
		Engine.GetGUIObjectByName("nationAgreementDialog").hidden = true;
	};

	Engine.GetGUIObjectByName("nationAgreementPartnerButton").onPress = function()
	{
		const partners = nationAgreementPartners();
		if (!partners.length)
			return;
		let index = -1;
		for (let i = 0; i < partners.length; ++i)
			if (nationAgreementSame(partners[i], g_NationAgreementDraft.recipient))
				index = i;
		g_NationAgreementDraft.recipient = partners[(index + 1) % partners.length];
		g_NationAgreementDraft.debtId = 0;
	};
	Engine.GetGUIObjectByName("nationAgreementSideOffer").onPress = function()
	{
		g_NationAgreementDraft.side = "offer";
	};
	Engine.GetGUIObjectByName("nationAgreementSideRequest").onPress = function()
	{
		g_NationAgreementDraft.side = "request";
	};
	Engine.GetGUIObjectByName("nationAgreementCash").onPress = function()
	{
		nationAgreementAdd("cash");
	};
	Engine.GetGUIObjectByName("nationAgreementMilitary").onPress = function()
	{
		nationAgreementAdd("military_access");
	};
	Engine.GetGUIObjectByName("nationAgreementTrade").onPress = function()
	{
		nationAgreementAdd("trade_access");
	};
	Engine.GetGUIObjectByName("nationAgreementLoan").onPress = function()
	{
		nationAgreementAdd("loan");
	};
	Engine.GetGUIObjectByName("nationAgreementForgive").onPress = function()
	{
		nationAgreementAdd("debt_forgiveness");
	};
	Engine.GetGUIObjectByName("nationAgreementDebtPick").onPress = function()
	{
		const provider = g_NationAgreementDraft.side === "request" ? g_NationAgreementDraft.recipient : g_ViewedPlayer;
		const beneficiary = g_NationAgreementDraft.side === "request" ? g_ViewedPlayer : g_NationAgreementDraft.recipient;
		const claims = nationAgreementClaims(provider, beneficiary);
		if (!claims.length)
			return;
		let index = 0;
		for (let i = 0; i < claims.length; ++i)
			if (claims[i].id === g_NationAgreementDraft.debtId)
				index = i + 1;
		g_NationAgreementDraft.debtId = claims[index % claims.length].id;
	};
	const interest = Engine.GetGUIObjectByName("nationAgreementInterest");
	const installments = Engine.GetGUIObjectByName("nationAgreementInstallments");
	const grace = Engine.GetGUIObjectByName("nationAgreementGrace");
	if (!interest.caption)
		interest.caption = "400";
	if (!installments.caption)
		installments.caption = "5";
	if (!grace.caption)
		grace.caption = "1";

	for (let i = 0; i < 8; ++i)
	{
		const button = Engine.GetGUIObjectByName("nationAgreementType" + i);
		button.onPress = function()
		{
			if (button.nationResource)
				nationAgreementAdd("resource", button.nationResource);
		};
	}

	Engine.GetGUIObjectByName("nationAgreementPropose").onPress = function()
	{
		if (!controlsPlayer(g_ViewedPlayer) || !g_NationAgreementDraft.recipient)
			return;
		if (!g_NationAgreementDraft.offer.length && !g_NationAgreementDraft.request.length)
			return;
		Engine.PostNetworkCommand({
			"type": "nation-propose-agreement",
			"recipient": g_NationAgreementDraft.recipient,
			"offer": g_NationAgreementDraft.offer,
			"request": g_NationAgreementDraft.request
		});
		g_NationAgreementDraft.offer = [];
		g_NationAgreementDraft.request = [];
	};
	Engine.GetGUIObjectByName("nationAgreementAccept").onPress = function()
	{
		if (!controlsPlayer(g_ViewedPlayer) || !g_NationAgreementActionId)
			return;
		Engine.PostNetworkCommand({
			"type": "nation-accept-agreement",
			"id": g_NationAgreementActionId
		});
	};
	Engine.GetGUIObjectByName("nationAgreementReject").onPress = function()
	{
		if (!controlsPlayer(g_ViewedPlayer) || !g_NationAgreementActionId)
			return;
		Engine.PostNetworkCommand({
			"type": "nation-reject-agreement",
			"id": g_NationAgreementActionId
		});
	};
}

function updateNationAgreement()
{
	nationAgreementBind();
	const open = Engine.GetGUIObjectByName("nationAgreementOpen");
	const dialog = Engine.GetGUIObjectByName("nationAgreementDialog");
	if (!open || !dialog)
		return;

	open.hidden = g_ViewedPlayer < 1;
	open.enabled = controlsPlayer(g_ViewedPlayer);
	if (dialog.hidden || g_ViewedPlayer < 1)
		return;

	const partners = nationAgreementPartners();
	let partnerKnown = false;
	for (let i = 0; i < partners.length; ++i)
		if (nationAgreementSame(partners[i], g_NationAgreementDraft.recipient))
			partnerKnown = true;
	if (!partnerKnown)
		g_NationAgreementDraft.recipient = partners.length ? partners[0] : 0;

	const partner = g_NationAgreementDraft.recipient;
	const foreign = nationAgreementForeign(partner);
	const title = Engine.GetGUIObjectByName("nationAgreementTitle");
	title.caption = "Negotiation — " + (partner ? nationAgreementName(partner) : "no country") +
		(foreign ? " — Foreign Power" : "");

	const resources = g_SimState.nationAgreementResources || [];
	for (let i = 0; i < 8; ++i)
	{
		const button = Engine.GetGUIObjectByName("nationAgreementType" + i);
		const choice = !foreign && resources[i];
		button.hidden = !choice;
		button.nationResource = choice ? choice.code : "";
		if (choice)
			button.caption = choice.name;
	}
	Engine.GetGUIObjectByName("nationAgreementMilitary").hidden = foreign;
	Engine.GetGUIObjectByName("nationAgreementTrade").hidden = foreign;

	const provider = g_NationAgreementDraft.side === "request" ? partner : g_ViewedPlayer;
	const beneficiary = g_NationAgreementDraft.side === "request" ? g_ViewedPlayer : partner;
	const claims = nationAgreementClaims(provider, beneficiary);
	const forgive = Engine.GetGUIObjectByName("nationAgreementForgive");
	const pick = Engine.GetGUIObjectByName("nationAgreementDebtPick");
	forgive.hidden = !claims.length;
	pick.hidden = !claims.length;
	let selected = null;
	for (let i = 0; i < claims.length; ++i)
		if (claims[i].id === g_NationAgreementDraft.debtId)
			selected = claims[i];
	if (!selected && claims.length)
	{
		selected = claims[0];
		g_NationAgreementDraft.debtId = selected.id;
	}
	if (selected)
		pick.caption = "Debt #" + selected.id + "  " + selected.principalOutstanding + " left";

	const treasury = provider ? nationAgreementTreasury(provider) : 0;
	Engine.GetGUIObjectByName("nationAgreementAvailable").caption =
		(g_NationAgreementDraft.side === "request" ? "Requesting from " : "Offering from ") +
		nationAgreementName(provider) + "   treasury " + treasury;

	const debtLines = [];
	const debts = g_SimState.nationDebts || [];
	for (let i = 0; i < debts.length; ++i)
	{
		const debt = debts[i];
		if (debt.status !== "active")
			continue;
		if (!nationAgreementSame(debt.debtor, g_ViewedPlayer) && !nationAgreementSame(debt.creditor, g_ViewedPlayer) &&
			!nationAgreementSame(debt.debtor, partner) && !nationAgreementSame(debt.creditor, partner))
			continue;
		debtLines.push(nationAgreementName(debt.debtor) + " owes " + nationAgreementName(debt.creditor) + ": " + debt.principalOutstanding);
	}
	Engine.GetGUIObjectByName("nationAgreementDebt").caption = debtLines.length ?
		debtLines.join("\n") : "No outstanding debt with this country.";

	const us = g_ViewedPlayer;
	const them = partner;
	const proposals = g_SimState.nationAgreements || [];
	const pendingLines = [];
	g_NationAgreementActionId = 0;
	let outgoingId = 0;
	for (let i = 0; i < proposals.length; ++i)
	{
		const proposal = proposals[i];
		if (proposal.proposer !== us && proposal.recipient !== us)
			continue;
		pendingLines.push("#" + proposal.id + " " + proposal.status +
			(proposal.parentProposal ? " (answers #" + proposal.parentProposal + ")" : ""));
		pendingLines.push(nationAgreementName(proposal.proposer) + " offers:");
		pendingLines.push(nationAgreementDescribe(proposal.offer, proposal.proposer, proposal.recipient));
		pendingLines.push(nationAgreementName(proposal.proposer) + " requests:");
		pendingLines.push(nationAgreementDescribe(proposal.request, proposal.recipient, proposal.proposer));
		if (proposal.status !== "pending")
			continue;
		if (proposal.recipient === us && !g_NationAgreementActionId)
			g_NationAgreementActionId = proposal.id;
		else if (proposal.proposer === us && !outgoingId)
			outgoingId = proposal.id;
	}
	if (!g_NationAgreementActionId)
		g_NationAgreementActionId = outgoingId;

	let outcome = "";
	for (let i = proposals.length - 1; i >= 0; --i)
	{
		const proposal = proposals[i];
		const other = proposal.proposer === us ? proposal.recipient : proposal.proposer;
		if (proposal.recipient === us && proposal.status === "pending" && proposal.parentProposal)
		{
			outcome = nationAgreementName(other) + " has proposed different terms.";
			break;
		}
		if (proposal.proposer === us && proposal.status === "accepted")
		{
			outcome = nationAgreementName(other) + " accepted the agreement.";
			break;
		}
		if (proposal.proposer === us && proposal.status === "rejected")
		{
			outcome = nationAgreementName(other) + " rejected the agreement.";
			break;
		}
		if (proposal.proposer === us && proposal.status === "countered")
		{
			outcome = nationAgreementName(other) + " has proposed different terms.";
			break;
		}
	}

	Engine.GetGUIObjectByName("nationAgreementLists").caption =
		"WE OFFER\n" + nationAgreementDescribe(g_NationAgreementDraft.offer, us, them) + "\n" +
		"WE REQUEST\n" + nationAgreementDescribe(g_NationAgreementDraft.request, them, us) + "\n\n" +
		(outcome ? outcome + "\n\n" : "") +
		pendingLines.join("\n");

	const action = proposals.find(proposal => proposal.id === g_NationAgreementActionId);
	const accept = Engine.GetGUIObjectByName("nationAgreementAccept");
	const reject = Engine.GetGUIObjectByName("nationAgreementReject");
	accept.enabled = !!(action && action.status === "pending" && action.recipient === us && controlsPlayer(us));
	reject.enabled = !!(action && action.status === "pending" && controlsPlayer(us));
	accept.tooltip = accept.enabled ? "Accept proposal " + action.id : "No proposal addressed to you";
	reject.tooltip = reject.enabled ? "Reject proposal " + action.id : "";
}

registerSimulationUpdateHandler(updateNationAgreement);
