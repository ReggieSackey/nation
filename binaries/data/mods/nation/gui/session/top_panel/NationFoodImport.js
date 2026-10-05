/**
 * Loaded from gui/session/top_panel, after gui/session has defined the update handler.
 * The caption and the button read the simulation quote. This file does not price the import.
 */
function nationImportAmount(value)
{
	return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function updateNationFoodImport()
{
	const label = Engine.GetGUIObjectByName("nationFoodImportLabel");
	const button = Engine.GetGUIObjectByName("nationFoodImport");
	if (!label || !button)
		return;
	if (typeof nationPlayingFoodCrisis === "function" && nationPlayingFoodCrisis())
	{
		label.hidden = true;
		button.hidden = true;
		return;
	}

	const player = g_SimState && g_ViewedPlayer > 0 && g_SimState.players[g_ViewedPlayer];
	const quote = player && player.nationFoodImport;
	const food = player && player.nationFood;
	if (!quote || !food)
	{
		label.hidden = true;
		button.hidden = true;
		return;
	}

	const partner = g_SimState.players[quote.seller] && g_SimState.players[quote.seller].name || "seller";
	const seconds = food.interval / 1000;
	const shortage = Math.round(food.shortageBps / 100);
	label.hidden = false;
	label.caption =
		"Stockpile: " + nationImportAmount(player.resourceCounts.food) + "\n" +
		"Population demand: " + nationImportAmount(food.required) + " / " + seconds + "s\n" +
		"Shortage: " + shortage + "%\n" +
		"Trade partner: " + partner + "\n" +
		"+" + nationImportAmount(quote.amount) + " food\n" +
		"Cost: " + nationImportAmount(quote.cost) + " treasury";

	button.hidden = false;
	button.enabled = !!(quote.available && controlsPlayer(g_ViewedPlayer));
	if (!quote.tradeAllowed)
		button.tooltip = "No trade access";
	else if (!quote.canAfford)
		button.tooltip = "Insufficient treasury";
	else
		button.tooltip = "Buy " + nationImportAmount(quote.amount) + " food from " + partner;

	if (!button.onPress)
		button.onPress = function()
		{
			const current = g_SimState && g_ViewedPlayer > 0 && g_SimState.players[g_ViewedPlayer];
			const live = current && current.nationFoodImport;
			if (!live || !live.available || typeof live.id !== "string")
				return;
			Engine.PostNetworkCommand({
				"type": "nation-purchase-import",
				"offer": live.id
			});
		};
}

registerSimulationUpdateHandler(updateNationFoodImport);
