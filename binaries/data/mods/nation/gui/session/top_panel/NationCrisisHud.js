/**
 * Food-crisis presentation. Numbers come from NationScenarioController.GetView.
 * This file does not price imports, repair roads, or change discontent.
 */
var g_NationCrisisBriefingClosed = false;
var g_NationCrisisEndClosed = false;
var g_NationCrisisBarHideRegistered = false;
var g_NationCrisisNegotiationsOpen = false;

function nationCrisisHideResourceBar()
{
	if (!nationPlayingFoodCrisis())
		return;
	const counts = Engine.GetGUIObjectByName("resourceCounts");
	if (counts)
		counts.hidden = true;
}

function nationPlayingFoodCrisis()
{
	const settings = g_InitAttributes && g_InitAttributes.settings;
	const scenario = settings && settings.NationScenario;
	return !!(scenario && scenario.id === "food_crisis");
}

function nationCrisisComma(value)
{
	return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function nationCrisisMoney(value)
{
	if (!Number.isFinite(value))
		return "$0";
	const amount = Math.max(0, Math.floor(value));
	if (amount >= 1000000)
	{
		const tenths = Math.round(amount / 100000);
		return "$" + Math.floor(tenths / 10) + "." + (tenths % 10) + "m";
	}
	return "$" + nationCrisisComma(amount);
}

function nationCrisisMood(value)
{
	if (value >= 80)
		return "Rebellion risk";
	if (value >= 70)
		return "Volatile";
	if (value >= 50)
		return "Restive";
	if (value >= 25)
		return "Uneasy";
	return "Calm";
}

function nationCrisisView()
{
	return g_SimState && g_SimState.nationCrisis;
}

function updateNationCrisisHud()
{
	const playing = nationPlayingFoodCrisis();
	const view = playing && nationCrisisView();
	const hud = Engine.GetGUIObjectByName("nationCrisisHud");
	const places = Engine.GetGUIObjectByName("nationCrisisPlaces");
	const actions = Engine.GetGUIObjectByName("nationCrisisActions");
	const selection = Engine.GetGUIObjectByName("nationCrisisSelection");
	if (!hud || !places || !actions)
		return;

	if (playing && !g_NationCrisisBarHideRegistered)
	{
		g_NationCrisisBarHideRegistered = true;
		registerSimulationUpdateHandler(nationCrisisHideResourceBar);
	}
	nationCrisisHideResourceBar();

	if (!playing || !view)
	{
		hud.hidden = true;
		places.hidden = true;
		actions.hidden = true;
		if (selection)
			selection.hidden = true;
		const briefing = Engine.GetGUIObjectByName("nationCrisisBriefing");
		const end = Engine.GetGUIObjectByName("nationCrisisEnd");
		const dialog = Engine.GetGUIObjectByName("nationCrisisImportDialog");
		if (briefing)
			briefing.hidden = true;
		if (end)
			end.hidden = true;
		if (dialog)
			dialog.hidden = true;
		return;
	}

	hud.hidden = false;
	places.hidden = false;
	actions.hidden = false;
	if (!g_NationCrisisNegotiationsOpen)
	{
		const negotiation = Engine.GetGUIObjectByName("nationAgreementDialog");
		if (negotiation)
			negotiation.hidden = true;
	}
	const seconds = view.interval / 1000;
	let foodLine = "FOOD\n" + nationCrisisComma(view.food) +
		"\nConsumption " + nationCrisisComma(view.required) + " / " + seconds + " sec";
	if (view.unmet > 0)
		foodLine += "\nShortage: " + nationCrisisComma(view.unmet) + " unmet";

	const highest = view.highest;
	const unrest = highest ?
		highest.name + " — " + highest.discontent + " " + nationCrisisMood(highest.discontent) :
		"None";
	Engine.GetGUIObjectByName("nationCrisisSummaryText").caption =
		"POPULATION  " + nationCrisisComma(view.population) +
		"\n" + foodLine +
		"\nTREASURY  " + nationCrisisMoney(view.treasury) +
		"\nUNREST  " + unrest +
		"\n" + view.statusLine;
	Engine.GetGUIObjectByName("nationCrisisSummaryText").tooltip =
		"People living under this government. Soldiers and workers on the map stand in for them.";

	const ordered = view.settlements.slice().sort((left, right) =>
		right.discontent - left.discontent || left.id - right.id);
	const lines = [];
	for (let i = 0; i < ordered.length; ++i)
	{
		const settlement = ordered[i];
		lines.push(settlement.name + "  " + settlement.discontent + "  " + nationCrisisMood(settlement.discontent));
	}
	Engine.GetGUIObjectByName("nationCrisisPlacesText").caption = lines.join("\n");

	updateNationCrisisImport(view);
	updateNationCrisisRepair();
	updateNationCrisisSelection(view);
	updateNationCrisisBriefing(view);
	updateNationCrisisEnd(view);
	nationCrisisBindActions();
}

function nationCrisisBindActions()
{
	const confirm = Engine.GetGUIObjectByName("nationCrisisImportConfirm");
	const cancel = Engine.GetGUIObjectByName("nationCrisisImportCancel");
	const negotiate = Engine.GetGUIObjectByName("nationCrisisNegotiate");
	if (confirm && !confirm.onPress)
		confirm.onPress = nationCrisisConfirmImport;
	if (cancel && !cancel.onPress)
		cancel.onPress = function()
		{
			Engine.GetGUIObjectByName("nationCrisisImportDialog").hidden = true;
		};
	if (negotiate && !negotiate.onPress)
	{
		negotiate.onPress = nationCrisisOpenNegotiations;
		negotiate.tooltip = "The Soviet Union may lend. This opens the real negotiation screen.";
	}
}

function updateNationCrisisImport(view)
{
	const button = Engine.GetGUIObjectByName("nationCrisisImport");
	const reason = Engine.GetGUIObjectByName("nationCrisisImportReason");
	const player = g_SimState.players[g_ViewedPlayer];
	const quote = player && player.nationFoodImport;
	if (!button || !reason)
		return;
	if (!quote)
	{
		button.enabled = false;
		reason.caption = "Food imports unavailable.";
		return;
	}

	const partner = g_SimState.players[quote.seller] && g_SimState.players[quote.seller].name || "the seller";
	let unavailable = "";
	if (!quote.tradeAllowed)
		unavailable = "No trade access with " + partner + ".";
	else if (!quote.canAfford)
		unavailable = "The treasury cannot pay " + nationCrisisMoney(quote.cost) + ".";
	reason.caption = unavailable;
	button.enabled = !!(quote.available && controlsPlayer(g_ViewedPlayer));
	button.tooltip = unavailable ||
		("Buy " + nationCrisisComma(quote.amount) + " food for " + nationCrisisMoney(quote.cost));
	if (!button.onPress)
		button.onPress = function()
		{
			const dialog = Engine.GetGUIObjectByName("nationCrisisImportDialog");
			const current = g_SimState && g_SimState.players[g_ViewedPlayer];
			const live = current && current.nationFoodImport;
			if (!dialog || !live || !live.available)
				return;
			const treasury = g_SimState.nationCrisis ? g_SimState.nationCrisis.treasury : 0;
			Engine.GetGUIObjectByName("nationCrisisImportText").caption =
				"IMPORT FOOD\n\nReceive\n" + nationCrisisComma(live.amount) + " food\n\nCost\n" +
				nationCrisisMoney(live.cost) + "\n\nTreasury\n" +
				nationCrisisMoney(treasury) + " → " + nationCrisisMoney(Math.max(0, treasury - live.cost));
			dialog.hidden = false;
		};
}

function nationCrisisConfirmImport()
{
	const current = g_SimState && g_SimState.players[g_ViewedPlayer];
	const live = current && current.nationFoodImport;
	if (!live || !live.available || !controlsPlayer(g_ViewedPlayer))
		return;
	Engine.PostNetworkCommand({
		"type": "nation-purchase-import",
		"offer": live.id
	});
	const dialog = Engine.GetGUIObjectByName("nationCrisisImportDialog");
	if (dialog)
		dialog.hidden = true;
}

function updateNationCrisisRepair()
{
	const button = Engine.GetGUIObjectByName("nationCrisisRepair");
	if (!button)
		return;
	const selected = g_Selection && g_Selection.toList();
	const state = selected && selected.length === 1 && GetEntityState(selected[0]);
	const quote = state && state.nationRepair;
	let tooltip = "Select a damaged road.";
	let enabled = false;
	if (quote && !quote.authorized)
		tooltip = "Nation cannot repair this road.";
	else if (quote && !quote.repairable)
		tooltip = "This road is already in good condition.";
	else if (quote && !quote.canAfford)
		tooltip = "The treasury cannot pay " + nationCrisisMoney(quote.cost) + ".";
	else if (quote && quote.repairable && quote.canAfford)
	{
		enabled = controlsPlayer(g_ViewedPlayer);
		tooltip = "Condition " + quote.condition + "%. Cost " + nationCrisisMoney(quote.cost) + ".";
	}
	button.enabled = enabled;
	button.tooltip = tooltip;
	if (!button.onPress)
		button.onPress = function()
		{
			const current = g_Selection && g_Selection.toList();
			const selectedState = current && current.length === 1 && GetEntityState(current[0]);
			const live = selectedState && selectedState.nationRepair;
			if (!live || !live.repairable || !live.canAfford || !controlsPlayer(g_ViewedPlayer))
				return;
			Engine.PostNetworkCommand({
				"type": "nation-repair-infrastructure",
				"entity": selectedState.id
			});
		};
}

function updateNationCrisisSelection(view)
{
	const panel = Engine.GetGUIObjectByName("nationCrisisSelection");
	const text = Engine.GetGUIObjectByName("nationCrisisSelectionText");
	if (!panel || !text)
		return;
	const selected = g_Selection && g_Selection.toList();
	const state = selected && selected.length === 1 && GetEntityState(selected[0]);
	if (!state)
	{
		panel.hidden = true;
		return;
	}

	if (state.nationSettlement)
	{
		const settlement = state.nationSettlement;
		let row = null;
		for (let i = 0; i < view.settlements.length; ++i)
			if (view.settlements[i].id === state.id)
				row = view.settlements[i];
		const discontent = row ? row.discontent : settlement.discontent;
		let pressure = "The country is feeding itself.";
		if (view.unmet > 0 && row)
			pressure = "Food pressure " + row.foodPressure +
				". Weak ties to the government add " + row.vulnerability + ".";
		else if (row)
			pressure = "Fed. If food runs short, weak ties add " + row.vulnerability + ".";
		const rebellion = state.nationRebellion && state.nationRebellion.active ? "Rebels are here." : "";
		text.caption =
			settlement.name + "\n" +
			"Population " + nationCrisisComma(settlement.population) + "\n" +
			"Integration " + settlement.integration + "%\n" +
			"Discontent " + discontent + " / 100  " + nationCrisisMood(discontent) + "\n" +
			pressure + (rebellion ? "\n" + rebellion : "");
		panel.hidden = false;
		return;
	}

	if (state.nationRepair)
	{
		const quote = state.nationRepair;
		let repair = "Condition " + quote.condition + "%.";
		if (!quote.authorized)
			repair += "\nNation cannot repair this road.";
		else if (!quote.repairable)
			repair += "\nThis road is in good condition.";
		else
			repair += "\nA damaged road carries less.\nRepair cost " + nationCrisisMoney(quote.cost) + ".";
		text.caption = "Road\n" + repair;
		panel.hidden = false;
		return;
	}

	panel.hidden = true;
}

function updateNationCrisisBriefing(view)
{
	const panel = Engine.GetGUIObjectByName("nationCrisisBriefing");
	if (!panel)
		return;
	const early = g_SimState.timeElapsed < 60000;
	panel.hidden = g_NationCrisisBriefingClosed || !early || !!view.outcome;
	if (panel.hidden)
		return;
	Engine.GetGUIObjectByName("nationCrisisBriefingText").caption =
		"THE FOOD CRISIS\n\n" +
		"Independence is new. The harvest has been poor.\n" +
		"Food reserves are falling faster than the farms replace them.\n" +
		"Places with weak ties to the government become unstable first.\n\n" +
		"Keep the country together.\n" +
		"Watch food, the treasury, and settlement discontent.\n\n" +
		"Feed people from the farms, buy food, or borrow.";
	const close = Engine.GetGUIObjectByName("nationCrisisBriefingClose");
	if (close && !close.onPress)
		close.onPress = function()
		{
			g_NationCrisisBriefingClosed = true;
			panel.hidden = true;
		};
}

function updateNationCrisisEnd(view)
{
	const panel = Engine.GetGUIObjectByName("nationCrisisEnd");
	if (!panel)
		return;
	const summary = view.summary;
	if (!summary || g_NationCrisisEndClosed)
	{
		panel.hidden = !summary || g_NationCrisisEndClosed;
		return;
	}
	panel.hidden = false;
	const title = summary.outcome === "victory" ? "COUNTRY STABILIZED" : "GOVERNMENT COLLAPSE";
	let debt = "Foreign debt\nNone";
	if (summary.debt > 0)
		debt = "Foreign debt\n" + nationCrisisMoney(summary.debt) +
			(summary.debtCreditor ? " to " + summary.debtCreditor : "");
	let consequence = summary.reason;
	if (summary.outcome === "victory" && summary.debt > 0)
		consequence = "The immediate food crisis has passed.\nThe government remains " +
			nationCrisisMoney(summary.debt) + " in debt" +
			(summary.debtCreditor ? " to " + summary.debtCreditor : "") + ".";
	Engine.GetGUIObjectByName("nationCrisisEndText").caption =
		title + "\n\n" +
		"Population\n" + nationCrisisComma(summary.population) + "\n" +
		"Food reserve\n" + nationCrisisComma(summary.food) + "\n" +
		"Treasury\n" + nationCrisisMoney(summary.treasury) + "\n" +
		debt + "\n" +
		"Highest discontent\n" + (summary.highestName || "None") + " — " + summary.highestDiscontent + "\n" +
		"Rebellions suppressed\n" + summary.rebellionsSuppressed + "\n\n" +
		consequence;
	const close = Engine.GetGUIObjectByName("nationCrisisEndClose");
	if (close && !close.onPress)
		close.onPress = function()
		{
			g_NationCrisisEndClosed = true;
			panel.hidden = true;
		};
}

function nationCrisisOpenNegotiations()
{
	const dialog = Engine.GetGUIObjectByName("nationAgreementDialog");
	if (!dialog || !controlsPlayer(g_ViewedPlayer))
		return;
	g_NationCrisisNegotiationsOpen = true;
	g_NationAgreementDraft.recipient = { "type": "foreign_actor", "id": "ussr" };
	g_NationAgreementDraft.side = "request";
	dialog.hidden = false;
}

registerSimulationUpdateHandler(updateNationCrisisHud);
