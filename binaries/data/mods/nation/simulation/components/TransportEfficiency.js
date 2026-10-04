function TransportEfficiency() {}

TransportEfficiency.prototype.Schema =
	"<a:component type='system'/><empty/>";

TransportEfficiency.prototype.Init = function()
{
};

/**
 * Lowest infrastructure condition on the same-sovereign path to the capital, from 0 to 100.
 * No path yields 0. The capital is the stand-in for the abstract export market.
 * @return {number}
 */
TransportEfficiency.prototype.GetRouteCondition = function(settlement)
{
	const cmpConnectivity = Engine.QueryInterface(SYSTEM_ENTITY, IID_SettlementConnectivity);
	if (!cmpConnectivity)
		return 0;

	const path = cmpConnectivity.GetPathToCapital(settlement);
	if (!path || path.length < 2)
		return 0;

	let worst = 100;
	for (let i = 0; i < path.length - 1; ++i)
	{
		const condition = cmpConnectivity.GetHopCondition(path[i], path[i + 1]);
		if (condition === null || condition <= 0)
			return 0;
		if (condition < worst)
			worst = condition;
	}
	return worst;
};

/**
 * Route condition as a fraction from 0 to 1.
 * @return {number}
 */
TransportEfficiency.prototype.GetEfficiency = function(settlement)
{
	return this.GetRouteCondition(settlement) / 100;
};

Engine.RegisterSystemComponentType(IID_TransportEfficiency, "TransportEfficiency", TransportEfficiency);
