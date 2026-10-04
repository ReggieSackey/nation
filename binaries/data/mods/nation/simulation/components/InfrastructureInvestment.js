function InfrastructureInvestment() {}

InfrastructureInvestment.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * Prototype cost to restore a road from condition 0 to 100.
 * Partial damage costs the same fraction of the missing condition.
 */
InfrastructureInvestment.prototype.MaxRepairCost = 1000000;

InfrastructureInvestment.prototype.Init = function()
{
	// New games construct components after every script has loaded.
	AttachInfrastructureRepairToEntityState();
};

/**
 * Loaded games restore component data without Init.
 * The quote wrapper is a prototype change, so the first turn attaches it again.
 * It does not write simulation state.
 */
InfrastructureInvestment.prototype.OnUpdate = function()
{
	AttachInfrastructureRepairToEntityState();
};

/**
 * @return {number|null}
 */
InfrastructureInvestment.prototype.RepairCost = function(condition)
{
	if (!Number.isInteger(condition) || condition < 0 || condition > 100)
		return null;
	return Math.floor(this.MaxRepairCost * (100 - condition) / 100);
};

/**
 * Both endpoints must stand in the issuing player's sovereign territory.
 * Entity Ownership is not consulted.
 * @return {boolean}
 */
InfrastructureInvestment.prototype.HasAuthority = function(playerId, cmpLink)
{
	if (!Number.isInteger(playerId) || playerId <= 0 || !cmpLink)
		return false;

	const from = Engine.QueryInterface(cmpLink.GetFrom(), IID_NationSettlement);
	const to = Engine.QueryInterface(cmpLink.GetTo(), IID_NationSettlement);
	if (!from || !to)
		return false;

	return from.GetSovereignOwner() === playerId && to.GetSovereignOwner() === playerId;
};

/**
 * Read-only quote for the GUI. This does not spend money or change the road.
 * @return {Object|null}
 */
InfrastructureInvestment.prototype.GetRepairQuote = function(playerId, entity)
{
	const cmpLink = Engine.QueryInterface(entity, IID_InfrastructureLink);
	if (!cmpLink || !cmpLink.IsUsable())
		return null;

	const condition = cmpLink.GetCondition();
	const cost = this.RepairCost(condition);
	if (cost === null)
		return null;

	const authorized = this.HasAuthority(playerId, cmpLink);
	const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
	const treasury = cmpFinance ? cmpFinance.GetTreasury(playerId) : 0;
	const repairable = authorized && cost > 0;
	return {
		"authorized": authorized,
		"repairable": repairable,
		"condition": condition,
		"cost": cost,
		"canAfford": repairable && !!cmpFinance && cmpFinance.CanAfford(playerId, cost),
		"treasury": treasury
	};
};

/**
 * Validate, spend, then restore condition to 100.
 * A failed check leaves the treasury and the road unchanged.
 * @return {boolean}
 */
InfrastructureInvestment.prototype.Repair = function(playerId, entity)
{
	if (!Number.isInteger(playerId) || playerId <= 0 || !Number.isInteger(entity) || entity <= 0)
		return false;

	const cmpLink = Engine.QueryInterface(entity, IID_InfrastructureLink);
	if (!cmpLink || !cmpLink.IsUsable() || !this.HasAuthority(playerId, cmpLink))
		return false;

	const cost = this.RepairCost(cmpLink.GetCondition());
	if (cost === null || cost <= 0)
		return false;

	const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
	if (!cmpFinance || !cmpFinance.CanAfford(playerId, cost))
		return false;
	if (!cmpFinance.Spend(playerId, cost))
		return false;
	if (!cmpLink.SetCondition(100))
	{
		cmpFinance.AddFunds(playerId, cost);
		return false;
	}
	return true;
};

Engine.RegisterSystemComponentType(IID_InfrastructureInvestment, "InfrastructureInvestment", InfrastructureInvestment);

/**
 * Commands.js creates g_Commands while helpers load.
 * Components load after helpers, so the table exists before this file runs.
 * The lookup happens when the command arrives, including after a loaded game.
 */
function RegisterInfrastructureRepairCommand()
{
	if (typeof g_Commands === "undefined")
		return;

	g_Commands["nation-repair-infrastructure"] = function(player, cmd)
	{
		const cmpInvestment = Engine.QueryInterface(SYSTEM_ENTITY, IID_InfrastructureInvestment);
		if (!cmpInvestment || !cmd)
			return;
		const entity = +cmd.entity;
		if (!Number.isInteger(entity))
			return;
		cmpInvestment.Repair(player, entity);
	};
}

RegisterInfrastructureRepairCommand();

/**
 * GuiInterface.GetEntityState has no mod hook. Wrap it so the session GUI
 * can read an authoritative repair quote without a second cost formula.
 */
function AttachInfrastructureRepairToEntityState()
{
	if (typeof GuiInterface === "undefined" || !GuiInterface.prototype.GetEntityState)
		return;
	if (GuiInterface.prototype.GetEntityState.nationRepairWrapped)
		return;

	const original = GuiInterface.prototype.GetEntityState;
	const wrapped = function(player, ent)
	{
		const state = original.apply(this, arguments);
		if (!state)
			return state;
		const cmpInvestment = Engine.QueryInterface(SYSTEM_ENTITY, IID_InfrastructureInvestment);
		if (!cmpInvestment)
			return state;
		const quote = cmpInvestment.GetRepairQuote(player, ent);
		if (quote)
			state.nationRepair = quote;
		return state;
	};
	wrapped.nationRepairWrapped = true;
	GuiInterface.prototype.GetEntityState = wrapped;
}

AttachInfrastructureRepairToEntityState();
