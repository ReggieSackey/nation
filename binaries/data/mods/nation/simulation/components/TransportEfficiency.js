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
 * Operational commercial edges. Ownership and sovereignty are not filters.
 * @return {Object}
 */
TransportEfficiency.prototype.CommercialAdjacency = function()
{
	const adj = {};
	if (typeof IID_InfrastructureLink === "undefined")
		return adj;
	const ids = Engine.GetEntitiesWithInterface(IID_InfrastructureLink).slice().sort((a, b) => a - b);
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
	return adj;
};

/**
 * Widest path. allowLink, when set, drops edges the caller may not use.
 * Nodes are ordered from the origin to the destination.
 * @return {{connected: boolean, condition: number, links: number[], nodes: number[]}}
 */
TransportEfficiency.prototype.WidestPath = function(origin, destination, allowLink)
{
	const empty = { "connected": false, "condition": 0, "links": [], "nodes": [] };
	if (!Number.isInteger(origin) || !Number.isInteger(destination) ||
		origin <= 0 || destination <= 0 || origin === destination)
		return empty;
	if (!this.IsGraphNode(origin) || !this.IsGraphNode(destination))
		return empty;

	const adj = this.CommercialAdjacency();
	const best = {};
	best[origin] = { "condition": 100, "hops": 0, "links": [], "nodes": [origin] };
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
			if (allowLink && !allowLink(edge.link))
				continue;
			if (here.links.indexOf(edge.link) !== -1)
				continue;
			const candidate = {
				"condition": Math.min(here.condition, edge.condition),
				"hops": here.hops + 1,
				"links": here.links.concat(edge.link),
				"nodes": here.nodes.concat(edge.to)
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
		"links": found.links.slice(),
		"nodes": found.nodes.slice()
	};
};

/**
 * World position of a route node. Position.y is the map z coordinate.
 * @return {{x: number, z: number}|null}
 */
TransportEfficiency.prototype.EntityPoint = function(ent)
{
	if (!Number.isInteger(ent) || ent <= 0 || typeof IID_Position === "undefined")
		return null;
	const cmpPosition = Engine.QueryInterface(ent, IID_Position);
	if (!cmpPosition || !cmpPosition.GetPosition2D)
		return null;
	if (cmpPosition.IsInWorld && !cmpPosition.IsInWorld())
		return null;
	const pos = cmpPosition.GetPosition2D();
	if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number" ||
		!isFinite(pos.x) || !isFinite(pos.y))
		return null;
	return { "x": pos.x, "z": pos.y };
};

/**
 * Approach distance for a corridor junction. The unit does not have to stand on the exact point.
 * Markets stay on the trader's own range. This is not a road-following tolerance.
 */
TransportEfficiency.prototype.WaypointRange = 8;

/**
 * Positions of every node that currently has one, in the given order.
 * A missing position is skipped. The caller still owns the node ids.
 * @return {Object[]}
 */
TransportEfficiency.prototype.NodePoints = function(nodes)
{
	const points = [];
	if (!nodes)
		return points;
	for (let i = 0; i < nodes.length; ++i)
	{
		const point = this.EntityPoint(nodes[i]);
		if (point)
			points.push(point);
	}
	return points;
};

/**
 * Intermediate junctions for an upstream trade order, oriented with the node list.
 * The first and last nodes are the markets. UnitAI walks to the market on its own.
 * @return {Object[]}
 */
TransportEfficiency.prototype.CorridorWaypoints = function(nodes)
{
	const points = [];
	if (!nodes || nodes.length < 3)
		return points;
	for (let i = 1; i < nodes.length - 1; ++i)
	{
		const point = this.EntityPoint(nodes[i]);
		if (!point)
			continue;
		points.push({
			"x": point.x,
			"z": point.z,
			"min": 0,
			"max": this.WaypointRange
		});
	}
	return points;
};

/**
 * Live condition and transit requirement of one already chosen link sequence.
 * A missing or closed link means the sequence is not operational.
 * @return {Object}
 */
TransportEfficiency.prototype.AssessLinks = function(links, seller, buyer)
{
	const failed = {
		"operational": false,
		"condition": 0,
		"missingTransit": [],
		"legallyUsable": false
	};
	if (!links || !links.length || typeof IID_InfrastructureLink === "undefined")
		return failed;

	let condition = 100;
	for (let i = 0; i < links.length; ++i)
	{
		const link = Engine.QueryInterface(links[i], IID_InfrastructureLink);
		if (!link || !link.IsUsable || !link.IsUsable() || !link.IsOperational || !link.IsOperational())
			return failed;
		const value = link.GetCondition();
		if (!Number.isInteger(value) || value <= 0)
			return failed;
		if (value < condition)
			condition = value;
	}

	const missingTransit = this.MissingTransit(this.TransitStates(links, seller, buyer), seller, null);
	return {
		"operational": true,
		"condition": condition,
		"missingTransit": missingTransit,
		"legallyUsable": missingTransit.length === 0
	};
};

/**
 * Sovereign of an entity's position. Zero when the entity has no place in a region.
 * Position.y is the map z coordinate.
 * @return {number}
 */
TransportEfficiency.prototype.SovereignAt = function(ent)
{
	if (!Number.isInteger(ent) || ent <= 0 || typeof IID_Position === "undefined" ||
		typeof IID_Sovereignty === "undefined")
		return 0;
	const cmpPosition = Engine.QueryInterface(ent, IID_Position);
	if (!cmpPosition || !cmpPosition.GetPosition2D)
		return 0;
	if (cmpPosition.IsInWorld && !cmpPosition.IsInWorld())
		return 0;
	const cmpSovereignty = Engine.QueryInterface(SYSTEM_ENTITY, IID_Sovereignty);
	if (!cmpSovereignty || !cmpSovereignty.GetSovereignOwner)
		return 0;
	const pos = cmpPosition.GetPosition2D();
	const owner = cmpSovereignty.GetSovereignOwner({ "x": pos.x, "z": pos.y });
	return Number.isInteger(owner) && owner > 0 ? owner : 0;
};

/**
 * Sovereigns touched by a link: its own position and both endpoints.
 * Entity ownership is not a sovereign.
 * @return {number[]}
 */
TransportEfficiency.prototype.LinkSovereigns = function(linkId)
{
	const found = [];
	const add = owner =>
	{
		if (owner > 0 && found.indexOf(owner) === -1)
			found.push(owner);
	};
	add(this.SovereignAt(linkId));
	const link = typeof IID_InfrastructureLink !== "undefined" &&
		Engine.QueryInterface(linkId, IID_InfrastructureLink);
	if (link)
	{
		add(this.SovereignAt(link.GetFrom()));
		add(this.SovereignAt(link.GetTo()));
	}
	found.sort((a, b) => a - b);
	return found;
};

/**
 * Third countries whose permission this commercial user needs for these links.
 * The seller and the buyer are not transit states for their own bilateral legs.
 * @return {number[]}
 */
TransportEfficiency.prototype.TransitStates = function(links, seller, buyer)
{
	const states = [];
	for (let i = 0; i < links.length; ++i)
	{
		const sovereigns = this.LinkSovereigns(links[i]);
		for (let s = 0; s < sovereigns.length; ++s)
		{
			const state = sovereigns[s];
			if (state === seller || state === buyer || states.indexOf(state) !== -1)
				continue;
			states.push(state);
		}
	}
	states.sort((a, b) => a - b);
	return states;
};

/**
 * @param {number[]|undefined} assumed - Grantors treated as already permitting user.
 * @return {number[]}
 */
TransportEfficiency.prototype.MissingTransit = function(states, user, assumed)
{
	const missing = [];
	const cmpTransit = typeof IID_TransitAccess !== "undefined" &&
		Engine.QueryInterface(SYSTEM_ENTITY, IID_TransitAccess);
	for (let i = 0; i < states.length; ++i)
	{
		const state = states[i];
		if (assumed && assumed.indexOf(state) !== -1)
			continue;
		if (cmpTransit && cmpTransit.CanTransit(user, state))
			continue;
		missing.push(state);
	}
	return missing;
};

/**
 * Widest physical path between two commercial endpoints.
 * Recomputed from live link condition. Nothing is cached or serialized.
 * Condition 0 and a destroyed link are absent, so a severed corridor is disconnected.
 * The result condition is the worst remaining link. Ownership and sovereignty are ignored.
 * @return {{connected: boolean, condition: number, links: number[], nodes: number[]}}
 */
TransportEfficiency.prototype.GetCommercialRoute = function(origin, destination)
{
	return this.WidestPath(origin, destination, null);
};

/**
 * The widest physical path, plus whether this seller may legally use it.
 * A missing transit right leaves the physical path visible.
 * @return {Object}
 */
TransportEfficiency.prototype.DescribeCommercialRoute = function(origin, destination, seller, buyer, assumed)
{
	const physical = this.GetCommercialRoute(origin, destination);
	const transitStates = physical.connected ? this.TransitStates(physical.links, seller, buyer) : [];
	const missingTransit = this.MissingTransit(transitStates, seller, assumed);
	return {
		"connected": physical.connected,
		"condition": physical.condition,
		"links": physical.links,
		"nodes": physical.nodes,
		"transitStates": transitStates,
		"missingTransit": missingTransit,
		"legallyUsable": physical.connected && missingTransit.length === 0
	};
};

/**
 * Widest path the seller may legally use. Illegal edges are left out of the search,
 * so a legal lower-capacity route is chosen over a wider route that lacks transit rights.
 * @return {Object}
 */
TransportEfficiency.prototype.GetUsableCommercialRoute = function(seller, origin, destination, buyer, assumed)
{
	const self = this;
	const path = this.WidestPath(origin, destination, linkId =>
		self.MissingTransit(self.TransitStates([linkId], seller, buyer), seller, assumed).length === 0);
	const transitStates = path.connected ? this.TransitStates(path.links, seller, buyer) : [];
	return {
		"connected": path.connected,
		"condition": path.condition,
		"links": path.links,
		"nodes": path.nodes,
		"transitStates": transitStates,
		"missingTransit": [],
		"legallyUsable": path.connected
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
