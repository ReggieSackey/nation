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
	if (typeof nationPlayingFoodCrisis === "function" && nationPlayingFoodCrisis())
	{
		label.hidden = true;
		return;
	}

	const state = g_SimState && g_ViewedPlayer > 0 && g_SimState.players[g_ViewedPlayer];
	const status = state && state.nationFood;
	if (!status)
	{
		label.hidden = true;
		return;
	}

	const seconds = status.interval / 1000;
	const shortage = Math.round(status.shortageBps / 100);
	const discontent = Number.isInteger(state.nationDiscontent) ? state.nationDiscontent : 0;
	const rebellions = Number.isInteger(state.nationActiveRebellions) ? state.nationActiveRebellions : 0;
	const units = Number.isFinite(state.popCount) ? state.popCount : 0;
	const slots = Number.isFinite(state.popLimit) ? state.popLimit : 0;
	const materials = state.resourceCounts && Number.isFinite(state.resourceCounts.construction_materials) ?
		state.resourceCounts.construction_materials : 0;
	const phaseNames = {
		"village": "Consolidation",
		"town": "Development",
		"city": "Advanced State"
	};
	const phase = phaseNames[state.phase] || "Consolidation";
	label.hidden = false;
	label.caption =
		"Population: " + nationFoodAmount(status.population) +
		"    Food demand: " + nationFoodAmount(status.required) + " / " + seconds + "s" +
		"    Food shortage: " + shortage + "%" +
		"    National discontent: " + discontent + "%" +
		"    Active rebellions: " + rebellions +
		"\nState capacity: " + phase +
		"    Representative units: " + nationFoodAmount(units) + " / " + nationFoodAmount(slots) +
		"    Construction materials: " + nationFoodAmount(Math.floor(materials));
}

registerSimulationUpdateHandler(updateNationFoodStatus);
