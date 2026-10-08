// Additional phase costs use the existing TechnologyManager research queue.
// Resource costs remain in technology templates; treasury and demographic people
// are checked here because neither is an ordinary Player resource.
var NationPhaseRequirements = {
	"phase_town_athen": { "treasury": 300000, "people": 20000 },
	"phase_town_generic": { "treasury": 300000, "people": 20000 },
	"phase_city_athen": { "treasury": 800000, "people": 40000 },
	"phase_city_generic": { "treasury": 800000, "people": 40000 }
};

function NationPhaseReady(tech, playerEntity)
{
	const cost = NationPhaseRequirements[tech];
	if (!cost)
		return true;
	const cmpPlayer = Engine.QueryInterface(playerEntity, IID_Player);
	const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
	const cmpSettlements = Engine.QueryInterface(SYSTEM_ENTITY, IID_NationSettlementManager);
	if (!cmpPlayer || !cmpFinance || !cmpSettlements)
		return false;
	const id = cmpPlayer.GetPlayerID();
	return cmpFinance.CanAfford(id, cost.treasury) &&
		cmpSettlements.GetTotalPopulation(id) >= cost.people;
}

const nationOriginalCanResearch = TechnologyManager.prototype.CanResearch;
TechnologyManager.prototype.CanResearch = function(tech)
{
	return nationOriginalCanResearch.call(this, tech) && NationPhaseReady(tech, this.entity);
};

const nationOriginalQueue = TechnologyManager.prototype.Technology.prototype.Queue;
TechnologyManager.prototype.Technology.prototype.Queue = function(multiplier)
{
	const cost = NationPhaseRequirements[this.templateName];
	if (cost && !NationPhaseReady(this.templateName, this.player))
		return false;
	if (!nationOriginalQueue.call(this, multiplier))
		return false;
	if (!cost)
		return true;
	const cmpPlayer = Engine.QueryInterface(this.player, IID_Player);
	const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
	if (!cmpFinance.Spend(cmpPlayer.GetPlayerID(), cost.treasury))
	{
		Engine.QueryInterface(this.player, IID_Player).RefundResources(this.resources);
		return false;
	}
	this.nationTreasurySpent = cost.treasury;
	return true;
};

const nationOriginalStop = TechnologyManager.prototype.Technology.prototype.Stop;
TechnologyManager.prototype.Technology.prototype.Stop = function()
{
	if (this.nationTreasurySpent)
	{
		const cmpPlayer = Engine.QueryInterface(this.player, IID_Player);
		Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance)
			.AddFunds(cmpPlayer.GetPlayerID(), this.nationTreasurySpent);
		this.nationTreasurySpent = 0;
	}
	nationOriginalStop.call(this);
};
TechnologyManager.prototype.Technology.prototype.SerializableAttributes.push("nationTreasurySpent");
