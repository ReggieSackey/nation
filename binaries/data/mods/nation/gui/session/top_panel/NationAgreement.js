/**
 * Loaded from gui/session/top_panel, after gui/session has defined the update handler.
 * The draft is local composition. The simulation stores the proposal only after the command.
 */
var g_NationAgreementDraft = {
	"recipient": 0,
	"side": "offer",
	"offer": [],
	"request": []
};
var g_NationAgreementActionId = 0;

function nationAgreementAmount()
{
	const input = Engine.GetGUIObjectByName("nationAgreementAmount");
	if (!input || !/^[1-9][0-9]*$/.test(input.caption))
		return 0;
	const amount = +input.caption;
	return Number.isInteger(amount) && amount > 0 ? amount : 0;
}

function nationAgreementPlayers()
{
	const players = [];
	if (!g_SimState || !g_SimState.players)
		return players;
	for (let playerId = 1; playerId < g_SimState.players.length; ++playerId)
		if (playerId !== g_ViewedPlayer && g_SimState.players[playerId])
			players.push(playerId);
	return players;
}

function nationAgreementName(playerId)
{
	const player = g_SimState && g_SimState.players[playerId];
	return player && player.name || ("Player " + playerId);
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
		const treasury = g_SimState.players[provider] && g_SimState.players[provider].nationTreasury || 0;
		if (already + amount > treasury)
			return;
		list.push({ "type": "cash", "amount": amount });
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
		const players = nationAgreementPlayers();
		if (!players.length)
			return;
		const index = players.indexOf(g_NationAgreementDraft.recipient);
		g_NationAgreementDraft.recipient = players[(index + 1) % players.length];
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

	const players = nationAgreementPlayers();
	if (players.indexOf(g_NationAgreementDraft.recipient) === -1)
		g_NationAgreementDraft.recipient = players.length ? players[0] : 0;

	const title = Engine.GetGUIObjectByName("nationAgreementTitle");
	title.caption = "Negotiation — " + (g_NationAgreementDraft.recipient ? nationAgreementName(g_NationAgreementDraft.recipient) : "no country");

	const resources = g_SimState.nationAgreementResources || [];
	for (let i = 0; i < 8; ++i)
	{
		const button = Engine.GetGUIObjectByName("nationAgreementType" + i);
		const choice = resources[i];
		button.hidden = !choice;
		button.nationResource = choice ? choice.code : "";
		if (choice)
			button.caption = choice.name;
	}

	const provider = g_NationAgreementDraft.side === "request" ? g_NationAgreementDraft.recipient : g_ViewedPlayer;
	const treasury = provider && g_SimState.players[provider] && g_SimState.players[provider].nationTreasury || 0;
	Engine.GetGUIObjectByName("nationAgreementAvailable").caption =
		(g_NationAgreementDraft.side === "request" ? "Requesting from " : "Offering from ") +
		nationAgreementName(provider) + "   treasury " + treasury;

	const us = g_ViewedPlayer;
	const them = g_NationAgreementDraft.recipient;
	const proposals = g_SimState.nationAgreements || [];
	const pendingLines = [];
	g_NationAgreementActionId = 0;
	for (let i = 0; i < proposals.length; ++i)
	{
		const proposal = proposals[i];
		if (proposal.proposer !== us && proposal.recipient !== us)
			continue;
		pendingLines.push("#" + proposal.id + " " + proposal.status);
		pendingLines.push(nationAgreementName(proposal.proposer) + " offers:");
		pendingLines.push(nationAgreementDescribe(proposal.offer, proposal.proposer, proposal.recipient));
		pendingLines.push(nationAgreementName(proposal.proposer) + " requests:");
		pendingLines.push(nationAgreementDescribe(proposal.request, proposal.recipient, proposal.proposer));
		if (proposal.status === "pending" && !g_NationAgreementActionId &&
			(proposal.recipient === us || proposal.proposer === us))
			g_NationAgreementActionId = proposal.id;
	}

	Engine.GetGUIObjectByName("nationAgreementLists").caption =
		"WE OFFER\n" + nationAgreementDescribe(g_NationAgreementDraft.offer, us, them) + "\n" +
		"WE REQUEST\n" + nationAgreementDescribe(g_NationAgreementDraft.request, them, us) + "\n\n" +
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
