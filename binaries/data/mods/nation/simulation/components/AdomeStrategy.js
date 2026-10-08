function AdomeStrategy() {}

AdomeStrategy.prototype.Schema =
	"<a:component type='system'/><empty/>";

AdomeStrategy.prototype.EvaluationInterval = 20000;
AdomeStrategy.prototype.EarliestWarTime = 5400000;
AdomeStrategy.prototype.MinimumForce = 10;
AdomeStrategy.prototype.StableRatioNumerator = 3;
AdomeStrategy.prototype.StableRatioDenominator = 2;
AdomeStrategy.prototype.RebellionRatioNumerator = 6;
AdomeStrategy.prototype.RebellionRatioDenominator = 5;

AdomeStrategy.prototype.Init = function()
{
	this.enabled = false;
	this.player = 0;
	this.opponent = 0;
	this.startingTechnology = "";
	this.mode = "peace";
	this.target = 0;
	this.declaredWar = false;
	this.elapsed = 0;
	this.evaluations = 0;
	this.administrationOrdered = false;
	this.administrationSettlement = 0;
	this.timer = 0;
};

AdomeStrategy.prototype.Serialize = function()
{
	return {
		"enabled": this.enabled,
		"player": this.player,
		"opponent": this.opponent,
		"startingTechnology": this.startingTechnology,
		"mode": this.mode,
		"target": this.target,
		"declaredWar": this.declaredWar,
		"elapsed": this.elapsed,
		"evaluations": this.evaluations,
		"administrationOrdered": this.administrationOrdered,
		"administrationSettlement": this.administrationSettlement
	};
};

AdomeStrategy.prototype.Deserialize = function(data)
{
	this.Init();
	this.enabled = !!data.enabled;
	this.player = data.player;
	this.opponent = data.opponent;
	this.startingTechnology = data.startingTechnology || "";
	this.mode = data.mode;
	this.target = data.target;
	this.declaredWar = !!data.declaredWar;
	this.elapsed = data.elapsed;
	this.evaluations = data.evaluations;
	this.administrationOrdered = !!data.administrationOrdered;
	this.administrationSettlement = data.administrationSettlement || 0;
};

AdomeStrategy.prototype.OnInitGame = function()
{
	const settings = typeof InitAttributes !== "undefined" && InitAttributes.settings;
	const config = settings && settings.AdomeStrategy;
	if (!config || !Number.isInteger(config.player) || config.player <= 0 ||
		!Number.isInteger(config.opponent) || config.opponent <= 0 || config.player === config.opponent)
		return;
	if (config.enabled === false)
		return;
	this.enabled = true;
	this.player = config.player;
	this.opponent = config.opponent;
	this.startingTechnology = typeof config.startingTechnology === "string" ? config.startingTechnology : "";
	if (this.startingTechnology)
	{
		const cmpTechnology = QueryPlayerIDInterface(this.player, IID_TechnologyManager);
		if (cmpTechnology && !cmpTechnology.IsTechnologyResearched(this.startingTechnology))
			cmpTechnology.ResearchTechnology(this.startingTechnology);
	}
	this.Start();
};

AdomeStrategy.prototype.OnDeserialized = function()
{
	this.Start();
};

AdomeStrategy.prototype.Start = function()
{
	if (!this.enabled || this.timer)
		return;
	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (cmpTimer)
		this.timer = cmpTimer.SetInterval(SYSTEM_ENTITY, IID_AdomeStrategy,
			"Evaluate", this.EvaluationInterval, this.EvaluationInterval, null);
};

AdomeStrategy.prototype.CountMilitary = function(playerId)
{
	let count = 0;
	const entities = Engine.GetEntitiesWithInterface(IID_Identity).slice().sort((a, b) => a - b);
	for (const ent of entities)
	{
		const cmpIdentity = Engine.QueryInterface(ent, IID_Identity);
		const cmpOwnership = Engine.QueryInterface(ent, IID_Ownership);
		const cmpHealth = Engine.QueryInterface(ent, IID_Health);
		if (!cmpIdentity || !cmpIdentity.HasClass("Soldier") || !cmpOwnership ||
			cmpOwnership.GetOwner() !== playerId || !cmpHealth || cmpHealth.GetHitpoints() <= 0)
			continue;
		++count;
	}
	return count;
};

AdomeStrategy.prototype.HasRebellionOpportunity = function()
{
	const cmpRebellion = Engine.QueryInterface(SYSTEM_ENTITY, IID_RebellionManager);
	return !!(cmpRebellion && cmpRebellion.GetActiveCount(this.opponent) > 0);
};

AdomeStrategy.prototype.Position = function(entity)
{
	const cmpPosition = Engine.QueryInterface(entity, IID_Position);
	if (!cmpPosition || !cmpPosition.IsInWorld())
		return null;
	const pos = cmpPosition.GetPosition2D();
	return pos ? { "x": pos.x, "z": pos.y } : null;
};

AdomeStrategy.prototype.SelectTarget = function()
{
	const settlements = Engine.GetEntitiesWithInterface(IID_NationSettlement).slice().sort((a, b) => a - b);
	let origin = null;
	for (const ent of settlements)
	{
		const cmpSettlement = Engine.QueryInterface(ent, IID_NationSettlement);
		if (cmpSettlement && cmpSettlement.GetSovereignOwner() === this.player && cmpSettlement.GetIsCapital())
		{
			origin = this.Position(ent);
			break;
		}
	}
	if (!origin)
		return 0;

	let best = 0;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const ent of settlements)
	{
		const cmpSettlement = Engine.QueryInterface(ent, IID_NationSettlement);
		const pos = this.Position(ent);
		if (!cmpSettlement || !pos || cmpSettlement.GetSovereignOwner() !== this.opponent ||
			cmpSettlement.GetIsCapital())
			continue;
		const dx = pos.x - origin.x;
		const dz = pos.z - origin.z;
		const distance = dx * dx + dz * dz;
		if (distance < bestDistance)
		{
			best = ent;
			bestDistance = distance;
		}
	}
	return best;
};

AdomeStrategy.prototype.IsInvasionEligible = function(ownStrength, opponentStrength, rebellion)
{
	if (ownStrength < this.MinimumForce)
		return false;
	const numerator = rebellion ? this.RebellionRatioNumerator : this.StableRatioNumerator;
	const denominator = rebellion ? this.RebellionRatioDenominator : this.StableRatioDenominator;
	return ownStrength * denominator >= opponentStrength * numerator;
};

AdomeStrategy.prototype.DeclareWar = function()
{
	if (this.declaredWar)
		return false;
	const ownDiplomacy = QueryPlayerIDInterface(this.player, IID_Diplomacy);
	const opponentDiplomacy = QueryPlayerIDInterface(this.opponent, IID_Diplomacy);
	if (!ownDiplomacy || !opponentDiplomacy)
		return false;
	if (!ownDiplomacy.IsEnemy(this.opponent))
		ownDiplomacy.SetEnemy(this.opponent);
	if (!opponentDiplomacy.IsEnemy(this.player))
		opponentDiplomacy.SetEnemy(this.player);
	this.declaredWar = true;
	this.mode = "war";
	const cmpGui = Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface);
	if (cmpGui && cmpGui.PushNotification)
		cmpGui.PushNotification({
			"type": "text",
			"players": [this.opponent],
			"message": "Adomé has launched an invasion."
		});
	return true;
};

AdomeStrategy.prototype.FindOccupiedSettlement = function()
{
	const cmpOccupation = Engine.QueryInterface(SYSTEM_ENTITY, IID_MilitaryOccupation);
	if (!cmpOccupation)
		return 0;
	const settlements = Engine.GetEntitiesWithInterface(IID_NationSettlement).slice().sort((a, b) => a - b);
	if (this.target && cmpOccupation.IsOccupiedBy(this.target, this.player))
		return this.target;
	for (const ent of settlements)
	{
		const cmpSettlement = Engine.QueryInterface(ent, IID_NationSettlement);
		if (cmpSettlement && cmpSettlement.GetSovereignOwner() === this.opponent &&
			cmpOccupation.IsOccupiedBy(ent, this.player))
			return ent;
	}
	return 0;
};

AdomeStrategy.prototype.SelectAdministrationBuilder = function()
{
	const builders = Engine.GetEntitiesWithInterface(IID_Builder).slice().sort((a, b) => a - b);
	for (const ent of builders)
	{
		const cmpBuilder = Engine.QueryInterface(ent, IID_Builder);
		const cmpOwnership = Engine.QueryInterface(ent, IID_Ownership);
		const cmpHealth = Engine.QueryInterface(ent, IID_Health);
		if (cmpBuilder && cmpOwnership && cmpOwnership.GetOwner() === this.player &&
			cmpHealth && cmpHealth.GetHitpoints() > 0 &&
			cmpBuilder.GetEntitiesList().indexOf("structures/nation/foreign_administration") !== -1)
			return ent;
	}
	return 0;
};

AdomeStrategy.prototype.TryEstablishAdministration = function()
{
	if (this.administrationOrdered)
		return false;
	const settlement = this.FindOccupiedSettlement();
	const builder = settlement && this.SelectAdministrationBuilder();
	const pos = settlement && this.Position(settlement);
	const cmpTechnology = QueryPlayerIDInterface(this.player, IID_TechnologyManager);
	const cmpQueue = Engine.QueryInterface(SYSTEM_ENTITY, IID_CommandQueue);
	if (!settlement || !builder || !pos || !cmpTechnology ||
		!cmpTechnology.CanProduce("structures/nation/foreign_administration") ||
		!cmpQueue || !cmpQueue.PushLocalCommand)
		return false;
	cmpQueue.PushLocalCommand(this.player, {
		"type": "construct",
		"entities": [builder],
		"template": "structures/nation/foreign_administration",
		"x": pos.x + 24,
		"z": pos.z,
		"angle": 0,
		"autorepair": true,
		"autocontinue": false,
		"queued": false
	});
	this.administrationOrdered = true;
	this.administrationSettlement = settlement;
	return true;
};

AdomeStrategy.prototype.Evaluate = function()
{
	if (!this.enabled)
		return;
	if (this.declaredWar)
	{
		this.TryEstablishAdministration();
		return;
	}
	this.elapsed += this.EvaluationInterval;
	++this.evaluations;
	const ownStrength = this.CountMilitary(this.player);
	const opponentStrength = this.CountMilitary(this.opponent);
	const rebellion = this.HasRebellionOpportunity();
	this.target = this.SelectTarget();
	if (ownStrength >= this.MinimumForce)
		this.mode = "preparing";
	if (this.elapsed < this.EarliestWarTime || !this.target ||
		!this.IsInvasionEligible(ownStrength, opponentStrength, rebellion))
		return;
	this.DeclareWar();
};

AdomeStrategy.prototype.GetStatus = function()
{
	return {
		"enabled": this.enabled,
		"mode": this.mode,
		"target": this.target,
		"declaredWar": this.declaredWar,
		"elapsed": this.elapsed,
		"evaluations": this.evaluations,
		"ownStrength": this.enabled ? this.CountMilitary(this.player) : 0,
		"opponentStrength": this.enabled ? this.CountMilitary(this.opponent) : 0,
		"rebellion": this.enabled && this.HasRebellionOpportunity()
	};
};

Engine.RegisterSystemComponentType(IID_AdomeStrategy, "AdomeStrategy", AdomeStrategy);
