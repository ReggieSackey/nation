function MilitaryOccupation() {}

MilitaryOccupation.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * Qualifying foreign soldiers inside this distance of a settlement can occupy it.
 * World units, center to center.
 */
MilitaryOccupation.prototype.OccupationRadius = 60;

/**
 * Minimum living Soldier units. Two are not enough.
 */
MilitaryOccupation.prototype.OccupationThreshold = 3;

/**
 * A new foreign office must stand within this distance of the occupied settlement.
 */
MilitaryOccupation.prototype.AdministrationRadius = 80;

/**
 * Upstream infantry expose this class. Support workers do not.
 */
MilitaryOccupation.prototype.SoldierClass = "Soldier";

MilitaryOccupation.prototype.TemplateName = "structures/nation/foreign_administration";

/**
 * No occupier. Distinct from INVALID_PLAYER, which means unclaimed land.
 */
MilitaryOccupation.prototype.None = 0;

MilitaryOccupation.prototype.Init = function()
{
};

MilitaryOccupation.prototype.RebelPlayer = function()
{
	const cmpRebellion = Engine.QueryInterface(SYSTEM_ENTITY, IID_RebellionManager);
	const rebel = cmpRebellion && cmpRebellion.GetRebelPlayer();
	return Number.isInteger(rebel) && rebel > 0 ? rebel : 0;
};

/**
 * Both sides treat the other as an enemy. Neutrality and military access do not qualify.
 */
MilitaryOccupation.prototype.IsMutuallyHostile = function(first, second)
{
	const firstDiplomacy = QueryPlayerIDInterface(first, IID_Diplomacy);
	const secondDiplomacy = QueryPlayerIDInterface(second, IID_Diplomacy);
	return !!(firstDiplomacy && secondDiplomacy &&
		firstDiplomacy.IsEnemy(second) && secondDiplomacy.IsEnemy(first));
};

MilitaryOccupation.prototype.SettlementPosition = function(settlement)
{
	const cmpPosition = Engine.QueryInterface(settlement, IID_Position);
	if (!cmpPosition || !cmpPosition.IsInWorld())
		return null;
	const pos = cmpPosition.GetPosition2D();
	if (!pos)
		return null;
	// GetPosition2D stores map z in y.
	return { "x": pos.x, "z": pos.y };
};

MilitaryOccupation.prototype.Distance = function(ax, az, bx, bz)
{
	const dx = ax - bx;
	const dz = az - bz;
	return Math.sqrt(dx * dx + dz * dz);
};

/**
 * Living mobile soldiers of one owner, inside the occupation radius.
 * The range query limits the search. Distance is checked again here.
 */
MilitaryOccupation.prototype.CountSoldiers = function(settlementPos, owner)
{
	const cmpRange = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	if (!cmpRange)
		return 0;

	const nearby = cmpRange.ExecuteQueryAroundPos(
		{ "x": settlementPos.x, "y": settlementPos.z },
		0,
		this.OccupationRadius,
		[owner],
		IID_Identity,
		false
	) || [];

	let count = 0;
	for (const ent of nearby)
	{
		const cmpIdentity = Engine.QueryInterface(ent, IID_Identity);
		const cmpMotion = Engine.QueryInterface(ent, IID_UnitMotion);
		const cmpHealth = Engine.QueryInterface(ent, IID_Health);
		const cmpOwnership = Engine.QueryInterface(ent, IID_Ownership);
		const pos = this.SettlementPosition(ent);
		if (!cmpIdentity || !cmpIdentity.HasClass(this.SoldierClass) || !cmpMotion || !cmpHealth || !pos)
			continue;
		if (cmpHealth.GetHitpoints() <= 0)
			continue;
		if (!cmpOwnership || cmpOwnership.GetOwner() !== owner)
			continue;
		if (this.Distance(settlementPos.x, settlementPos.z, pos.x, pos.z) > this.OccupationRadius)
			continue;
		++count;
	}
	return count;
};

/**
 * Highest count at or above the threshold. Equal counts use the lower player id.
 * @return {number} - Occupier, or 0 when the settlement is not occupied.
 */
MilitaryOccupation.prototype.GetOccupier = function(settlement)
{
	const cmpSettlement = Engine.QueryInterface(settlement, IID_NationSettlement);
	if (!cmpSettlement)
		return this.None;

	const sovereign = cmpSettlement.GetSovereignOwner();
	if (!Number.isInteger(sovereign) || sovereign <= 0)
		return this.None;

	const pos = this.SettlementPosition(settlement);
	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	if (!pos || !cmpPlayerManager)
		return this.None;

	const rebel = this.RebelPlayer();
	const numPlayers = cmpPlayerManager.GetNumPlayers();
	let bestPlayer = this.None;
	let bestCount = 0;
	for (let player = 1; player < numPlayers; ++player)
	{
		if (player === sovereign || player === rebel)
			continue;
		if (!this.IsMutuallyHostile(player, sovereign))
			continue;
		const count = this.CountSoldiers(pos, player);
		if (count < this.OccupationThreshold)
			continue;
		if (count > bestCount)
		{
			bestCount = count;
			bestPlayer = player;
		}
	}
	return bestPlayer;
};

MilitaryOccupation.prototype.IsOccupied = function(settlement)
{
	return this.GetOccupier(settlement) !== this.None;
};

MilitaryOccupation.prototype.IsOccupiedBy = function(settlement, playerId)
{
	return this.GetOccupier(settlement) === playerId;
};

/**
 * Foreign administration may be placed on another state's land, beside a settlement that player occupies.
 * TerritoryManager is not consulted. An established office is not removed when the troops later leave.
 * @return {boolean}
 */
MilitaryOccupation.prototype.MayPlace = function(playerId, x, z)
{
	if (!Number.isInteger(playerId) || playerId <= 0)
		return false;
	if (!Number.isFinite(+x) || !Number.isFinite(+z))
		return false;

	const cmpSovereignty = Engine.QueryInterface(SYSTEM_ENTITY, IID_Sovereignty);
	if (!cmpSovereignty)
		return false;

	const sovereign = cmpSovereignty.GetSovereignOwner({ "x": +x, "z": +z });
	if (!Number.isInteger(sovereign) || sovereign <= 0 || sovereign === playerId)
		return false;

	const settlements = Engine.GetEntitiesWithInterface(IID_NationSettlement).slice().sort((a, b) => a - b);
	for (const settlement of settlements)
	{
		const cmpSettlement = Engine.QueryInterface(settlement, IID_NationSettlement);
		const pos = this.SettlementPosition(settlement);
		if (!cmpSettlement || !pos || cmpSettlement.GetSovereignOwner() !== sovereign)
			continue;
		if (this.Distance(x, z, pos.x, pos.z) > this.AdministrationRadius)
			continue;
		if (this.IsOccupiedBy(settlement, playerId))
			return true;
	}
	return false;
};

Engine.RegisterSystemComponentType(IID_MilitaryOccupation, "MilitaryOccupation", MilitaryOccupation);

/**
 * Commands.js creates g_Commands while helpers load.
 * Components load afterwards, so the construct command can be wrapped here.
 */
function AttachMilitaryOccupationToConstruct()
{
	if (typeof g_Commands === "undefined" || !g_Commands.construct)
		return;
	if (g_Commands.construct.nationOccupationWrapped)
		return;

	const original = g_Commands.construct;
	const wrapped = function(player, cmd, data)
	{
		if (cmd && cmd.template === MilitaryOccupation.prototype.TemplateName)
		{
			const cmpOccupation = Engine.QueryInterface(SYSTEM_ENTITY, IID_MilitaryOccupation);
			if (!cmpOccupation || !cmpOccupation.MayPlace(player, cmd.x, cmd.z))
				return false;

			// Upstream construct does not return when CanProduce fails, and this
			// building costs nothing, so the phase gate is enforced here as well.
			const cmpTech = QueryPlayerIDInterface(player, IID_TechnologyManager);
			if (cmpTech && !cmpTech.CanProduce(cmd.template))
				return false;
		}
		return original.apply(this, arguments);
	};
	wrapped.nationOccupationWrapped = true;
	if (original.nationDomesticWrapped)
		wrapped.nationDomesticWrapped = true;
	g_Commands.construct = wrapped;
}

AttachMilitaryOccupationToConstruct();
