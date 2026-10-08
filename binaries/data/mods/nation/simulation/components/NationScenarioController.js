function NationScenarioController() {}

NationScenarioController.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * How often the scenario looks at the world. Not a food or discontent tick.
 */
NationScenarioController.prototype.ObserveInterval = 1000;

/**
 * Infrastructure below this condition is named on the map.
 * Healthy infrastructure is left unlabeled. Repair and transport are unchanged.
 */
NationScenarioController.prototype.CriticalCondition = 50;

NationScenarioController.prototype.Init = function()
{
	this.active = false;
	this.player = 0;
	this.capitalEntity = 0;
	this.reserveIntervals = 0;
	this.bands = [];
	this.outcome = "";
	this.outcomeReason = "";
	this.openingStock = -1;
	this.shortageOpen = false;
	this.capitalSeen = false;
	this.rebellionsSuppressed = 0;
	this.notified = {};
	this.previousActive = {};
	this.summary = null;
	this.timer = 0;
	AttachNationScenarioToSimulationState();
};

/**
 * Loaded games skip Init. The readout wrap is not saved state.
 */
NationScenarioController.prototype.OnUpdate = function()
{
	AttachNationScenarioToSimulationState();
};

NationScenarioController.prototype.OnInitGame = function()
{
	const settings = typeof InitAttributes !== "undefined" && InitAttributes.settings;
	this.ReadConfig(settings ? settings.NationScenario : undefined);
	if (this.active)
		this.Start();
};

/**
 * @param {Object|undefined} config
 * @return {boolean}
 */
NationScenarioController.prototype.ReadConfig = function(config)
{
	this.active = false;
	if (config === undefined || config === null)
		return true;
	if (!config || config.id !== "food_crisis")
	{
		error("NationScenarioController: unsupported scenario");
		return false;
	}

	const player = +config.player;
	const capital = +config.capitalEntity;
	const bands = config.discontentBands;
	if (!Number.isInteger(player) || player <= 0 ||
		!Number.isInteger(capital) || capital <= 0 ||
		!this.IsPositiveInt(config.reserveIntervals) ||
		!Array.isArray(bands) || !bands.length)
	{
		error("NationScenarioController: food crisis config is incomplete");
		return false;
	}

	const parsedBands = [];
	for (let i = 0; i < bands.length; ++i)
	{
		const band = +bands[i];
		if (!Number.isInteger(band) || band <= 0 || band > 100)
		{
			error("NationScenarioController: discontent band " + i + " is not usable");
			return false;
		}
		parsedBands.push(band);
	}
	parsedBands.sort((left, right) => left - right);

	this.player = player;
	this.capitalEntity = capital;
	this.reserveIntervals = config.reserveIntervals;
	this.bands = parsedBands;
	this.active = true;
	return true;
};

NationScenarioController.prototype.IsPositiveInt = function(value)
{
	return Number.isInteger(value) && value > 0;
};

NationScenarioController.prototype.Start = function()
{
	if (!this.active || this.timer)
		return;
	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (!cmpTimer)
		return;
	this.timer = cmpTimer.SetInterval(
		SYSTEM_ENTITY,
		IID_NationScenarioController,
		"Observe",
		this.ObserveInterval,
		this.ObserveInterval,
		null
	);
};

/**
 * @param {number} participant
 * @param {number} playerId
 * @return {boolean}
 */
NationScenarioController.prototype.SamePlayer = function(participant, playerId)
{
	if (participant === playerId)
		return true;
	if (typeof NationParticipantKey === "function")
		return NationParticipantKey(participant) === "player:" + playerId;
	return false;
};

/**
 * @return {Object|null}
 */
NationScenarioController.prototype.ReadWorld = function()
{
	if (!this.active)
		return null;

	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	const cmpFood = Engine.QueryInterface(SYSTEM_ENTITY, IID_PopulationFoodConsumption);
	const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
	const cmpSettlements = Engine.QueryInterface(SYSTEM_ENTITY, IID_NationSettlementManager);
	const cmpRebellion = Engine.QueryInterface(SYSTEM_ENTITY, IID_RebellionManager);
	const cmpDiscontent = Engine.QueryInterface(SYSTEM_ENTITY, IID_SettlementDiscontent);
	const cmpPlayer = QueryPlayerIDInterface(this.player);
	if (!cmpTimer || !cmpFood || !cmpFinance || !cmpSettlements || !cmpRebellion || !cmpPlayer)
		return null;

	const status = cmpFood.GetFoodStatus(this.player);
	if (!status)
		return null;
	const counts = cmpPlayer.GetResourceCounts();
	const food = counts && Number.isFinite(counts.food) ? Math.max(0, Math.floor(counts.food)) : 0;
	const ids = cmpSettlements.GetSettlementsForSovereign(this.player).slice();
	ids.sort((left, right) => left - right);

	const settlements = [];
	let activeRebellions = 0;
	for (let i = 0; i < ids.length; ++i)
	{
		const ent = ids[i];
		const cmpSettlement = Engine.QueryInterface(ent, IID_NationSettlement);
		if (!cmpSettlement)
			continue;
		const rebellion = cmpRebellion.GetStatus(ent);
		const active = !!(rebellion && rebellion.active);
		if (active)
			++activeRebellions;
		const integration = cmpSettlement.GetStateIntegration();
		const discontent = cmpSettlement.GetDiscontent();
		settlements.push({
			"id": ent,
			"name": cmpSettlement.GetName(),
			"population": cmpSettlement.GetPopulation(),
			"integration": integration,
			"discontent": discontent,
			"mood": this.Mood(discontent),
			"isCapital": !!(cmpSettlement.GetIsCapital && cmpSettlement.GetIsCapital()),
			"owner": this.EntityOwner(ent),
			"position": this.EntityPosition(ent),
			"rebellion": active,
			"foodPressure": cmpDiscontent && cmpDiscontent.FoodPressure ?
				cmpDiscontent.FoodPressure(status.shortageBps) : 0,
			"vulnerability": cmpDiscontent && cmpDiscontent.IntegrationPenalty ?
				cmpDiscontent.IntegrationPenalty(integration) : 0
		});
	}

	const debt = this.DebtOutstanding();
	const capital = Engine.QueryInterface(this.capitalEntity, IID_Health);
	return {
		"time": cmpTimer.GetTime(),
		"population": status.population,
		"food": food,
		"required": status.required,
		"consumed": status.consumed,
		"unmet": status.unmet,
		"shortageBps": status.shortageBps,
		"interval": status.interval,
		"treasury": cmpFinance.GetTreasury(this.player),
		"revenue": cmpFinance.GetRevenuePerTick(this.player),
		"settlements": settlements,
		"activeRebellions": activeRebellions,
		"debt": debt.total,
		"debtCreditor": debt.creditor,
		"capitalHitpoints": capital ? capital.GetHitpoints() : null
	};
};

NationScenarioController.prototype.DebtOutstanding = function()
{
	const cmpDebts = Engine.QueryInterface(SYSTEM_ENTITY, IID_DebtLedger);
	if (!cmpDebts || !cmpDebts.GetDebts)
		return { "total": 0, "creditor": "" };

	let total = 0;
	let creditor = "";
	const debts = cmpDebts.GetDebts();
	for (let i = 0; i < debts.length; ++i)
	{
		const debt = debts[i];
		if (!debt || debt.status !== "active" || !this.SamePlayer(debt.debtor, this.player))
			continue;
		total += debt.principalOutstanding;
		if (!creditor)
			creditor = this.CreditorName(debt.creditor);
	}
	return { "total": total, "creditor": creditor };
};

NationScenarioController.prototype.CreditorName = function(creditor)
{
	if (creditor && creditor.type === "foreign_actor")
	{
		const cmpActors = Engine.QueryInterface(SYSTEM_ENTITY, IID_ForeignActorManager);
		const actor = cmpActors && cmpActors.Get && cmpActors.Get(creditor.id);
		return actor && actor.name || creditor.id;
	}
	if (typeof creditor === "number")
	{
		const cmpIdentity = QueryPlayerIDInterface(creditor, IID_Identity);
		const name = cmpIdentity && cmpIdentity.GetName && cmpIdentity.GetName();
		return name || "";
	}
	return "";
};

/**
 * Same words as the crisis HUD. The number stays beside the word.
 * @return {string}
 */
NationScenarioController.prototype.Mood = function(discontent)
{
	if (discontent >= 80)
		return "Rebellion risk";
	if (discontent >= 70)
		return "Volatile";
	if (discontent >= 50)
		return "Restive";
	if (discontent >= 25)
		return "Uneasy";
	return "Calm";
};

/**
 * Map position from the entity. y on the 2D position is map z.
 * @return {{x: number, z: number}|null}
 */
NationScenarioController.prototype.EntityPosition = function(entity)
{
	const cmpPosition = Engine.QueryInterface(entity, IID_Position);
	if (!cmpPosition || !cmpPosition.GetPosition2D)
		return null;
	if (cmpPosition.IsInWorld && !cmpPosition.IsInWorld())
		return null;
	const point = cmpPosition.GetPosition2D();
	if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
		return null;
	return { "x": point.x, "z": point.y };
};

/**
 * @return {number}
 */
NationScenarioController.prototype.EntityOwner = function(entity)
{
	const ownership = Engine.QueryInterface(entity, IID_Ownership);
	if (!ownership || !ownership.GetOwner)
		return -1;
	return ownership.GetOwner();
};

/**
 * Settlements of other sovereigns, for a name-only map label.
 * Population, integration, and discontent stay off this list.
 * @return {Object[]}
 */
NationScenarioController.prototype.PlaceNames = function()
{
	if (!Engine.GetEntitiesWithInterface)
		return [];
	const found = Engine.GetEntitiesWithInterface(IID_NationSettlement);
	if (!found)
		return [];

	const places = [];
	for (let i = 0; i < found.length; ++i)
	{
		const ent = found[i];
		const cmpSettlement = Engine.QueryInterface(ent, IID_NationSettlement);
		if (!cmpSettlement || !cmpSettlement.GetSovereignOwner || !cmpSettlement.GetName)
			continue;
		if (cmpSettlement.GetSovereignOwner() === this.player)
			continue;
		const name = cmpSettlement.GetName();
		if (!name)
			continue;
		const position = this.EntityPosition(ent);
		if (!position)
			continue;
		places.push({
			"id": ent,
			"name": name,
			"position": position
		});
	}
	places.sort((left, right) => left.id - right.id);
	return places;
};

/**
 * SpecificName is the authored place name. A blank name is not labeled.
 * @return {string}
 */
NationScenarioController.prototype.LinkName = function(entity)
{
	const identity = Engine.QueryInterface(entity, IID_Identity);
	if (!identity || !identity.template || !identity.template.SpecificName)
		return "";
	return identity.template.SpecificName;
};

/**
 * Scenario player's infrastructure that is damaged enough to mark.
 * @return {Object[]}
 */
NationScenarioController.prototype.CriticalInfrastructure = function()
{
	const cmpRange = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	if (!cmpRange || !cmpRange.GetEntitiesByPlayer)
		return [];
	const ids = cmpRange.GetEntitiesByPlayer(this.player);
	if (!ids)
		return [];
	const found = [];
	for (let i = 0; i < ids.length; ++i)
	{
		const ent = ids[i];
		const link = Engine.QueryInterface(ent, IID_InfrastructureLink);
		if (!link || !link.GetCondition)
			continue;
		const condition = link.GetCondition();
		if (!(condition < this.CriticalCondition))
			continue;
		const owner = this.EntityOwner(ent);
		if (owner !== this.player)
			continue;
		const name = this.LinkName(ent);
		if (!name)
			continue;
		const position = this.EntityPosition(ent);
		if (!position)
			continue;
		found.push({
			"id": ent,
			"name": name,
			"condition": condition,
			"position": position,
			"owner": owner
		});
	}
	found.sort((left, right) => left.id - right.id);
	return found;
};

/**
 * @return {Object|null}
 */
NationScenarioController.prototype.GetView = function()
{
	const world = this.ReadWorld();
	if (!world)
		return null;

	let highest = null;
	for (let i = 0; i < world.settlements.length; ++i)
	{
		const settlement = world.settlements[i];
		if (!highest || settlement.discontent > highest.discontent ||
			(settlement.discontent === highest.discontent && settlement.id < highest.id))
			highest = settlement;
	}

	return {
		"active": true,
		"outcome": this.outcome,
		"outcomeReason": this.outcomeReason,
		"statusLine": this.StatusLine(world),
		"population": world.population,
		"food": world.food,
		"required": world.required,
		"consumed": world.consumed,
		"unmet": world.unmet,
		"shortageBps": world.shortageBps,
		"interval": world.interval,
		"reserve": world.required * this.reserveIntervals,
		"treasury": world.treasury,
		"revenue": world.revenue,
		"debt": world.debt,
		"debtCreditor": world.debtCreditor,
		"settlements": world.settlements,
		"places": this.PlaceNames(),
		"criticalInfrastructure": this.CriticalInfrastructure(),
		"activeRebellions": world.activeRebellions,
		"rebellionsSuppressed": this.rebellionsSuppressed,
		"highest": highest,
		"summary": this.summary
	};
};

NationScenarioController.prototype.StatusLine = function(world)
{
	if (this.outcome === "victory")
		return "The National Project is complete.";
	if (this.outcome === "loss")
		return this.outcomeReason;
	if (world.unmet > 0)
		return "People are going without food.";
	if (world.activeRebellions > 0)
		return "Rebels are under arms.";
	for (let i = 0; i < world.settlements.length; ++i)
		if (world.settlements[i].discontent >= 50)
			return "Unrest is spreading.";
	if (world.food < world.required * this.reserveIntervals)
		return "Food reserves are thin.";
	return "Build the country toward the National Project.";
};

NationScenarioController.prototype.Notify = function(message)
{
	const cmpGui = Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface);
	if (!cmpGui || !cmpGui.PushNotification)
		return;
	cmpGui.PushNotification({
		"type": "text",
		"message": message
	});
};

NationScenarioController.prototype.Finish = function(outcome, reason, world)
{
	if (this.outcome)
		return;
	this.outcome = outcome;
	this.outcomeReason = reason;
	const highest = this.Highest(world);
	this.summary = {
		"outcome": outcome,
		"reason": reason,
		"population": world.population,
		"food": world.food,
		"treasury": world.treasury,
		"debt": world.debt,
		"debtCreditor": world.debtCreditor,
		"highestName": highest ? highest.name : "",
		"highestDiscontent": highest ? highest.discontent : 0,
		"rebellionsSuppressed": this.rebellionsSuppressed,
		"activeRebellions": world.activeRebellions
	};
	this.Notify(reason);
};

NationScenarioController.prototype.Highest = function(world)
{
	let highest = null;
	for (let i = 0; i < world.settlements.length; ++i)
	{
		const settlement = world.settlements[i];
		if (!highest || settlement.discontent > highest.discontent ||
			(settlement.discontent === highest.discontent && settlement.id < highest.id))
			highest = settlement;
	}
	return highest;
};

NationScenarioController.prototype.BandLabel = function(band)
{
	if (band >= 80)
		return "at risk of rebellion";
	if (band >= 70)
		return "volatile";
	if (band >= 50)
		return "restless";
	return "uneasy";
};

/**
 * Look at food, money, unrest, and rebellion. Does not change them.
 */
NationScenarioController.prototype.Observe = function()
{
	if (!this.active || this.outcome)
		return;
	const world = this.ReadWorld();
	if (!world)
		return;

	if (this.openingStock < 0)
		this.openingStock = world.food;
	if (!this.notified.falling && this.openingStock > 0 &&
		world.food * 4 <= this.openingStock * 3 && world.unmet === 0)
	{
		this.notified.falling = true;
		this.Notify("Food reserves are falling.");
	}

	if (world.unmet > 0)
	{
		if (!this.shortageOpen)
		{
			this.shortageOpen = true;
			this.Notify("Food shortage. " + world.unmet + " food unmet.");
		}
	}
	else
		this.shortageOpen = false;

	for (let i = 0; i < world.settlements.length; ++i)
	{
		const settlement = world.settlements[i];
		for (let band = 0; band < this.bands.length; ++band)
		{
			const threshold = this.bands[band];
			const key = settlement.id + ":" + threshold;
			if (settlement.discontent >= threshold)
			{
				if (!this.notified[key])
				{
					this.notified[key] = true;
					this.Notify(settlement.name + " is " + this.BandLabel(threshold) + ".");
				}
			}
		}

		const wasActive = !!this.previousActive[settlement.id];
		if (settlement.rebellion && !wasActive)
			this.Notify("Rebels have appeared near " + settlement.name + ".");
		if (!settlement.rebellion && wasActive)
		{
			++this.rebellionsSuppressed;
			this.Notify("The rebels near " + settlement.name + " have been defeated.");
		}
		this.previousActive[settlement.id] = settlement.rebellion;
	}


};

Engine.RegisterSystemComponentType(
	IID_NationScenarioController, "NationScenarioController", NationScenarioController);

function AttachNationScenarioToSimulationState()
{
	if (typeof GuiInterface === "undefined" || !GuiInterface.prototype.GetSimulationState)
		return;
	if (GuiInterface.prototype.GetSimulationState.nationScenarioWrapped)
		return;

	const original = GuiInterface.prototype.GetSimulationState;
	const wrapped = function()
	{
		const state = original.apply(this, arguments);
		if (!state)
			return state;
		const cmpScenario = Engine.QueryInterface(SYSTEM_ENTITY, IID_NationScenarioController);
		if (cmpScenario && cmpScenario.GetView)
			state.nationCrisis = cmpScenario.GetView();
		return state;
	};
	wrapped.nationScenarioWrapped = true;
	if (original.nationFoodWrapped)
		wrapped.nationFoodWrapped = true;
	if (original.nationFoodImportWrapped)
		wrapped.nationFoodImportWrapped = true;
	if (original.nationDiscontentWrapped)
		wrapped.nationDiscontentWrapped = true;
	if (original.nationRebellionWrapped)
		wrapped.nationRebellionWrapped = true;
	GuiInterface.prototype.GetSimulationState = wrapped;
}

AttachNationScenarioToSimulationState();
