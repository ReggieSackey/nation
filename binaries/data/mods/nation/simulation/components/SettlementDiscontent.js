function SettlementDiscontent() {}

SettlementDiscontent.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * Shortage basis points that become ten food-pressure points.
 * Gameplay tuning, not a measure of calories or anger.
 */
SettlementDiscontent.prototype.FullShortageBps = 10000;

/**
 * Food-pressure points at a complete shortage.
 */
SettlementDiscontent.prototype.PressureScale = 10;

/**
 * Integration points that add one point of crisis vulnerability.
 */
SettlementDiscontent.prototype.IntegrationBand = 20;

/**
 * Discontent removed on an interval with no food shortage.
 */
SettlementDiscontent.prototype.Recovery = 5;

SettlementDiscontent.prototype.Init = function()
{
	AttachDiscontentToSimulationState();
	AttachSettlementDiscontentToEntityState();
};

/**
 * Loaded games skip Init. The readouts are prototype changes, not saved state.
 */
SettlementDiscontent.prototype.OnUpdate = function()
{
	AttachDiscontentToSimulationState();
	AttachSettlementDiscontentToEntityState();
};

/**
 * Points of food pressure for this shortage, from 0 to PressureScale.
 * @param {number} shortageBps
 * @return {number}
 */
SettlementDiscontent.prototype.FoodPressure = function(shortageBps)
{
	if (!Number.isInteger(shortageBps) || shortageBps <= 0)
		return 0;
	return Math.round(shortageBps * this.PressureScale / this.FullShortageBps);
};

/**
 * Extra points while a shortage is already hurting. Zero when integration is 100.
 * Read live. Not cached.
 * @param {number} integration
 * @return {number}
 */
SettlementDiscontent.prototype.IntegrationPenalty = function(integration)
{
	if (!Number.isFinite(integration))
		return 0;
	return Math.floor((100 - integration) / this.IntegrationBand);
};

/**
 * Integer change for one settlement on the latest food interval.
 * Low integration adds nothing while the country is fed.
 * @return {number}
 */
SettlementDiscontent.prototype.DiscontentDelta = function(shortageBps, integration)
{
	if (shortageBps === 0)
		return -this.Recovery;
	const pressure = this.FoodPressure(shortageBps);
	if (pressure <= 0)
		return 0;
	return pressure + this.IntegrationPenalty(integration);
};

/**
 * Apply the latest food interval to every settlement in that sovereign state.
 * Called from FoodConsumptionCompleted, after that interval has been stored.
 */
SettlementDiscontent.prototype.OnGlobalFoodConsumptionCompleted = function()
{
	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	const cmpFood = Engine.QueryInterface(SYSTEM_ENTITY, IID_PopulationFoodConsumption);
	const cmpSettlements = Engine.QueryInterface(SYSTEM_ENTITY, IID_NationSettlementManager);
	if (!cmpPlayerManager || !cmpFood || !cmpSettlements)
		return;

	const count = cmpPlayerManager.GetNumPlayers();
	for (let playerId = 1; playerId < count; ++playerId)
	{
		const status = cmpFood.GetFoodStatus(playerId);
		if (!status)
			continue;
		for (const ent of cmpSettlements.GetSettlementsForSovereign(playerId))
		{
			const cmpSettlement = Engine.QueryInterface(ent, IID_NationSettlement);
			if (!cmpSettlement)
				continue;
			const delta = this.DiscontentDelta(status.shortageBps, cmpSettlement.GetStateIntegration());
			if (delta !== 0)
				cmpSettlement.ChangeDiscontent(delta);
		}
	}

	if (Engine.BroadcastMessage)
		Engine.BroadcastMessage(MT_SettlementDiscontentCompleted, {});
};

/**
 * Population-weighted mean of settlement discontent. Derived. Not stored.
 * Zero when the sovereign has no settlement population.
 * @param {number} playerId
 * @return {number}
 */
SettlementDiscontent.prototype.GetNationalDiscontent = function(playerId)
{
	if (!Number.isInteger(playerId) || playerId <= 0)
		return 0;

	const cmpSettlements = Engine.QueryInterface(SYSTEM_ENTITY, IID_NationSettlementManager);
	if (!cmpSettlements)
		return 0;

	let population = 0;
	let weighted = 0;
	for (const ent of cmpSettlements.GetSettlementsForSovereign(playerId))
	{
		const cmpSettlement = Engine.QueryInterface(ent, IID_NationSettlement);
		if (!cmpSettlement)
			continue;
		const count = cmpSettlement.GetPopulation();
		population += count;
		weighted += count * cmpSettlement.GetDiscontent();
	}
	if (population <= 0)
		return 0;
	return Math.round(weighted / population);
};

/**
 * Authoritative settlement politics for the selection readout.
 * @param {number} entity
 * @return {Object|null}
 */
SettlementDiscontent.prototype.GetSettlementView = function(entity)
{
	const cmpSettlement = Engine.QueryInterface(entity, IID_NationSettlement);
	if (!cmpSettlement || !cmpSettlement.GetName())
		return null;
	return {
		"name": cmpSettlement.GetName(),
		"population": cmpSettlement.GetPopulation(),
		"integration": cmpSettlement.GetStateIntegration(),
		"discontent": cmpSettlement.GetDiscontent(),
		"legalSovereignty": nationControllerName(cmpSettlement.GetSovereignOwner(), "Unclaimed"),
		"effectiveControl": nationControllerName(cmpSettlement.GetEffectiveController(), "Uncontrolled"),
		"militaryOccupation": nationControllerName(
			Engine.QueryInterface(SYSTEM_ENTITY, IID_MilitaryOccupation)?.GetOccupier(entity) || 0,
			"None")
	};
};

/**
 * Player display name for a sovereignty or territory id.
 * Non-positive ids are uncontrolled or unclaimed land.
 */
function nationControllerName(playerId, emptyLabel)
{
	if (!Number.isInteger(playerId) || playerId <= 0)
		return emptyLabel;

	const playerEnt = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager)?.GetPlayerByID(playerId);
	const name = playerEnt && Engine.QueryInterface(playerEnt, IID_Identity)?.GetName();
	return name || emptyLabel;
}

Engine.RegisterSystemComponentType(IID_SettlementDiscontent, "SettlementDiscontent", SettlementDiscontent);

/**
 * GetSimulationState has no mod hook. Attach the derived national discontent.
 */
function AttachDiscontentToSimulationState()
{
	if (typeof GuiInterface === "undefined" || !GuiInterface.prototype.GetSimulationState)
		return;
	if (GuiInterface.prototype.GetSimulationState.nationDiscontentWrapped)
		return;

	const original = GuiInterface.prototype.GetSimulationState;
	const wrapped = function()
	{
		const state = original.apply(this, arguments);
		if (!state || !state.players)
			return state;
		const cmpDiscontent = Engine.QueryInterface(SYSTEM_ENTITY, IID_SettlementDiscontent);
		if (!cmpDiscontent)
			return state;
		for (let playerId = 1; playerId < state.players.length; ++playerId)
			state.players[playerId].nationDiscontent = cmpDiscontent.GetNationalDiscontent(playerId);
		return state;
	};
	wrapped.nationDiscontentWrapped = true;
	if (original.nationFoodWrapped)
		wrapped.nationFoodWrapped = true;
	if (original.nationFoodImportWrapped)
		wrapped.nationFoodImportWrapped = true;
	if (original.nationRebellionWrapped)
		wrapped.nationRebellionWrapped = true;
	if (original.nationScenarioWrapped)
		wrapped.nationScenarioWrapped = true;
	GuiInterface.prototype.GetSimulationState = wrapped;
}

/**
 * GetEntityState has no mod hook. Attach this settlement's own discontent.
 */
function AttachSettlementDiscontentToEntityState()
{
	if (typeof GuiInterface === "undefined" || !GuiInterface.prototype.GetEntityState)
		return;
	if (GuiInterface.prototype.GetEntityState.nationSettlementWrapped)
		return;

	const original = GuiInterface.prototype.GetEntityState;
	const wrapped = function(player, ent)
	{
		const state = original.apply(this, arguments);
		if (!state)
			return state;
		const cmpDiscontent = Engine.QueryInterface(SYSTEM_ENTITY, IID_SettlementDiscontent);
		if (!cmpDiscontent)
			return state;
		const view = cmpDiscontent.GetSettlementView(ent);
		if (view)
			state.nationSettlement = view;
		return state;
	};
	wrapped.nationSettlementWrapped = true;
	if (original.nationRepairWrapped)
		wrapped.nationRepairWrapped = true;
	if (original.nationRebellionWrapped)
		wrapped.nationRebellionWrapped = true;
	GuiInterface.prototype.GetEntityState = wrapped;
}

AttachDiscontentToSimulationState();
AttachSettlementDiscontentToEntityState();
