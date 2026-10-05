function SettlementConnectivity() {}

SettlementConnectivity.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * Prototype interval in simulation milliseconds.
 * This is sandbox timing, not a final gameplay duration.
 */
SettlementConnectivity.prototype.UpdatePeriod = 10000;

/**
 * Prototype integration gained by a capital-connected settlement each update.
 */
SettlementConnectivity.prototype.IntegrationGain = 1;

SettlementConnectivity.prototype.Init = function()
{
	// Scenario edges stay for the match. Physical edges follow InfrastructureLink condition.
	// Both store undirected pairs {a, b} with a < b. Entity ids, not settlement names.
	this.scenarioEdges = [];
	this.physicalEdges = {};
	// Timer id. Zero means no update is scheduled. Load restores this with Timer.
	this.timer = 0;
	// Sovereigns whose duplicate capitals were already reported.
	this.rejectedCapitals = {};
};

/**
 * Remember one undirected scenario edge. A second copy of the same pair is ignored.
 */
SettlementConnectivity.prototype.AddScenarioEdge = function(from, to)
{
	const a = Math.min(from, to);
	const b = Math.max(from, to);
	for (let i = 0; i < this.scenarioEdges.length; ++i)
		if (this.scenarioEdges[i].a === a && this.scenarioEdges[i].b === b)
			return;

	this.scenarioEdges.push({ "a": a, "b": b });
};

/**
 * @param {number} from
 * @param {number} to
 * @return {boolean}
 */
SettlementConnectivity.prototype.EndpointsAreSettlements = function(from, to)
{
	return !!Engine.QueryInterface(from, IID_NationSettlement) &&
		!!Engine.QueryInterface(to, IID_NationSettlement);
};

/**
 * @param {Object[]|undefined} links - {from, to} settlement entity ids. Undefined means no links.
 * @return {boolean} - False when the list is present but malformed. Malformed data adds no scenario edges.
 */
SettlementConnectivity.prototype.ReadScenarioEdges = function(links)
{
	if (links === undefined || links === null)
		return true;

	if (!Array.isArray(links))
	{
		error("SettlementConnectivity: expected an array of links");
		return false;
	}

	const edges = [];
	for (let i = 0; i < links.length; ++i)
	{
		const link = links[i];
		const from = link ? +link.from : NaN;
		const to = link ? +link.to : NaN;
		if (!Number.isInteger(from) || from <= 0 || !Number.isInteger(to) || to <= 0 || from === to)
		{
			error("SettlementConnectivity: link " + i + " needs two different settlement entity ids");
			return false;
		}
		if (!this.EndpointsAreSettlements(from, to))
		{
			error("SettlementConnectivity: link " + i + " must join NationSettlement entities");
			return false;
		}
		edges.push({ "from": from, "to": to });
	}

	for (let i = 0; i < edges.length; ++i)
		this.AddScenarioEdge(edges[i].from, edges[i].to);
	return true;
};

/**
 * Add or drop one physical edge from the link's current condition.
 * Condition above 0 contributes. Condition 0 does not. A scenario edge for the same pair is left in place.
 */
SettlementConnectivity.prototype.RefreshPhysicalLink = function(ent)
{
	delete this.physicalEdges[ent];
	const cmpLink = Engine.QueryInterface(ent, IID_InfrastructureLink);
	if (!cmpLink || !cmpLink.IsUsable() || !cmpLink.IsOperational())
		return;

	const from = cmpLink.GetFrom();
	const to = cmpLink.GetTo();
	if (!this.EndpointsAreSettlements(from, to))
		return;

	this.physicalEdges[ent] = {
		"a": Math.min(from, to),
		"b": Math.max(from, to)
	};
};

/**
 * Drop a physical edge when its entity is gone. Scenario edges are untouched.
 */
SettlementConnectivity.prototype.RemovePhysicalLink = function(ent)
{
	delete this.physicalEdges[ent];
};

/**
 * Physical InfrastructureLink entities contribute edges beside scenario data.
 * A bad link is skipped. Later condition changes call RefreshPhysicalLink directly.
 */
SettlementConnectivity.prototype.ReadPhysicalEdges = function()
{
	this.physicalEdges = {};
	for (const ent of Engine.GetEntitiesWithInterface(IID_InfrastructureLink))
	{
		const cmpLink = Engine.QueryInterface(ent, IID_InfrastructureLink);
		if (!cmpLink || !cmpLink.IsUsable())
			continue;

		const from = cmpLink.GetFrom();
		const to = cmpLink.GetTo();
		// A link that touches a depot or another non-settlement is commercial infrastructure.
		// It is not an administrative edge and it is not an error.
		if (!this.EndpointsAreSettlements(from, to))
			continue;
		this.RefreshPhysicalLink(ent);
	}
};

SettlementConnectivity.prototype.OnInitGame = function()
{
	this.scenarioEdges = [];
	this.physicalEdges = {};
	const settings = typeof InitAttributes !== "undefined" && InitAttributes.settings;
	this.ReadScenarioEdges(settings ? settings.SettlementConnectivity : undefined);
	this.ReadPhysicalEdges();
	this.StartUpdate();
};

/**
 * One repeating simulation timer for every settlement. A second call does not schedule another.
 */
SettlementConnectivity.prototype.StartUpdate = function()
{
	if (this.timer)
		return;

	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (!cmpTimer)
		return;

	this.timer = cmpTimer.SetInterval(
		SYSTEM_ENTITY,
		IID_SettlementConnectivity,
		"ApplyConnectivityGrowth",
		this.UpdatePeriod,
		this.UpdatePeriod,
		null
	);
};

/**
 * The one capital standing in land sovereign to playerId.
 * More than one is rejected: the call reports the error once and returns INVALID_ENTITY.
 * @return {number}
 */
SettlementConnectivity.prototype.GetCapitalForSovereign = function(playerId)
{
	const capitals = [];
	for (const ent of Engine.GetEntitiesWithInterface(IID_NationSettlement))
	{
		const cmpSettlement = Engine.QueryInterface(ent, IID_NationSettlement);
		if (!cmpSettlement || !cmpSettlement.GetIsCapital())
			continue;
		if (cmpSettlement.GetSovereignOwner() === playerId)
			capitals.push(ent);
	}

	if (capitals.length === 1)
		return capitals[0];
	if (capitals.length === 0)
		return INVALID_ENTITY;

	if (!this.rejectedCapitals[playerId])
	{
		this.rejectedCapitals[playerId] = true;
		error("SettlementConnectivity: sovereign " + playerId + " has more than one capital");
	}
	return INVALID_ENTITY;
};

/**
 * Scenario edges first, in stored order, then physical edges by ascending link entity id.
 * A pair named by both sources appears once.
 * @return {number[]}
 */
SettlementConnectivity.prototype.Neighbors = function(ent)
{
	const next = [];
	const seen = {};
	const edges = this.scenarioEdges.slice();
	const ids = Object.keys(this.physicalEdges).sort((left, right) => +left - +right);
	for (let i = 0; i < ids.length; ++i)
		edges.push(this.physicalEdges[ids[i]]);

	for (let i = 0; i < edges.length; ++i)
	{
		const edge = edges[i];
		let other = 0;
		if (edge.a === ent)
			other = edge.b;
		else if (edge.b === ent)
			other = edge.a;
		if (!other || seen[other])
			continue;
		seen[other] = true;
		next.push(other);
	}
	return next;
};

/**
 * Shortest same-sovereign path from the settlement to its capital, including both ends.
 * Neighbor order is deterministic: scenario edges, then physical links by entity id.
 * An empty array means there is no usable path. The capital is not a path to itself.
 * @return {number[]}
 */
SettlementConnectivity.prototype.GetPathToCapital = function(settlement)
{
	const cmpSettlement = Engine.QueryInterface(settlement, IID_NationSettlement);
	if (!cmpSettlement)
		return [];

	const owner = cmpSettlement.GetSovereignOwner();
	if (owner === INVALID_PLAYER)
		return [];

	const capital = this.GetCapitalForSovereign(owner);
	if (capital === INVALID_ENTITY || capital === settlement)
		return [];

	const seen = {};
	const parent = {};
	const queue = [settlement];
	seen[settlement] = true;
	while (queue.length)
	{
		const current = queue.shift();
		const neighbors = this.Neighbors(current);
		for (let i = 0; i < neighbors.length; ++i)
		{
			const next = neighbors[i];
			if (seen[next])
				continue;
			const cmpNext = Engine.QueryInterface(next, IID_NationSettlement);
			if (!cmpNext || cmpNext.GetSovereignOwner() !== owner)
				continue;
			parent[next] = current;
			if (next === capital)
			{
				const path = [];
				let node = capital;
				while (node !== undefined)
				{
					path.push(node);
					if (node === settlement)
						break;
					node = parent[node];
				}
				path.reverse();
				return path;
			}
			seen[next] = true;
			queue.push(next);
		}
	}
	return [];
};

/**
 * True when a same-sovereign path reaches that state's single capital.
 * The capital itself is not treated as connected. An edge into another sovereign state does not count.
 * A state with no capital, or with a rejected duplicate capital, connects nothing.
 * @return {boolean}
 */
SettlementConnectivity.prototype.IsConnectedToCapital = function(settlement)
{
	return this.GetPathToCapital(settlement).length > 0;
};

/**
 * Best condition on one hop, from 0 to 100. A scenario edge is 100.
 * A physical hop uses the best operational link on that pair. Null means the hop is absent.
 * @return {number|null}
 */
SettlementConnectivity.prototype.GetHopCondition = function(from, to)
{
	const a = Math.min(from, to);
	const b = Math.max(from, to);
	for (let i = 0; i < this.scenarioEdges.length; ++i)
		if (this.scenarioEdges[i].a === a && this.scenarioEdges[i].b === b)
			return 100;

	let best = null;
	const ids = Object.keys(this.physicalEdges);
	for (let i = 0; i < ids.length; ++i)
	{
		const edge = this.physicalEdges[ids[i]];
		if (!edge || edge.a !== a || edge.b !== b)
			continue;
		const cmpLink = Engine.QueryInterface(+ids[i], IID_InfrastructureLink);
		const condition = cmpLink ? cmpLink.GetCondition() : 0;
		if (best === null || condition > best)
			best = condition;
	}
	return best;
};

/**
 * Connected non-capital settlements gain IntegrationGain, clamped by the settlement.
 * The capital does not gain from being connected to itself.
 * Partial road damage does not change this. Only a missing path does.
 */
SettlementConnectivity.prototype.ApplyConnectivityGrowth = function()
{
	for (const ent of Engine.GetEntitiesWithInterface(IID_NationSettlement))
	{
		const cmpSettlement = Engine.QueryInterface(ent, IID_NationSettlement);
		if (!cmpSettlement || cmpSettlement.GetIsCapital())
			continue;
		if (!this.IsConnectedToCapital(ent))
			continue;
		cmpSettlement.ChangeStateIntegration(this.IntegrationGain);
	}
};

Engine.RegisterSystemComponentType(IID_SettlementConnectivity, "SettlementConnectivity", SettlementConnectivity);
