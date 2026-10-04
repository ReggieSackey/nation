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
	// Predefined projects for this match. Empty until InitGame copies scenario data.
	this.projects = [];
	// New games construct components after every script has loaded.
	AttachInfrastructureRepairToEntityState();
};

InfrastructureInvestment.prototype.OnInitGame = function()
{
	const settings = typeof InitAttributes !== "undefined" && InitAttributes.settings;
	this.ReadProjects(settings ? settings.InfrastructureProjects : undefined);
};

/**
 * @param {Object[]|undefined} projects
 * @return {boolean} - False when the list is present but malformed. Malformed data stores no projects.
 */
InfrastructureInvestment.prototype.ReadProjects = function(projects)
{
	this.projects = [];
	if (projects === undefined || projects === null)
		return true;
	if (!Array.isArray(projects))
	{
		error("InfrastructureInvestment: expected an array of projects");
		return false;
	}

	const parsed = [];
	const seen = {};
	for (let i = 0; i < projects.length; ++i)
	{
		const project = projects[i];
		const id = project && typeof project.id === "string" ? project.id : "";
		const from = project ? +project.from : NaN;
		const to = project ? +project.to : NaN;
		const cost = project ? +project.cost : NaN;
		const template = project && typeof project.template === "string" ? project.template : "";
		const x = project ? +project.x : NaN;
		const z = project ? +project.z : NaN;
		const angle = project ? +project.angle : NaN;
		if (!id || seen[id] ||
			!Number.isInteger(from) || from <= 0 ||
			!Number.isInteger(to) || to <= 0 || from === to ||
			!Number.isInteger(cost) || cost <= 0 ||
			!template ||
			!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(angle))
		{
			error("InfrastructureInvestment: project " + i + " is not a usable investment");
			return false;
		}
		seen[id] = true;
		parsed.push({
			"id": id,
			"from": from,
			"to": to,
			"cost": cost,
			"template": template,
			"x": x,
			"z": z,
			"angle": angle
		});
	}

	this.projects = parsed;
	return true;
};

/**
 * @return {Object|null}
 */
InfrastructureInvestment.prototype.GetProject = function(projectId)
{
	for (let i = 0; i < this.projects.length; ++i)
		if (this.projects[i].id === projectId)
			return this.projects[i];
	return null;
};

/**
 * The settlement named by the project's to field is the place the player invests in.
 * @return {Object|null}
 */
InfrastructureInvestment.prototype.ProjectForSettlement = function(entity)
{
	for (let i = 0; i < this.projects.length; ++i)
		if (this.projects[i].to === entity)
			return this.projects[i];
	return null;
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
/**
 * Both settlements must stand in the issuing player's sovereign territory.
 * Entity Ownership is not consulted.
 * @return {boolean}
 */
InfrastructureInvestment.prototype.EndpointsAuthorized = function(playerId, fromId, toId)
{
	if (!Number.isInteger(playerId) || playerId <= 0)
		return false;

	const from = Engine.QueryInterface(fromId, IID_NationSettlement);
	const to = Engine.QueryInterface(toId, IID_NationSettlement);
	if (!from || !to)
		return false;

	return from.GetSovereignOwner() === playerId && to.GetSovereignOwner() === playerId;
};

InfrastructureInvestment.prototype.HasAuthority = function(playerId, cmpLink)
{
	if (!cmpLink)
		return false;
	return this.EndpointsAuthorized(playerId, cmpLink.GetFrom(), cmpLink.GetTo());
};

/**
 * An existing usable link for this pair means the project is already built.
 * Condition 0 still counts: the road is there and is repaired, not bought again.
 * @return {number}
 */
InfrastructureInvestment.prototype.FindLink = function(from, to)
{
	const a = Math.min(from, to);
	const b = Math.max(from, to);
	for (const ent of Engine.GetEntitiesWithInterface(IID_InfrastructureLink))
	{
		const cmpLink = Engine.QueryInterface(ent, IID_InfrastructureLink);
		if (!cmpLink || !cmpLink.IsUsable())
			continue;
		const left = Math.min(cmpLink.GetFrom(), cmpLink.GetTo());
		const right = Math.max(cmpLink.GetFrom(), cmpLink.GetTo());
		if (left === a && right === b)
			return ent;
	}
	return INVALID_ENTITY;
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

/**
 * Read-only construction quote for the settlement the project invests in.
 * @return {Object|null}
 */
InfrastructureInvestment.prototype.GetConstructionQuote = function(playerId, entity)
{
	const project = this.ProjectForSettlement(entity);
	if (!project)
		return null;

	const cmpSettlement = Engine.QueryInterface(entity, IID_NationSettlement);
	const cmpFrom = Engine.QueryInterface(project.from, IID_NationSettlement);
	if (!cmpSettlement || !cmpFrom)
		return null;

	const completed = this.FindLink(project.from, project.to) !== INVALID_ENTITY;
	const authorized = this.EndpointsAuthorized(playerId, project.from, project.to);
	const available = authorized && !completed;
	const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
	const treasury = cmpFinance ? cmpFinance.GetTreasury(playerId) : 0;
	const cmpConnectivity = Engine.QueryInterface(SYSTEM_ENTITY, IID_SettlementConnectivity);
	return {
		"project": project.id,
		"available": available,
		"completed": completed,
		"authorized": authorized,
		"cost": project.cost,
		"canAfford": available && !!cmpFinance && cmpFinance.CanAfford(playerId, project.cost),
		"from": project.from,
		"to": project.to,
		"fromName": cmpFrom.GetName(),
		"name": cmpSettlement.GetName(),
		"population": cmpSettlement.GetPopulation(),
		"integration": cmpSettlement.GetStateIntegration(),
		"connected": !!cmpConnectivity && cmpConnectivity.IsConnectedToCapital(entity),
		"treasury": treasury
	};
};

/**
 * Spend treasury and spawn the project's physical road.
 * A failed check spends nothing. A failed spawn refunds the spend.
 * @return {boolean}
 */
InfrastructureInvestment.prototype.Construct = function(playerId, projectId)
{
	if (!Number.isInteger(playerId) || playerId <= 0 || typeof projectId !== "string" || !projectId)
		return false;

	const project = this.GetProject(projectId);
	if (!project || !this.EndpointsAuthorized(playerId, project.from, project.to))
		return false;
	if (this.FindLink(project.from, project.to) !== INVALID_ENTITY)
		return false;

	const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
	if (!cmpFinance || !cmpFinance.CanAfford(playerId, project.cost))
		return false;
	if (!cmpFinance.Spend(playerId, project.cost))
		return false;

	const ent = Engine.AddEntity(project.template);
	const cmpLink = ent ? Engine.QueryInterface(ent, IID_InfrastructureLink) : null;
	const cmpPosition = ent ? Engine.QueryInterface(ent, IID_Position) : null;
	const built = cmpLink && cmpLink.IsUsable() && cmpLink.GetCondition() === 100 &&
		Math.min(cmpLink.GetFrom(), cmpLink.GetTo()) === Math.min(project.from, project.to) &&
		Math.max(cmpLink.GetFrom(), cmpLink.GetTo()) === Math.max(project.from, project.to) &&
		cmpPosition && cmpPosition.JumpTo && cmpPosition.SetYRotation;
	if (!built)
	{
		if (ent)
			Engine.DestroyEntity(ent);
		cmpFinance.AddFunds(playerId, project.cost);
		return false;
	}

	cmpPosition.JumpTo(project.x, project.z);
	cmpPosition.SetYRotation(project.angle);
	const cmpOwnership = Engine.QueryInterface(ent, IID_Ownership);
	if (cmpOwnership)
		cmpOwnership.SetOwner(playerId);
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

	g_Commands["nation-construct-infrastructure"] = function(player, cmd)
	{
		const cmpInvestment = Engine.QueryInterface(SYSTEM_ENTITY, IID_InfrastructureInvestment);
		if (!cmpInvestment || !cmd || typeof cmd.project !== "string")
			return;
		cmpInvestment.Construct(player, cmd.project);
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
		const repair = cmpInvestment.GetRepairQuote(player, ent);
		if (repair)
			state.nationRepair = repair;
		const construction = cmpInvestment.GetConstructionQuote(player, ent);
		if (construction)
			state.nationConstruction = construction;
		return state;
	};
	wrapped.nationRepairWrapped = true;
	GuiInterface.prototype.GetEntityState = wrapped;
}

AttachInfrastructureRepairToEntityState();
