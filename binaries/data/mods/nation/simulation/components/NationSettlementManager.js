function NationSettlementManager() {}

NationSettlementManager.prototype.Schema =
	"<a:component type='system'/><empty/>";

NationSettlementManager.prototype.Init = function()
{
};

/**
 * Entity ids of settlements standing in land sovereign to playerId.
 * Membership comes from position, not from entity Ownership.
 * @return {number[]}
 */
NationSettlementManager.prototype.GetSettlementsForSovereign = function(playerId)
{
	const ids = [];
	for (const ent of Engine.GetEntitiesWithInterface(IID_NationSettlement))
	{
		const cmpSettlement = Engine.QueryInterface(ent, IID_NationSettlement);
		if (cmpSettlement && cmpSettlement.GetSovereignOwner() === playerId)
			ids.push(ent);
	}
	return ids;
};

/**
 * @return {number} - Sum of settlement populations in this sovereign territory. Zero when there are none.
 */
NationSettlementManager.prototype.GetTotalPopulation = function(playerId)
{
	let total = 0;
	for (const ent of this.GetSettlementsForSovereign(playerId))
		total += Engine.QueryInterface(ent, IID_NationSettlement).GetPopulation();
	return total;
};

/**
 * Population-weighted mean integration. Null when this sovereign has no settlement population.
 * @return {number|null}
 */
NationSettlementManager.prototype.GetPopulationWeightedIntegration = function(playerId)
{
	let population = 0;
	let weighted = 0;
	for (const ent of this.GetSettlementsForSovereign(playerId))
	{
		const cmpSettlement = Engine.QueryInterface(ent, IID_NationSettlement);
		const count = cmpSettlement.GetPopulation();
		population += count;
		weighted += count * cmpSettlement.GetStateIntegration();
	}
	if (population === 0)
		return null;
	return weighted / population;
};

Engine.RegisterSystemComponentType(IID_NationSettlementManager, "NationSettlementManager", NationSettlementManager);
