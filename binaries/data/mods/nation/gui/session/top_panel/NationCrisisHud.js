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

/**
 * Settlements the local player still owns. A captured place drops off the map label.
 */
function nationCrisisForViewer(items, viewedPlayer)
{
	const kept = [];
	if (!items)
		return kept;
	for (let i = 0; i < items.length; ++i)
		if (items[i] && items[i].owner === viewedPlayer)
			kept.push(items[i]);
	return kept;
}

function nationCrisisOrderedSettlements(settlements)
{
	const ordered = (settlements || []).slice();
	ordered.sort((left, right) => right.discontent - left.discontent || left.id - right.id);
	return ordered;
}

function nationCrisisSettlementCaption(settlement)
{
	const title = String(settlement.name || "").toUpperCase();
	const mood = String(settlement.mood || nationCrisisMood(settlement.discontent) || "").toUpperCase();
	return title + "\n" + settlement.discontent + " · " + mood;
}

function nationCrisisRoadCaption(link)
{
	return String(link.name || "").toUpperCase() + "\n" + link.condition + "%";
}

/**
 * At most four settlement labels and two damaged-road labels.
 */
function nationCrisisMapItems(view, viewedPlayer)
{
	const items = [];
	const settlements = nationCrisisForViewer(view && view.settlements, viewedPlayer);
	for (let i = 0; i < settlements.length && items.length < 4; ++i)
	{
		const settlement = settlements[i];
		items.push({
			"id": settlement.id,
			"caption": nationCrisisSettlementCaption(settlement),
			"position": settlement.position
		});
	}
	const roads = nationCrisisForViewer(view && view.criticalInfrastructure, viewedPlayer);
	for (let i = 0; i < roads.length && items.length < 6; ++i)
	{
		const road = roads[i];
		items.push({
			"id": road.id,
			"caption": nationCrisisRoadCaption(road),
			"position": road.position
		});
	}
	return items;
}

/**
 * Newly active rebellions. The first observation only records state, so a load does not ping again.
 */
function nationCrisisNewRebellions(known, settlements)
{
	const started = [];
	const next = {};
	const list = settlements || [];
	for (let i = 0; i < list.length; ++i)
	{
		const settlement = list[i];
		const active = !!settlement.rebellion;
		next[settlement.id] = active;
		if (known && active && !known[settlement.id])
			started.push(settlement.id);
	}
	return { "known": next, "started": started };
}

/**
 * Screen position of a map point, using the engine's screen-to-terrain query.
 * Returns null when the point is not on the visible map.
 */
function nationCrisisProject(sample, targetX, targetZ, guess, width, height)
{
	if (!sample || !(width > 1) || !(height > 1))
		return null;
	let sx = guess && Number.isFinite(guess.x) ? guess.x : width * 0.5;
	let sy = guess && Number.isFinite(guess.y) ? guess.y : height * 0.5;
	const step = 16;
	for (let attempt = 0; attempt < 2; ++attempt)
	{
		for (let i = 0; i < 8; ++i)
		{
			const here = nationCrisisSample(sample, sx, sy, width, height);
			if (!here)
				break;
			const dx = targetX - here.x;
			const dz = targetZ - here.z;
			if (dx * dx + dz * dz <= 9)
				return { "x": sx, "y": sy };
			const right = nationCrisisSample(sample, sx + step, sy, width, height);
			const down = nationCrisisSample(sample, sx, sy + step, width, height);
			if (!right || !down)
				break;
			const rx = (right.x - here.x) / step;
			const rz = (right.z - here.z) / step;
			const dyx = (down.x - here.x) / step;
			const dyz = (down.z - here.z) / step;
			const det = rx * dyz - rz * dyx;
			if (Math.abs(det) < 1e-8)
				break;
			const dsx = (dx * dyz - dz * dyx) / det;
			const dsy = (rx * dz - rz * dx) / det;
			if (!Number.isFinite(dsx) || !Number.isFinite(dsy))
				break;
			sx = Math.max(0, Math.min(width - 1, sx + dsx));
			sy = Math.max(0, Math.min(height - 1, sy + dsy));
		}
		const end = nationCrisisSample(sample, sx, sy, width, height);
		if (end && (targetX - end.x) * (targetX - end.x) + (targetZ - end.z) * (targetZ - end.z) <= 36)
			return { "x": sx, "y": sy };
		sx = width * 0.5;
		sy = height * 0.5;
	}
	return null;
}

function nationCrisisSample(sample, sx, sy, width, height)
{
	const x = Math.max(0, Math.min(width - 1, sx));
	const y = Math.max(0, Math.min(height - 1, sy));
	const point = sample(x, y);
	if (!point || !Number.isFinite(+point.x) || !Number.isFinite(+point.z))
		return null;
	return { "x": +point.x, "z": +point.z };
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
		highest.name + " — " + highest.discontent + " " + (highest.mood || nationCrisisMood(highest.discontent)) :
		"None";
	Engine.GetGUIObjectByName("nationCrisisSummaryText").caption =
		"POPULATION  " + nationCrisisComma(view.population) +
		"\n" + foodLine +
		"\nTREASURY  " + nationCrisisMoney(view.treasury) +
		"\nUNREST  " + unrest +
		"\n" + view.statusLine;
	Engine.GetGUIObjectByName("nationCrisisSummaryText").tooltip =
		"People living under this government. Soldiers and workers on the map stand in for them.";

	nationCrisisBindPlaces(nationCrisisOrderedSettlements(view.settlements));
	nationCrisisEnsureMapTick();

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
			"Discontent " + discontent + " / 100  " + (row && row.mood || nationCrisisMood(discontent)) + "\n" +
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

function nationCrisisBindPlaces(ordered)
{
	for (let i = 0; i < 4; ++i)
	{
		const button = Engine.GetGUIObjectByName("nationCrisisPlace" + i);
		if (!button)
			continue;
		const settlement = ordered[i];
		if (!settlement)
		{
			button.hidden = true;
			continue;
		}
		button.hidden = false;
		button.caption = settlement.name + "  " + settlement.discontent + "  " +
			(settlement.mood || nationCrisisMood(settlement.discontent));
		button.tooltip = "Show this settlement.";
		const entity = settlement.id;
		const position = settlement.position;
		button.onPress = function()
		{
			nationCrisisFocusEntity(entity, position);
		};
	}
}

function nationCrisisFocusEntity(entity, position)
{
	if (position && Number.isFinite(position.x) && Number.isFinite(position.z))
		Engine.CameraMoveTo(position.x, position.z);
	if (!g_Selection || !entity)
		return;
	g_Selection.reset();
	g_Selection.addList([entity]);
}

function nationCrisisMark(position)
{
	if (!position || typeof g_TargetMarker === "undefined" || !Engine.GuiInterfaceCall)
		return;
	Engine.GuiInterfaceCall("AddTargetMarker", {
		"template": g_TargetMarker.map_flare,
		"x": position.x,
		"z": position.z,
		"owner": g_ViewedPlayer > 0 ? g_ViewedPlayer : 0
	});
	if (g_MiniMapPanel && g_MiniMapPanel.flare)
		g_MiniMapPanel.flare(position, g_ViewedPlayer);
}

var g_NationCrisisMapTick = false;
var g_NationCrisisRebellionKnown = null;
var g_NationCrisisCameraKey = "";
var g_NationCrisisScreenPoints = {};

function nationCrisisEnsureMapTick()
{
	if (g_NationCrisisMapTick)
		return;
	const root = Engine.GetGUIObjectByName("nationMapLabels");
	if (!root)
		return;
	g_NationCrisisMapTick = true;
	root.onTick = nationCrisisPlaceLabels;
}

function nationCrisisCameraKey()
{
	if (!Engine.GetCameraPivot || !Engine.GetCameraRotation || !Engine.GetCameraZoom)
		return "";
	const pivot = Engine.GetCameraPivot();
	const rot = Engine.GetCameraRotation();
	const zoom = Engine.GetCameraZoom();
	if (!pivot || !rot)
		return "";
	return zoom + ":" + rot.x + ":" + rot.y + ":" + pivot.x + ":" + pivot.z;
}

function nationCrisisPlaceLabels()
{
	const slots = 6;
	const hideAll = function()
	{
		for (let i = 0; i < slots; ++i)
		{
			const label = Engine.GetGUIObjectByName("nationMapLabel" + i);
			if (label)
				label.hidden = true;
		}
	};
	if (!nationPlayingFoodCrisis())
	{
		hideAll();
		return;
	}
	const view = nationCrisisView();
	if (!view)
	{
		hideAll();
		return;
	}
	const edges = nationCrisisNewRebellions(g_NationCrisisRebellionKnown, view.settlements);
	if (g_NationCrisisRebellionKnown)
	{
		for (let i = 0; i < view.settlements.length; ++i)
		{
			const settlement = view.settlements[i];
			if (edges.started.indexOf(settlement.id) !== -1 && settlement.owner === g_ViewedPlayer)
				nationCrisisMark(settlement.position);
		}
	}
	g_NationCrisisRebellionKnown = edges.known;

	const items = nationCrisisMapItems(view, g_ViewedPlayer);
	const session = Engine.GetGUIObjectByName("session");
	const rect = session && session.getComputedSize();
	const width = rect ? rect.right - rect.left : 0;
	const height = rect ? rect.bottom - rect.top : 0;
	const camera = nationCrisisCameraKey();
	const cameraMoved = camera !== g_NationCrisisCameraKey;
	g_NationCrisisCameraKey = camera;

	for (let i = 0; i < slots; ++i)
	{
		const label = Engine.GetGUIObjectByName("nationMapLabel" + i);
		const text = Engine.GetGUIObjectByName("nationMapLabelText" + i);
		if (!label || !text)
			continue;
		const item = items[i];
		if (!item || !item.position)
		{
			label.hidden = true;
			continue;
		}
		let point = !cameraMoved && g_NationCrisisScreenPoints[item.id];
		if (!point && Engine.GetTerrainAtScreenPoint)
		{
			point = nationCrisisProject(
				function(sx, sy)
				{
					return Engine.GetTerrainAtScreenPoint(sx, sy);
				},
				item.position.x,
				item.position.z,
				g_NationCrisisScreenPoints[item.id],
				width,
				height);
			if (point)
				g_NationCrisisScreenPoints[item.id] = point;
		}
		if (!point)
		{
			label.hidden = true;
			continue;
		}
		if (text.caption !== item.caption)
			text.caption = item.caption;
		const left = Math.round(point.x - 86);
		const top = Math.round(point.y - 50);
		const rightEdge = left + 172;
		const bottomEdge = top + 36;
		if (left < 0 || top < 0 || rightEdge > width || bottomEdge > height)
		{
			label.hidden = true;
			continue;
		}
		label.size = left + " " + top + " " + rightEdge + " " + bottomEdge;
		label.hidden = false;
	}
}

if (typeof registerSimulationUpdateHandler === "function")
	registerSimulationUpdateHandler(updateNationCrisisHud);
