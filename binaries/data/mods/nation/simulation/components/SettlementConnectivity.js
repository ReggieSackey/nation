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
	// Undirected edges {a, b} with a < b. Entity ids, not settlement names.
	this.edges = [];
	// Timer id. Zero means no update is scheduled. Load restores this with Timer.
	this.timer = 0;
	// Sovereigns whose duplicate capitals were already reported.
	this.rejectedCapitals = {};
};

/**
 * @param {Object[]|undefined} links - {from, to} settlement entity ids. Undefined means no links.
 * @return {boolean} - False when the list is present but malformed. Malformed data stores no links.
 */
SettlementConnectivity.prototype.ReadEdges = function(links)
{
	if (links === undefined || links === null)
	{
		this.edges = [];
		return true;
	}

	if (!Array.isArray(links))
	{
		error("SettlementConnectivity: expected an array of links");
		this.edges = [];
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
			this.edges = [];
			return false;
		}
		if (!Engine.QueryInterface(from, IID_NationSettlement) || !Engine.QueryInterface(to, IID_NationSettlement))
		{
			error("SettlementConnectivity: link " + i + " must join NationSettlement entities");
			this.edges = [];
			return false;
		}

		const a = Math.min(from, to);
		const b = Math.max(from, to);
		let duplicate = false;
		for (let j = 0; j < edges.length; ++j)
			if (edges[j].a === a && edges[j].b === b)
				duplicate = true;
		if (!duplicate)
			edges.push({ "a": a, "b": b });
	}

	this.edges = edges;
	return true;
};

SettlementConnectivity.prototype.OnInitGame = function()
{
	const settings = typeof InitAttributes !== "undefined" && InitAttributes.settings;
	this.ReadEdges(settings ? settings.SettlementConnectivity : undefined);
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
 * @return {number[]} - The other end of each stored edge. Order follows the edge list.
 */
SettlementConnectivity.prototype.Neighbors = function(ent)
{
	const next = [];
	for (let i = 0; i < this.edges.length; ++i)
	{
		const edge = this.edges[i];
		if (edge.a === ent)
			next.push(edge.b);
		else if (edge.b === ent)
			next.push(edge.a);
	}
	return next;
};

/**
 * True when a same-sovereign path reaches that state's single capital.
 * The capital itself is not treated as connected. An edge into another sovereign state does not count.
 * A state with no capital, or with a rejected duplicate capital, connects nothing.
 * @return {boolean}
 */
SettlementConnectivity.prototype.IsConnectedToCapital = function(settlement)
{
	const cmpSettlement = Engine.QueryInterface(settlement, IID_NationSettlement);
	if (!cmpSettlement)
		return false;

	const owner = cmpSettlement.GetSovereignOwner();
	if (owner === INVALID_PLAYER)
		return false;

	const capital = this.GetCapitalForSovereign(owner);
	if (capital === INVALID_ENTITY || capital === settlement)
		return false;

	const seen = {};
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
			if (next === capital)
				return true;
			seen[next] = true;
			queue.push(next);
		}
	}
	return false;
};

/**
 * Connected non-capital settlements gain IntegrationGain, clamped by the settlement.
 * The capital does not gain from being connected to itself.
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
