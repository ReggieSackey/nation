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

/**
 * A settlement or a marked infrastructure node can sit on a commercial corridor.
 * @return {boolean}
 */
TransportEfficiency.prototype.IsGraphNode = function(ent)
{
	if (!Number.isInteger(ent) || ent <= 0)
		return false;
	if (typeof IID_NationSettlement !== "undefined" && Engine.QueryInterface(ent, IID_NationSettlement))
		return true;
	if (typeof IID_InfrastructureNode === "undefined")
		return false;
	const node = Engine.QueryInterface(ent, IID_InfrastructureNode);
	return !!(node && node.IsNode());
};

/**
 * True when candidate is a strictly better corridor than current.
 * Higher bottleneck, then fewer links, then the smaller link-id sequence.
 * @return {boolean}
 */
TransportEfficiency.prototype.RouteBetter = function(candidate, current)
{
	if (!current)
		return true;
	if (candidate.condition !== current.condition)
		return candidate.condition > current.condition;
	if (candidate.hops !== current.hops)
		return candidate.hops < current.hops;
	const a = candidate.links;
	const b = current.links;
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; ++i)
		if (a[i] !== b[i])
			return a[i] < b[i];
	return a.length < b.length;
};

/**
 * Widest physical path between two commercial endpoints.
 * Recomputed from live link condition. Nothing is cached or serialized.
 * Condition 0 and a destroyed link are absent, so a severed corridor is disconnected.
 * The result condition is the worst remaining link. Ownership and sovereignty are ignored.
 * @return {{connected: boolean, condition: number, links: number[]}}
 */
TransportEfficiency.prototype.GetCommercialRoute = function(origin, destination)
{
	const empty = { "connected": false, "condition": 0, "links": [] };
	if (!Number.isInteger(origin) || !Number.isInteger(destination) ||
		origin <= 0 || destination <= 0 || origin === destination)
		return empty;
	if (!this.IsGraphNode(origin) || !this.IsGraphNode(destination))
		return empty;
	if (typeof IID_InfrastructureLink === "undefined")
		return empty;

	const ids = Engine.GetEntitiesWithInterface(IID_InfrastructureLink).slice().sort((a, b) => a - b);
	const adj = {};
	for (let i = 0; i < ids.length; ++i)
	{
		const link = Engine.QueryInterface(ids[i], IID_InfrastructureLink);
		if (!link || !link.IsUsable() || !link.IsOperational())
			continue;
		const condition = link.GetCondition();
		if (!Number.isInteger(condition) || condition <= 0)
			continue;
		const from = link.GetFrom();
		const to = link.GetTo();
		if (!this.IsGraphNode(from) || !this.IsGraphNode(to))
			continue;
		if (!adj[from])
			adj[from] = [];
		if (!adj[to])
			adj[to] = [];
		adj[from].push({ "to": to, "link": ids[i], "condition": condition });
		adj[to].push({ "to": from, "link": ids[i], "condition": condition });
	}
	for (const ent in adj)
		adj[ent].sort((a, b) => a.link - b.link);

	const best = {};
	best[origin] = { "condition": 100, "hops": 0, "links": [] };
	const queue = [origin];
	const queued = {};
	queued[origin] = true;
	while (queue.length)
	{
		let pick = 0;
		for (let i = 1; i < queue.length; ++i)
			if (this.RouteBetter(best[queue[i]], best[queue[pick]]))
				pick = i;
		const ent = queue.splice(pick, 1)[0];
		queued[ent] = false;
		const here = best[ent];
		const edges = adj[ent] || [];
		for (let i = 0; i < edges.length; ++i)
		{
			const edge = edges[i];
			if (here.links.indexOf(edge.link) !== -1)
				continue;
			const candidate = {
				"condition": Math.min(here.condition, edge.condition),
				"hops": here.hops + 1,
				"links": here.links.concat(edge.link)
			};
			if (!this.RouteBetter(candidate, best[edge.to]))
				continue;
			best[edge.to] = candidate;
			if (!queued[edge.to])
			{
				queue.push(edge.to);
				queued[edge.to] = true;
			}
		}
	}

	const found = best[destination];
	if (!found || !found.links.length || found.condition <= 0)
		return empty;
	return {
		"connected": true,
		"condition": found.condition,
		"links": found.links.slice()
	};
};

/**
 * Commercial corridor condition as a fraction from 0 to 1.
 * @return {number}
 */
TransportEfficiency.prototype.GetCommercialRouteEfficiency = function(origin, destination)
{
	return this.GetCommercialRoute(origin, destination).condition / 100;
};

Engine.RegisterSystemComponentType(IID_TransportEfficiency, "TransportEfficiency", TransportEfficiency);
