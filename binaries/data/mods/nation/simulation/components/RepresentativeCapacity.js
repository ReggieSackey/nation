function RepresentativeCapacity() {}

RepresentativeCapacity.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * Demographic people represented by one native population slot.
 * Gameplay tuning. One visible unit is not literally this many humans.
 * Later modifiers can change the result of CapacityForPopulation
 * without storing a second demographic count.
 */
RepresentativeCapacity.prototype.PeoplePerSlot = 100;

RepresentativeCapacity.prototype.Init = function()
{
};

/**
 * Sovereignty loads its regions in its own OnInitGame, and handler order is
 * not guaranteed. A zero-delay timer runs after that broadcast, once.
 * Loaded games skip this. The player serializes the resulting bonus, maximum,
 * and count, so a load does not apply them again.
 */
RepresentativeCapacity.prototype.OnInitGame = function()
{
	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (!cmpTimer)
	{
		this.RefreshAll();
		return;
	}

	cmpTimer.SetTimeout(SYSTEM_ENTITY, IID_RepresentativeCapacity, "RefreshAll", 0, null);
};

/**
 * Settlement demographic population changed. Recompute every sovereign.
 */
RepresentativeCapacity.prototype.OnGlobalNationPopulationChanged = function()
{
	this.RefreshAll();
};

/**
 * @return {number} - Native population slots for this many demographic people.
 */
RepresentativeCapacity.prototype.CapacityForPopulation = function(population)
{
	if (!Number.isInteger(population) || population < 0)
		return 0;
	return Math.floor(population / this.PeoplePerSlot);
};

/**
 * The native limit is the minimum of the maximum and the bonus total.
 * Both are replaced with the derivation. The match default maximum is 300,
 * which would hide a larger derivation, and a leftover building bonus would
 * raise the limit if the maximum stayed higher. This does not change the
 * current unit count.
 * @return {number}
 */
RepresentativeCapacity.prototype.RefreshPlayer = function(playerId)
{
	const cmpSettlements = Engine.QueryInterface(SYSTEM_ENTITY, IID_NationSettlementManager);
	const cmpPlayer = QueryPlayerIDInterface(playerId);
	if (!cmpSettlements || !cmpPlayer)
		return 0;

	const capacity = this.CapacityForPopulation(cmpSettlements.GetTotalPopulation(playerId));
	cmpPlayer.SetPopulationBonuses(capacity);
	cmpPlayer.SetMaxPopulation(capacity);
	return capacity;
};

RepresentativeCapacity.prototype.RefreshAll = function()
{
	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	if (!cmpPlayerManager)
		return;

	const count = cmpPlayerManager.GetNumPlayers();
	for (let playerId = 1; playerId < count; ++playerId)
		this.RefreshPlayer(playerId);
};

Engine.RegisterSystemComponentType(IID_RepresentativeCapacity, "RepresentativeCapacity", RepresentativeCapacity);
