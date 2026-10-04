function RebellionManager() {}

RebellionManager.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * Discontent at or above this value is an extreme interval.
 * Gameplay tuning, not a measure of popular will.
 */
RebellionManager.prototype.RebellionThreshold = 80;

/**
 * Consecutive completed discontent evaluations required before the first spawn.
 */
RebellionManager.prototype.RequiredExtremeIntervals = 2;

/**
 * Fighters in the one V1 group. Not scaled by population.
 */
RebellionManager.prototype.GroupSize = 3;

RebellionManager.prototype.RebelTemplate = "units/nation/rebel_fighter";

/**
 * Deterministic offsets from the settlement position, in world metres.
 * GetPosition2D stores map z in y. JumpTo takes x and z.
 */
RebellionManager.prototype.SpawnOffsets = [
	{ "x": 8, "z": 0 },
	{ "x": -6, "z": 6 },
	{ "x": -6, "z": -6 }
];

RebellionManager.prototype.Init = function()
{
	this.records = {};
	this.rebelPlayer = 0;
	AttachRebellionToSimulationState();
	AttachRebellionToEntityState();
};

/**
 * Loaded games skip Init and OnInitGame. The rebel player id is serialized state.
 */
RebellionManager.prototype.OnUpdate = function()
{
	AttachRebellionToSimulationState();
	AttachRebellionToEntityState();
};

RebellionManager.prototype.CreateRecord = function()
{
	return {
		"extremeIntervals": 0,
		"active": false,
		"rebels": [],
		"opponent": 0
	};
};

/**
 * Scenario player slot that owns rebel entities. Missing or invalid fails closed.
 * @param {number} playerId
 */
RebellionManager.prototype.ReadRebelPlayer = function(playerId)
{
	this.rebelPlayer = Number.isInteger(playerId) && playerId > 0 ? playerId : 0;
};

/**
 * @return {number} - Player slot that owns rebel entities, or 0 when none is configured.
 */
RebellionManager.prototype.GetRebelPlayer = function()
{
	return this.rebelPlayer;
};

RebellionManager.prototype.OnInitGame = function()
{
	const settings = typeof InitAttributes !== "undefined" && InitAttributes.settings;
	this.ReadRebelPlayer(settings ? settings.RebelPlayer : undefined);
};

/**
 * @param {number} ent
 * @return {boolean}
 */
RebellionManager.prototype.IsLivingRebel = function(ent)
{
	if (!this.rebelPlayer)
		return false;
	const cmpHealth = Engine.QueryInterface(ent, IID_Health);
	const cmpOwnership = Engine.QueryInterface(ent, IID_Ownership);
	if (!cmpHealth || !cmpOwnership)
		return false;
	if (cmpOwnership.GetOwner() !== this.rebelPlayer)
		return false;
	return cmpHealth.GetHitpoints() > 0;
};

/**
 * @return {number[]}
 */
RebellionManager.prototype.LivingRebels = function(record)
{
	const living = [];
	if (!record)
		return living;
	for (const id of record.rebels)
		if (this.IsLivingRebel(id))
			living.push(id);
	return living;
};

/**
 * Drop dead or disowned ids. Clearing the last living rebel ends the group
 * and restarts the sustained-extreme count. That evaluation does not itself qualify.
 * @return {boolean} - True when an active group was cleared on this call.
 */
RebellionManager.prototype.Prune = function(record)
{
	if (!record)
		return false;
	const living = this.LivingRebels(record);
	const cleared = record.active && living.length === 0;
	record.rebels = living;
	if (!cleared)
		return false;
	record.active = false;
	record.extremeIntervals = 0;
	record.opponent = 0;
	return true;
};

/**
 * Read-only status for GUI and tests. Does not advance escalation.
 * @param {number} entity
 * @return {Object}
 */
RebellionManager.prototype.GetStatus = function(entity)
{
	const record = this.records[entity];
	const active = !!(record && record.active);
	const cmpSettlement = Engine.QueryInterface(entity, IID_NationSettlement);
	const discontent = cmpSettlement ? cmpSettlement.GetDiscontent() : 0;
	return {
		"active": active,
		"extremeIntervals": record ? record.extremeIntervals : 0,
		"livingRebels": this.LivingRebels(record).length,
		"extreme": discontent >= this.RebellionThreshold && !active,
		"opponent": record && record.opponent ? record.opponent : 0
	};
};

/**
 * Active groups in land sovereign to this player.
 * @param {number} playerId
 * @return {number}
 */
RebellionManager.prototype.GetActiveCount = function(playerId)
{
	if (!Number.isInteger(playerId) || playerId <= 0)
		return 0;
	const cmpSettlements = Engine.QueryInterface(SYSTEM_ENTITY, IID_NationSettlementManager);
	if (!cmpSettlements)
		return 0;
	let count = 0;
	for (const ent of cmpSettlements.GetSettlementsForSovereign(playerId))
	{
		const record = this.records[ent];
		if (record && record.active)
			++count;
	}
	return count;
};

RebellionManager.prototype.Rollback = function(spawned)
{
	for (const id of spawned)
		Engine.DestroyEntity(id);
};

/**
 * Three fighters owned by the rebel player, near the settlement.
 * The opposed government is the sovereign, not the settlement entity's owner.
 * A failed spawn leaves the group inactive so a later evaluation can try again.
 * @return {boolean}
 */
RebellionManager.prototype.SpawnGroup = function(ent, cmpSettlement, record)
{
	if (this.SpawnOffsets.length !== this.GroupSize)
	{
		error("RebellionManager: rebel group size does not match spawn offsets");
		return false;
	}
	if (!this.rebelPlayer)
		return false;

	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	if (!cmpPlayerManager || !cmpPlayerManager.GetPlayerByID(this.rebelPlayer))
		return false;

	const sovereign = cmpSettlement.GetSovereignOwner();
	if (!Number.isInteger(sovereign) || sovereign <= 0)
		return false;

	const cmpPosition = Engine.QueryInterface(ent, IID_Position);
	if (!cmpPosition || !cmpPosition.GetPosition2D)
		return false;
	const pos = cmpPosition.GetPosition2D();
	if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y))
		return false;

	const spawned = [];
	for (const offset of this.SpawnOffsets)
	{
		const id = Engine.AddEntity(this.RebelTemplate);
		const cmpOwnership = id ? Engine.QueryInterface(id, IID_Ownership) : null;
		const cmpSpawn = id ? Engine.QueryInterface(id, IID_Position) : null;
		if (!id || !cmpOwnership || !cmpOwnership.SetOwner || !cmpSpawn || !cmpSpawn.JumpTo)
		{
			if (id)
				spawned.push(id);
			this.Rollback(spawned);
			return false;
		}
		cmpOwnership.SetOwner(this.rebelPlayer);
		cmpSpawn.JumpTo(pos.x + offset.x, pos.y + offset.z);
		spawned.push(id);
	}

	record.rebels = spawned;
	record.active = true;
	record.opponent = sovereign;
	return true;
};

/**
 * One settlement after a completed discontent evaluation.
 * Does not read food, and does not change discontent, integration, or infrastructure.
 */
RebellionManager.prototype.EvaluateSettlement = function(ent)
{
	const cmpSettlement = Engine.QueryInterface(ent, IID_NationSettlement);
	if (!cmpSettlement)
		return;

	const record = this.records[ent];
	if (record && this.Prune(record))
		return;
	if (record && record.active)
		return;

	if (cmpSettlement.GetDiscontent() < this.RebellionThreshold)
	{
		if (record)
			record.extremeIntervals = 0;
		return;
	}

	const tracked = record || this.CreateRecord();
	this.records[ent] = tracked;
	tracked.extremeIntervals += 1;
	if (tracked.extremeIntervals >= this.RequiredExtremeIntervals)
		this.SpawnGroup(ent, cmpSettlement, tracked);
};

/**
 * Settlement entity ids in ascending order so a shared spawn tick is deterministic.
 * @return {number[]}
 */
RebellionManager.prototype.SettlementIds = function()
{
	const ids = Engine.GetEntitiesWithInterface(IID_NationSettlement).slice();
	ids.sort((a, b) => a - b);
	return ids;
};

RebellionManager.prototype.OnGlobalSettlementDiscontentCompleted = function()
{
	for (const ent of this.SettlementIds())
		this.EvaluateSettlement(ent);
};

Engine.RegisterSystemComponentType(IID_RebellionManager, "RebellionManager", RebellionManager);

/**
 * GetSimulationState has no mod hook. Attach the active-rebellion count.
 */
function AttachRebellionToSimulationState()
{
	if (typeof GuiInterface === "undefined" || !GuiInterface.prototype.GetSimulationState)
		return;
	if (GuiInterface.prototype.GetSimulationState.nationRebellionWrapped)
		return;

	const original = GuiInterface.prototype.GetSimulationState;
	const wrapped = function()
	{
		const state = original.apply(this, arguments);
		if (!state || !state.players)
			return state;
		const cmpRebellion = Engine.QueryInterface(SYSTEM_ENTITY, IID_RebellionManager);
		if (!cmpRebellion)
			return state;
		for (let playerId = 1; playerId < state.players.length; ++playerId)
			state.players[playerId].nationActiveRebellions = cmpRebellion.GetActiveCount(playerId);
		return state;
	};
	wrapped.nationRebellionWrapped = true;
	if (original.nationFoodWrapped)
		wrapped.nationFoodWrapped = true;
	if (original.nationFoodImportWrapped)
		wrapped.nationFoodImportWrapped = true;
	if (original.nationDiscontentWrapped)
		wrapped.nationDiscontentWrapped = true;
	GuiInterface.prototype.GetSimulationState = wrapped;
}

/**
 * GetEntityState has no mod hook. Attach this settlement's rebellion status.
 */
function AttachRebellionToEntityState()
{
	if (typeof GuiInterface === "undefined" || !GuiInterface.prototype.GetEntityState)
		return;
	if (GuiInterface.prototype.GetEntityState.nationRebellionWrapped)
		return;

	const original = GuiInterface.prototype.GetEntityState;
	const wrapped = function(player, ent)
	{
		const state = original.apply(this, arguments);
		if (!state)
			return state;
		const cmpRebellion = Engine.QueryInterface(SYSTEM_ENTITY, IID_RebellionManager);
		if (!cmpRebellion)
			return state;
		const cmpSettlement = Engine.QueryInterface(ent, IID_NationSettlement);
		if (cmpSettlement)
			state.nationRebellion = cmpRebellion.GetStatus(ent);
		return state;
	};
	wrapped.nationRebellionWrapped = true;
	if (original.nationSettlementWrapped)
		wrapped.nationSettlementWrapped = true;
	if (original.nationRepairWrapped)
		wrapped.nationRepairWrapped = true;
	GuiInterface.prototype.GetEntityState = wrapped;
}

AttachRebellionToSimulationState();
AttachRebellionToEntityState();
