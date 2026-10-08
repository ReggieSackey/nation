function RoadMovement() {}

RoadMovement.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * Simulation milliseconds between corridor re-evaluation.
 */
RoadMovement.prototype.UpdateInterval = 250;

/**
 * Modifier identity. Entity-scoped, so it never collides across units.
 */
RoadMovement.prototype.ModifierID = "nation/roadmovement";

RoadMovement.prototype.Init = function()
{
	this.currentMultiplier = new Map();
	this.StartTimer();
};

RoadMovement.prototype.Serialize = null;

RoadMovement.prototype.Deserialize = function()
{
	this.currentMultiplier = new Map();
	this.StartTimer();
};

RoadMovement.prototype.StartTimer = function()
{
	if (this.timer)
		return;
	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (!cmpTimer)
		return;
	this.timer = cmpTimer.SetInterval(
		SYSTEM_ENTITY,
		IID_RoadMovement,
		"UpdateAll",
		this.UpdateInterval,
		this.UpdateInterval,
		null
	);
};

/**
 * Squared distance from point to the segment a-b.
 * @param {number} px - Point x.
 * @param {number} pz - Point z.
 * @param {number} ax - Segment start x.
 * @param {number} az - Segment start z.
 * @param {number} bx - Segment end x.
 * @param {number} bz - Segment end z.
 * @return {number} - Squared distance to the segment.
 */
RoadMovement.prototype.PointToSegmentDistanceSquared = function(px, pz, ax, az, bx, bz)
{
	const dx = bx - ax;
	const dz = bz - az;
	const lengthSquared = dx * dx + dz * dz;
	if (lengthSquared === 0)
	{
		const ex = px - ax;
		const ez = pz - az;
		return ex * ex + ez * ez;
	}
	let t = ((px - ax) * dx + (pz - az) * dz) / lengthSquared;
	t = Math.max(0, Math.min(1, t));
	const cx = ax + t * dx;
	const cz = az + t * dz;
	const ex = px - cx;
	const ez = pz - cz;
	return ex * ex + ez * ez;
};

/**
 * Strongest walk-speed multiplier for a world position from the given
 * movement-enabled links. Corridor geometry is the segment between the
 * endpoints' positions, not the link actor's own position.
 * Deterministic: link data comes pre-sorted by entity id; the strongest
 * multiplier wins, ties keep the first found (lowest id).
 * @param {number} x - World x.
 * @param {number} z - World z.
 * @param {Array} links - Sorted [entityId, {ax, az, bx, bz, width, bonus, condition}].
 * @return {number} - Multiplier >= 1.
 */
RoadMovement.prototype.GetMultiplierAt = function(x, z, links)
{
	let best = 1;
	for (const link of links)
	{
		if (link.bonus <= 0 || link.condition <= 0)
			continue;
		const half = link.width / 2;
		if (this.PointToSegmentDistanceSquared(x, z, link.ax, link.az, link.bx, link.bz) > half * half)
			continue;
		const multiplier = 1 + link.bonus * link.condition / 100;
		if (multiplier > best)
			best = multiplier;
	}
	return best;
};

/**
 * Live corridor data of every movement-enabled link, sorted by entity id.
 * @return {Array}
 */
RoadMovement.prototype.CollectLinks = function()
{
	const links = [];
	for (const ent of Engine.GetEntitiesWithInterface(IID_InfrastructureLink))
	{
		const cmpLink = Engine.QueryInterface(ent, IID_InfrastructureLink);
		if (!cmpLink || !cmpLink.IsUsable())
			continue;
		const width = cmpLink.GetMovementWidth();
		const bonus = cmpLink.GetMovementSpeedBonus();
		if (width <= 0 || bonus <= 0)
			continue;

		const fromPos = this.EndpointPosition(cmpLink.GetFrom());
		const toPos = this.EndpointPosition(cmpLink.GetTo());
		if (!fromPos || !toPos)
			continue;

		links.push({
			"ent": ent,
			"ax": fromPos.x,
			"az": fromPos.z,
			"bx": toPos.x,
			"bz": toPos.z,
			"width": width,
			"bonus": bonus,
			"condition": cmpLink.GetCondition()
		});
	}
	links.sort((a, b) => a.ent - b.ent);
	return links;
};

RoadMovement.prototype.EndpointPosition = function(ent)
{
	if (!Number.isInteger(ent) || ent <= 0)
		return null;
	const cmpPosition = Engine.QueryInterface(ent, IID_Position);
	if (!cmpPosition || !cmpPosition.IsInWorld())
		return null;
	const pos = cmpPosition.GetPosition2D();
	// GetPosition2D stores map z in y.
	return { "x": pos.x, "z": pos.y };
};

/**
 * Re-evaluate every mobile unit's road multiplier and synchronise the
 * ModifiersManager. Only changed entities are touched.
 */
RoadMovement.prototype.UpdateAll = function()
{
	const cmpModifiersManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_ModifiersManager);
	if (!cmpModifiersManager)
		return;

	const links = this.CollectLinks();

	if (links.length === 0)
	{
		// No road can boost anything; clear stragglers in deterministic order.
		for (const ent of Array.from(this.currentMultiplier.keys()).sort((a, b) => a - b))
			this.SetMultiplier(cmpModifiersManager, ent, 1);
		return;
	}

	const previous = new Set(this.currentMultiplier.keys());
	const seen = new Set();

	for (const ent of Engine.GetEntitiesWithInterface(IID_UnitMotion))
	{
		const cmpPosition = Engine.QueryInterface(ent, IID_Position);
		if (!cmpPosition || !cmpPosition.IsInWorld())
			continue;

		const pos = cmpPosition.GetPosition2D();
		const multiplier = this.GetMultiplierAt(pos.x, pos.y, links);
		if (multiplier !== 1 || previous.has(ent))
			this.SetMultiplier(cmpModifiersManager, ent, multiplier);
		seen.add(ent);
	}

	// Units that left the world or lost UnitMotion keep no stale modifier.
	for (const ent of Array.from(previous).filter(ent => !seen.has(ent)).sort((a, b) => a - b))
		this.SetMultiplier(cmpModifiersManager, ent, 1);
};

/**
 * Apply, update, or clear this system's modifier on one entity.
 * @param {Component} cmpModifiersManager
 * @param {number} ent
 * @param {number} multiplier - 1 means no road bonus.
 */
RoadMovement.prototype.SetMultiplier = function(cmpModifiersManager, ent, multiplier)
{
	const current = this.currentMultiplier.get(ent) || 1;
	if (current === multiplier)
		return;

	if (multiplier === 1)
	{
		cmpModifiersManager.RemoveAllModifiers(this.ModifierID, ent);
		this.currentMultiplier.delete(ent);
	}
	else
	{
		// Single active value per entity: replace instead of stack.
		cmpModifiersManager.RemoveAllModifiers(this.ModifierID, ent);
		cmpModifiersManager.AddModifier(
			"UnitMotion/WalkSpeed",
			this.ModifierID,
			{ "multiply": multiplier },
			ent);
		this.currentMultiplier.set(ent, multiplier);
	}
};

Engine.RegisterSystemComponentType(IID_RoadMovement, "RoadMovement", RoadMovement);
