function InfrastructureEffects() {}

InfrastructureEffects.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * Simulation milliseconds between national-score refreshes. Matches the
 * settlement-connectivity cadence.
 */
InfrastructureEffects.prototype.RefreshInterval = 10000;

/**
 * Maximum direct gathering bonus at infrastructure score 100.
 */
InfrastructureEffects.prototype.MaximumGatherBonus = 0.10;

/**
 * Modifier identity on the player entity. Affects Nation workers only.
 */
InfrastructureEffects.prototype.GatherModifierID = "nation/infrastructuregather";

InfrastructureEffects.prototype.Init = function()
{
	this.playerMultiplier = [];
	this.StartTimer();
};

// Derived from live TransportEfficiency and InfrastructureLink state.
InfrastructureEffects.prototype.Serialize = null;

InfrastructureEffects.prototype.Deserialize = function()
{
	this.playerMultiplier = [];
	this.StartTimer();
};

InfrastructureEffects.prototype.StartTimer = function()
{
	if (this.timer)
		return;
	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (!cmpTimer)
		return;
	this.timer = cmpTimer.SetInterval(
		SYSTEM_ENTITY,
		IID_InfrastructureEffects,
		"RefreshAll",
		this.RefreshInterval,
		this.RefreshInterval,
		null
	);
};

/**
 * Population-weighted mean route condition of the sovereign's non-capital
 * settlements, 0 to 100. A disconnected settlement contributes 0. A country
 * with no non-capital demographic population scores 0.
 * @param {number} playerId
 * @return {number}
 */
InfrastructureEffects.prototype.GetInfrastructureScore = function(playerId)
{
	const cmpSettlements = Engine.QueryInterface(SYSTEM_ENTITY, IID_NationSettlementManager);
	if (!cmpSettlements || !Number.isInteger(playerId) || playerId <= 0)
		return 0;

	const cmpTransport = Engine.QueryInterface(SYSTEM_ENTITY, IID_TransportEfficiency);
	if (!cmpTransport)
		return 0;

	let totalPopulation = 0;
	let weightedCondition = 0;
	for (const ent of cmpSettlements.GetSettlementsForSovereign(playerId))
	{
		const cmpSettlement = Engine.QueryInterface(ent, IID_NationSettlement);
		if (!cmpSettlement || cmpSettlement.GetIsCapital())
			continue;
		const population = cmpSettlement.GetPopulation();
		if (!Number.isInteger(population) || population <= 0)
			continue;
		totalPopulation += population;
		weightedCondition += population * cmpTransport.GetRouteCondition(ent);
	}
	if (totalPopulation <= 0)
		return 0;
	return weightedCondition / totalPopulation;
};

/**
 * Direct gathering multiplier from infrastructure quality: 1.0 to 1.10.
 * @param {number} score - Infrastructure score 0 to 100.
 * @return {number}
 */
InfrastructureEffects.prototype.GatherMultiplierForScore = function(score)
{
	if (!Number.isFinite(score) || score <= 0)
		return 1;
	const clamped = Math.min(100, score);
	return 1 + this.MaximumGatherBonus * clamped / 100;
};

/**
 * Recompute every sovereign's score and synchronise the player modifier.
 * The ModifiersManager stays authoritative for ResourceGatherer values.
 */
InfrastructureEffects.prototype.RefreshAll = function()
{
	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	const cmpModifiersManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_ModifiersManager);
	if (!cmpPlayerManager || !cmpModifiersManager)
		return;

	const count = cmpPlayerManager.GetNumPlayers();
	for (let playerId = 1; playerId < count; ++playerId)
	{
		const playerEnt = cmpPlayerManager.GetPlayerByID(playerId);
		if (!playerEnt)
			continue;
		const multiplier = this.GatherMultiplierForScore(this.GetInfrastructureScore(playerId));
		if (this.playerMultiplier[playerId] === multiplier)
			continue;

		if (this.playerMultiplier[playerId] !== undefined && this.playerMultiplier[playerId] !== 1)
			cmpModifiersManager.RemoveAllModifiers(this.GatherModifierID, playerEnt);

		if (multiplier !== 1)
			cmpModifiersManager.AddModifier(
				"ResourceGatherer/BaseSpeed",
				this.GatherModifierID,
				// Nation workers only: soldiers, merchants, and rebels are unaffected.
				{ "affects": ["NationWorker"], "multiply": multiplier },
				playerEnt);

		this.playerMultiplier[playerId] = multiplier;
	}
};

/**
 * Discontent relief for one settlement from live infrastructure quality.
 * The sovereign capital stands at 100; other settlements use their route
 * condition. floor(condition / 25), so 0 to 4.
 * @param {number} settlement - Settlement entity id.
 * @return {number}
 */
InfrastructureEffects.prototype.GetDiscontentRelief = function(settlement)
{
	const cmpSettlement = Engine.QueryInterface(settlement, IID_NationSettlement);
	if (!cmpSettlement)
		return 0;

	let condition = 0;
	if (cmpSettlement.GetIsCapital())
		condition = 100;
	else
	{
		const cmpTransport = Engine.QueryInterface(SYSTEM_ENTITY, IID_TransportEfficiency);
		if (cmpTransport)
			condition = cmpTransport.GetRouteCondition(settlement);
	}
	return Math.floor(Math.max(0, Math.min(100, condition)) / 25);
};

Engine.RegisterSystemComponentType(IID_InfrastructureEffects, "InfrastructureEffects", InfrastructureEffects);
