function PopulationFoodConsumption() {}

PopulationFoodConsumption.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * Prototype interval in simulation milliseconds.
 * Aligned with the other Nation ten-second ticks. Not a calendar.
 */
PopulationFoodConsumption.prototype.Interval = 10000;

/**
 * Prototype demand: one food per this many people each interval.
 * Gameplay tuning, not a caloric conversion.
 */
PopulationFoodConsumption.prototype.PeoplePerFood = 100;

PopulationFoodConsumption.prototype.Init = function()
{
	// Player id -> latest interval and cumulative unmet food.
	this.status = {};
	this.timer = 0;
	AttachPopulationFoodToSimulationState();
};

PopulationFoodConsumption.prototype.OnInitGame = function()
{
	this.StartConsumption();
};

PopulationFoodConsumption.prototype.OnUpdate = function()
{
	// Loaded games skip Init. The wrap is a prototype change, not saved state.
	AttachPopulationFoodToSimulationState();
};

/**
 * One repeating timer for every sovereign state. A second call does not schedule another.
 */
PopulationFoodConsumption.prototype.StartConsumption = function()
{
	if (this.timer)
		return;

	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (!cmpTimer)
		return;

	this.timer = cmpTimer.SetInterval(
		SYSTEM_ENTITY,
		IID_PopulationFoodConsumption,
		"ConsumeFood",
		this.Interval,
		this.Interval,
		null
	);
};

/**
 * @param {number} population
 * @return {number}
 */
PopulationFoodConsumption.prototype.RequiredFood = function(population)
{
	if (!Number.isInteger(population) || population <= 0)
		return 0;
	return Math.ceil(population / this.PeoplePerFood);
};

/**
 * @param {number} playerId
 * @return {number}
 */
PopulationFoodConsumption.prototype.Population = function(playerId)
{
	const cmpSettlements = Engine.QueryInterface(SYSTEM_ENTITY, IID_NationSettlementManager);
	if (!cmpSettlements)
		return 0;
	return cmpSettlements.GetTotalPopulation(playerId);
};

/**
 * Whole food units currently in the player stockpile. Never negative.
 * @param {number} playerId
 * @return {number}
 */
PopulationFoodConsumption.prototype.AvailableFood = function(playerId)
{
	const cmpPlayer = this.Player(playerId);
	if (!cmpPlayer)
		return 0;
	const food = cmpPlayer.GetResourceCounts().food;
	if (!Number.isFinite(food) || food <= 0)
		return 0;
	return Math.floor(food);
};

/**
 * @param {number} playerId
 * @return {Object|null}
 */
PopulationFoodConsumption.prototype.Player = function(playerId)
{
	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	if (!cmpPlayerManager)
		return null;
	const ent = cmpPlayerManager.GetPlayerByID(playerId);
	return ent ? Engine.QueryInterface(ent, IID_Player) : null;
};

/**
 * Latest demand interval for this player. Before the first tick, shortage is zero
 * and the requirement is the live population. cumulativeUnmet starts at zero.
 * @param {number} playerId
 * @return {Object|null}
 */
PopulationFoodConsumption.prototype.GetFoodStatus = function(playerId)
{
	if (!Number.isInteger(playerId) || playerId <= 0)
		return null;

	const population = this.Population(playerId);
	const required = this.RequiredFood(population);
	const saved = this.status[playerId];
	if (!saved)
		return {
			"population": population,
			"required": required,
			"consumed": 0,
			"unmet": 0,
			"fulfillmentBps": 10000,
			"shortageBps": 0,
			"cumulativeUnmet": 0,
			"interval": this.Interval
		};

	return {
		"population": saved.population,
		"required": saved.required,
		"consumed": saved.consumed,
		"unmet": saved.unmet,
		"fulfillmentBps": saved.fulfillmentBps,
		"shortageBps": saved.shortageBps,
		"cumulativeUnmet": saved.cumulativeUnmet,
		"interval": this.Interval
	};
};

/**
 * @param {number} required
 * @param {number} consumed
 * @return {number} - 0–10000. A country with no population is fully fulfilled.
 */
PopulationFoodConsumption.prototype.FulfillmentBps = function(required, consumed)
{
	if (required <= 0)
		return 10000;
	return Math.round(consumed * 10000 / required);
};

/**
 * Subtract only the food this interval can take. The stockpile is never asked
 * for more than it holds, so TrySubtractResources does not refuse the tick.
 */
PopulationFoodConsumption.prototype.ConsumeFood = function()
{
	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	if (!cmpPlayerManager)
		return;

	const count = cmpPlayerManager.GetNumPlayers();
	for (let playerId = 1; playerId < count; ++playerId)
	{
		const population = this.Population(playerId);
		const required = this.RequiredFood(population);
		const available = this.AvailableFood(playerId);
		const consumed = Math.min(required, available);
		const unmet = required - consumed;
		if (consumed > 0)
		{
			const cmpPlayer = this.Player(playerId);
			if (!cmpPlayer || !cmpPlayer.TrySubtractResources({ "food": consumed }))
				continue;
		}

		const previous = this.status[playerId] ? this.status[playerId].cumulativeUnmet : 0;
		const fulfillmentBps = this.FulfillmentBps(required, consumed);
		this.status[playerId] = {
			"population": population,
			"required": required,
			"consumed": consumed,
			"unmet": unmet,
			"fulfillmentBps": fulfillmentBps,
			"shortageBps": required > 0 ? 10000 - fulfillmentBps : 0,
			"cumulativeUnmet": previous + unmet
		};
	}
};

Engine.RegisterSystemComponentType(IID_PopulationFoodConsumption, "PopulationFoodConsumption", PopulationFoodConsumption);

/**
 * GetSimulationState has no mod hook. Attach the latest food status for the session readout.
 */
function AttachPopulationFoodToSimulationState()
{
	if (typeof GuiInterface === "undefined" || !GuiInterface.prototype.GetSimulationState)
		return;
	if (GuiInterface.prototype.GetSimulationState.nationFoodWrapped)
		return;

	const original = GuiInterface.prototype.GetSimulationState;
	const wrapped = function()
	{
		const state = original.apply(this, arguments);
		if (!state || !state.players)
			return state;
		const cmpFood = Engine.QueryInterface(SYSTEM_ENTITY, IID_PopulationFoodConsumption);
		if (!cmpFood)
			return state;
		for (let playerId = 1; playerId < state.players.length; ++playerId)
		{
			const status = cmpFood.GetFoodStatus(playerId);
			if (status)
				state.players[playerId].nationFood = status;
		}
		return state;
	};
	wrapped.nationFoodWrapped = true;
	if (original.nationFoodImportWrapped)
		wrapped.nationFoodImportWrapped = true;
	GuiInterface.prototype.GetSimulationState = wrapped;
}

AttachPopulationFoodToSimulationState();
