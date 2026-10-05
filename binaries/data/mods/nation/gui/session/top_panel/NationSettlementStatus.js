/**
 * Loaded from gui/session/top_panel, after gui/session has defined selection and the update handler.
 * The caption is the settlement's simulation state. This file does not compute discontent.
 */
function nationSettlementAmount(value)
{
	return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function updateNationSettlementStatus()
{
	const label = Engine.GetGUIObjectByName("nationSettlementStatus");
	if (!label)
		return;
	if (typeof nationPlayingFoodCrisis === "function" && nationPlayingFoodCrisis())
	{
		label.hidden = true;
		return;
	}

	const selected = g_Selection && g_Selection.toList();
	const state = selected && selected.length === 1 && GetEntityState(selected[0]);
	const settlement = state && state.nationSettlement;
	if (!settlement)
	{
		label.hidden = true;
		return;
	}

	const rebellion = state.nationRebellion;
	let rebellionLine = "Rebellion: None";
	if (rebellion && rebellion.active)
		rebellionLine = "Rebellion: Active";
	else if (rebellion && rebellion.extreme)
		rebellionLine = "Rebellion risk: Extreme";

	label.hidden = false;
	label.caption =
		settlement.name + "\n" +
		"Population: " + nationSettlementAmount(settlement.population) + "\n" +
		"State integration: " + settlement.integration + "\n" +
		"Discontent: " + settlement.discontent + "\n" +
		"Legal sovereignty: " + (settlement.legalSovereignty || "Unclaimed") + "\n" +
		"Effective control: " + (settlement.effectiveControl || "Uncontrolled") + "\n" +
		"Military occupation: " + (settlement.militaryOccupation || "None") + "\n" +
		rebellionLine;
}

registerSimulationUpdateHandler(updateNationSettlementStatus);
