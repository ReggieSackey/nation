/**
 * Loaded from gui/session/top_panel, after gui/session has defined the update handler.
 * The caption is the simulation food status. This file does not compute demand.
 */
function nationFoodAmount(value)
{
	return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function updateNationFoodStatus()
{
	const label = Engine.GetGUIObjectByName("nationFoodStatus");
	if (!label)
		return;

	const state = g_SimState && g_ViewedPlayer > 0 && g_SimState.players[g_ViewedPlayer];
	const status = state && state.nationFood;
	if (!status)
	{
		label.hidden = true;
		return;
	}

	const seconds = status.interval / 1000;
	const shortage = Math.round(status.shortageBps / 100);
	label.hidden = false;
	label.caption =
		"Population: " + nationFoodAmount(status.population) +
		"    Food demand: " + nationFoodAmount(status.required) + " / " + seconds + "s" +
		"    Food shortage: " + shortage + "%";
}

registerSimulationUpdateHandler(updateNationFoodStatus);
