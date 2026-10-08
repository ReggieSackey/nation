// A single physical project uses the ordinary construction command and Cost.
// The command wrapper adds the two Nation prerequisites that Cost cannot hold.
var NationNationalProject = {
	"template": "structures/nation/national_project",
	"treasury": 1500000,
	"people": 45000
};

function AttachNationNationalProjectToConstruct()
{
	if (typeof g_Commands === "undefined" || !g_Commands.construct ||
		g_Commands.construct.nationProjectWrapped)
		return;
	const original = g_Commands.construct;
	const wrapped = function(player, cmd, data)
	{
		if (!cmd || cmd.template !== NationNationalProject.template)
			return original.apply(this, arguments);
		if (player !== 1)
			return false;
		const cmpTech = QueryPlayerIDInterface(player, IID_TechnologyManager);
		const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
		const cmpSettlements = Engine.QueryInterface(SYSTEM_ENTITY, IID_NationSettlementManager);
		if (!cmpTech || !cmpTech.CanProduce(cmd.template) || !cmpFinance || !cmpSettlements ||
			cmpSettlements.GetTotalPopulation(player) < NationNationalProject.people ||
			!cmpFinance.CanAfford(player, NationNationalProject.treasury))
			return false;
		// The existing construction path validates workers, sovereign placement,
		// entity limits, and ordinary resources before returning the foundation.
		if (!cmpFinance.Spend(player, NationNationalProject.treasury))
			return false;
		const foundation = TryConstructBuilding(player, data.cmpPlayer, data.controlAllUnits, cmd);
		if (!foundation)
		{
			cmpFinance.AddFunds(player, NationNationalProject.treasury);
			return false;
		}
		return foundation;
	};
	wrapped.nationProjectWrapped = true;
	g_Commands.construct = wrapped;
}

AttachNationNationalProjectToConstruct();
