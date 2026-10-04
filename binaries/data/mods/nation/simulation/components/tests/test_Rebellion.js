Resources = {
	"GetCodes": () => ["food", "wood", "stone", "metal"],
	"GetTradableCodes": () => ["food", "wood", "stone", "metal"],
	"GetBarterableCodes": () => ["food", "wood", "stone", "metal"],
	"GetResource": () => ({
		"name": "Food",
		"subtypes": { "grain": "Grain" }
	}),
	"BuildSchema": type =>
	{
		let schema = "";
		for (const res of Resources.GetCodes())
			schema += "<optional><element name='" + res + "'><ref name='" + type + "'/></element></optional>";
		return "<interleave>" + schema + "</interleave>";
	},
	"BuildChoicesSchema": () => "<choice><value>food.grain</value></choice>"
};

Engine.RegisterGlobal("ApplyValueModificationsToEntity", (prop, oVal) => oVal);
Engine.RegisterInterface("Player");
Engine.RegisterInterface("PlayerManager");
Engine.RegisterInterface("StatisticsTracker");
Engine.RegisterInterface("Fogging");
Engine.RegisterInterface("DeathDamage");
Engine.RegisterInterface("Loot");
Engine.RegisterInterface("Looter");
Engine.RegisterInterface("RangeManager");
Engine.RegisterInterface("Repairable");
Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("interfaces/Player.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/Health.js");
Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("interfaces/NationSettlement.js");
Engine.LoadComponentScript("interfaces/NationSettlementManager.js");
Engine.LoadComponentScript("interfaces/PopulationFoodConsumption.js");
Engine.LoadComponentScript("interfaces/SettlementDiscontent.js");
Engine.LoadComponentScript("interfaces/RebellionManager.js");
Engine.LoadComponentScript("interfaces/SettlementConnectivity.js");
Engine.LoadComponentScript("interfaces/InfrastructureLink.js");
Engine.LoadComponentScript("interfaces/TransportEfficiency.js");
Engine.LoadComponentScript("interfaces/GovernmentFinance.js");
Engine.LoadComponentScript("interfaces/CommodityProducer.js");
Engine.LoadComponentScript("interfaces/CommodityProductionManager.js");
Engine.LoadComponentScript("interfaces/CommodityExportManager.js");
Engine.LoadComponentScript("interfaces/InfrastructureInvestment.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("Player.js");
Engine.LoadComponentScript("Health.js");
Engine.LoadComponentScript("NationSettlement.js");
Engine.LoadComponentScript("NationSettlementManager.js");
Engine.LoadComponentScript("PopulationFoodConsumption.js");
Engine.LoadComponentScript("SettlementConnectivity.js");
Engine.LoadComponentScript("InfrastructureLink.js");
Engine.LoadComponentScript("TransportEfficiency.js");
Engine.LoadComponentScript("GovernmentFinance.js");
Engine.LoadComponentScript("CommodityProducer.js");
Engine.LoadComponentScript("CommodityProductionManager.js");
Engine.LoadComponentScript("CommodityExportManager.js");
Engine.LoadComponentScript("InfrastructureInvestment.js");
Engine.LoadComponentScript("SettlementDiscontent.js");
Engine.LoadComponentScript("RebellionManager.js");

function QueryPlayerIDInterface()
{
	return null;
}

function QueryOwnerInterface()
{
	return null;
}

function PlaySound()
{
}

const playerTemplate = {
	"SpyCostMultiplier": "1",
	"BarterMultiplier": {
		"Buy": { "food": "1", "wood": "1", "stone": "1", "metal": "1" },
		"Sell": { "food": "1", "wood": "1", "stone": "1", "metal": "1" }
	},
	"Formations": { "_string": "" }
};

const roadHealthTemplate = {
	"Max": "100",
	"RegenRate": "0",
	"IdleRegenRate": "0",
	"DeathType": "remain",
	"Unhealable": "false"
};

let g_Settlements = [];
let g_Links = [];
let g_Producers = [];
let g_Spawned = [];
let g_NextRebel = 200;
let g_RebelHitpoints = {};
let g_RebelOwner = {};
let g_RebelPos = {};

Engine.GetEntitiesWithInterface = function(iid)
{
	if (iid === IID_NationSettlement)
		return g_Settlements.slice();
	if (iid === IID_InfrastructureLink)
		return g_Links.slice();
	if (iid === IID_CommodityProducer)
		return g_Producers.slice();
	return [];
};

Engine.AddEntity = function(template)
{
	const id = g_NextRebel++;
	g_Spawned.push({ "id": id, "template": template });
	g_RebelHitpoints[id] = 100;
	g_RebelOwner[id] = INVALID_PLAYER;
	g_RebelPos[id] = null;
	AddMock(id, IID_Health, {
		"GetHitpoints": () => g_RebelHitpoints[id]
	});
	AddMock(id, IID_Ownership, {
		"GetOwner": () => g_RebelOwner[id],
		"SetOwner": owner => { g_RebelOwner[id] = owner; }
	});
	AddMock(id, IID_Position, {
		"IsInWorld": () => true,
		"JumpTo": (x, z) => { g_RebelPos[id] = { "x": x, "z": z }; }
	});
	return id;
};

Engine.BroadcastMessage = function(type)
{
	if (type === MT_FoodConsumptionCompleted)
	{
		const cmpDiscontent = Engine.QueryInterface(SYSTEM_ENTITY, IID_SettlementDiscontent);
		if (cmpDiscontent)
			cmpDiscontent.OnGlobalFoodConsumptionCompleted();
		return;
	}
	if (type === MT_SettlementDiscontentCompleted)
	{
		const cmpRebellion = Engine.QueryInterface(SYSTEM_ENTITY, IID_RebellionManager);
		if (cmpRebellion)
			cmpRebellion.OnGlobalSettlementDiscontentCompleted();
	}
};

Engine.PostMessage = function(ent, type)
{
	if (type !== MT_HealthChanged)
		return;
	const cmpLink = Engine.QueryInterface(ent, IID_InfrastructureLink);
	if (cmpLink)
		cmpLink.OnHealthChanged();
};

function start(food)
{
	ResetState();
	g_Settlements = [];
	g_Links = [];
	g_Producers = [];
	g_Spawned = [];
	g_NextRebel = 200;
	g_RebelHitpoints = {};
	g_RebelOwner = {};
	g_RebelPos = {};
	AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
		"GetSovereignOwner": pos => pos.x <= 256 ? 1 : pos.x <= 512 ? 2 : INVALID_PLAYER
	});
	AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
		"GetNumPlayers": () => 4,
		"GetPlayerByID": id => id >= 1 && id <= 3 ? id : null
	});
	const cmpTimer = ConstructComponent(SYSTEM_ENTITY, "Timer");
	ConstructComponent(SYSTEM_ENTITY, "NationSettlementManager");
	const cmpFood = ConstructComponent(SYSTEM_ENTITY, "PopulationFoodConsumption");
	const cmpDiscontent = ConstructComponent(SYSTEM_ENTITY, "SettlementDiscontent");
	const cmpRebellion = ConstructComponent(SYSTEM_ENTITY, "RebellionManager");
	cmpRebellion.ReadRebelPlayer(3);
	const p1 = ConstructComponent(1, "Player", playerTemplate);
	p1.SetPlayerID(1);
	p1.SetResourceCounts({ "food": food });
	return {
		"cmpTimer": cmpTimer,
		"cmpFood": cmpFood,
		"cmpDiscontent": cmpDiscontent,
		"cmpRebellion": cmpRebellion,
		"p1": p1
	};
}

function settlement(id, name, population, integration, x, z, owner, isCapital)
{
	AddMock(id, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": x, "y": z })
	});
	AddMock(id, IID_Ownership, {
		"GetOwner": () => owner
	});
	g_Settlements.push(id);
	return ConstructComponent(id, "NationSettlement", {
		"Name": name,
		"Population": String(population),
		"StateIntegration": String(integration),
		"IsCapital": isCapital ? "true" : "false"
	});
}

function nation()
{
	settlement(30, "Capital", 18000, 90, 90, 380, 2, true);
	settlement(31, "Northern Village", 5000, 35, 70, 500, 2, false);
	settlement(32, "Western Village", 3500, 20, 40, 220, 2, false);
	settlement(33, "Southern Village", 7000, 55, 180, 80, 2, false);
	settlement(34, "Eastern Village", 4000, 40, 420, 300, 1, false);
}

function western()
{
	return Engine.QueryInterface(32, IID_NationSettlement);
}

function status(entity)
{
	return Engine.QueryInterface(SYSTEM_ENTITY, IID_RebellionManager).GetStatus(entity);
}

function evaluate()
{
	Engine.QueryInterface(SYSTEM_ENTITY, IID_RebellionManager).OnGlobalSettlementDiscontentCompleted();
}

let world = start(100000);
nation();
const cmpWestern = western();
TS_ASSERT_EQUALS(cmpWestern.GetSovereignOwner(), 1);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_Ownership).GetOwner(), 2);
TS_ASSERT_EQUALS(status(32).active, false);
TS_ASSERT_EQUALS(status(32).extremeIntervals, 0);
TS_ASSERT_EQUALS(status(32).livingRebels, 0);
TS_ASSERT_EQUALS(status(32).extreme, false);

cmpWestern.SetDiscontent(79);
for (let i = 0; i < 5; ++i)
	evaluate();
TS_ASSERT_EQUALS(status(32).extremeIntervals, 0);
TS_ASSERT_EQUALS(status(32).active, false);
TS_ASSERT_EQUALS(g_Spawned.length, 0);
TS_ASSERT_EQUALS(cmpWestern.GetDiscontent(), 79);

cmpWestern.SetDiscontent(80);
evaluate();
TS_ASSERT_EQUALS(status(32).extremeIntervals, 1);
TS_ASSERT_EQUALS(status(32).active, false);
TS_ASSERT_EQUALS(status(32).extreme, true);
TS_ASSERT_EQUALS(g_Spawned.length, 0);

cmpWestern.SetDiscontent(75);
evaluate();
TS_ASSERT_EQUALS(status(32).extremeIntervals, 0);
TS_ASSERT_EQUALS(status(32).extreme, false);
TS_ASSERT_EQUALS(g_Spawned.length, 0);

cmpWestern.SetDiscontent(85);
evaluate();
TS_ASSERT_EQUALS(status(32).extremeIntervals, 1);
TS_ASSERT_EQUALS(g_Spawned.length, 0);
evaluate();
TS_ASSERT_EQUALS(status(32).extremeIntervals, 2);
TS_ASSERT_EQUALS(status(32).active, true);
TS_ASSERT_EQUALS(status(32).livingRebels, 3);
TS_ASSERT_EQUALS(status(32).opponent, 1);
TS_ASSERT_EQUALS(g_Spawned.length, 3);
TS_ASSERT_EQUALS(g_Spawned[0].template, "units/nation/rebel_fighter");
TS_ASSERT_EQUALS(g_RebelOwner[g_Spawned[0].id], 3);
TS_ASSERT_EQUALS(g_RebelOwner[g_Spawned[1].id], 3);
TS_ASSERT_EQUALS(g_RebelOwner[g_Spawned[2].id], 3);
TS_ASSERT_EQUALS(g_RebelPos[g_Spawned[0].id].x, 48);
TS_ASSERT_EQUALS(g_RebelPos[g_Spawned[0].id].z, 220);
TS_ASSERT_EQUALS(g_RebelPos[g_Spawned[1].id].x, 34);
TS_ASSERT_EQUALS(g_RebelPos[g_Spawned[1].id].z, 226);
TS_ASSERT_EQUALS(g_RebelPos[g_Spawned[2].id].x, 34);
TS_ASSERT_EQUALS(g_RebelPos[g_Spawned[2].id].z, 214);
TS_ASSERT_EQUALS(cmpWestern.GetPopulation(), 3500);
TS_ASSERT_EQUALS(cmpWestern.GetStateIntegration(), 20);
TS_ASSERT_EQUALS(cmpWestern.GetDiscontent(), 85);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_Ownership).GetOwner(), 2);

for (let i = 0; i < 8; ++i)
{
	cmpWestern.SetDiscontent(100);
	evaluate();
}
TS_ASSERT_EQUALS(g_Spawned.length, 3);
TS_ASSERT_EQUALS(status(32).livingRebels, 3);
TS_ASSERT_EQUALS(status(32).active, true);

cmpWestern.SetDiscontent(40);
evaluate();
TS_ASSERT_EQUALS(status(32).active, true);
TS_ASSERT_EQUALS(status(32).livingRebels, 3);
TS_ASSERT_EQUALS(g_RebelHitpoints[g_Spawned[0].id], 100);
TS_ASSERT_EQUALS(g_Spawned.length, 3);
TS_ASSERT_EQUALS(cmpWestern.GetDiscontent(), 40);

cmpWestern.SetDiscontent(100);
for (const spawned of g_Spawned)
	g_RebelHitpoints[spawned.id] = 0;
evaluate();
TS_ASSERT_EQUALS(status(32).active, false);
TS_ASSERT_EQUALS(status(32).livingRebels, 0);
TS_ASSERT_EQUALS(status(32).extremeIntervals, 0);
TS_ASSERT_EQUALS(cmpWestern.GetDiscontent(), 100);
TS_ASSERT_EQUALS(cmpWestern.GetPopulation(), 3500);
evaluate();
TS_ASSERT_EQUALS(status(32).extremeIntervals, 1);
TS_ASSERT_EQUALS(status(32).active, false);
TS_ASSERT_EQUALS(g_Spawned.length, 3);
evaluate();
TS_ASSERT_EQUALS(status(32).active, true);
TS_ASSERT_EQUALS(status(32).livingRebels, 3);
TS_ASSERT_EQUALS(g_Spawned.length, 6);
TS_ASSERT_EQUALS(cmpWestern.GetDiscontent(), 100);

const cmpEastern = Engine.QueryInterface(34, IID_NationSettlement);
TS_ASSERT_EQUALS(cmpEastern.GetSovereignOwner(), 2);
TS_ASSERT_EQUALS(Engine.QueryInterface(34, IID_Ownership).GetOwner(), 1);
cmpEastern.SetDiscontent(100);
evaluate();
evaluate();
TS_ASSERT_EQUALS(status(34).opponent, 2);
TS_ASSERT_EQUALS(status(34).active, true);
TS_ASSERT_EQUALS(g_RebelOwner[g_Spawned[6].id], 3);
TS_ASSERT_EQUALS(Engine.QueryInterface(34, IID_Ownership).GetOwner(), 1);

world = start(100000);
nation();
western().SetDiscontent(85);
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(western().GetDiscontent(), 80);
TS_ASSERT_EQUALS(status(32).extremeIntervals, 1);
TS_ASSERT_EQUALS(g_Spawned.length, 0);
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(western().GetDiscontent(), 75);
TS_ASSERT_EQUALS(status(32).extremeIntervals, 0);
TS_ASSERT_EQUALS(status(32).active, false);
TS_ASSERT_EQUALS(g_Spawned.length, 0);

world = start(100000);
nation();
western().SetDiscontent(80);
evaluate();
TS_ASSERT_EQUALS(status(32).extremeIntervals, 1);
let reloaded = SerializationCycle(Engine.QueryInterface(SYSTEM_ENTITY, IID_RebellionManager));
TS_ASSERT_EQUALS(reloaded.GetStatus(32).extremeIntervals, 1);
TS_ASSERT_EQUALS(reloaded.GetStatus(32).active, false);
TS_ASSERT_EQUALS(reloaded.rebelPlayer, 3);
evaluate();
TS_ASSERT_EQUALS(status(32).active, true);
TS_ASSERT_EQUALS(status(32).livingRebels, 3);
TS_ASSERT_EQUALS(g_Spawned.length, 3);

const firstGroup = g_Spawned.map(spawned => spawned.id);
reloaded = SerializationCycle(Engine.QueryInterface(SYSTEM_ENTITY, IID_RebellionManager));
TS_ASSERT_EQUALS(reloaded.GetStatus(32).active, true);
TS_ASSERT_EQUALS(reloaded.GetStatus(32).livingRebels, 3);
western().SetDiscontent(100);
evaluate();
evaluate();
TS_ASSERT_EQUALS(g_Spawned.length, 3);
TS_ASSERT_EQUALS(g_Spawned[0].id, firstGroup[0]);
TS_ASSERT_EQUALS(g_Spawned[1].id, firstGroup[1]);
TS_ASSERT_EQUALS(g_Spawned[2].id, firstGroup[2]);
TS_ASSERT_EQUALS(status(32).livingRebels, 3);

world = start(100000);
nation();
western().SetDiscontent(100);
world.cmpRebellion.ReadRebelPlayer(0);
evaluate();
evaluate();
TS_ASSERT_EQUALS(g_Spawned.length, 0);
TS_ASSERT_EQUALS(status(32).extremeIntervals, 2);

function physicalRoad(entity, from, to)
{
	g_Links.push(entity);
	AddMock(entity, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": 80, "y": 400 })
	});
	AddMock(entity, IID_Ownership, {
		"GetOwner": () => 1
	});
	const cmpHealth = ConstructComponent(entity, "Health", roadHealthTemplate);
	const cmpLink = ConstructComponent(entity, "InfrastructureLink", {
		"From": String(from),
		"To": String(to)
	});
	return { "cmpHealth": cmpHealth, "cmpLink": cmpLink };
}

world = start(100000);
nation();
global.InitAttributes = {
	"settings": {
		"SettlementConnectivity": [{ "from": 31, "to": 33 }],
		"GovernmentFinance": [{ "player": 1, "treasury": 10000000 }]
	}
};
const cmpConnectivity = ConstructComponent(SYSTEM_ENTITY, "SettlementConnectivity");
const cmpTransport = ConstructComponent(SYSTEM_ENTITY, "TransportEfficiency");
const cmpFinance = ConstructComponent(SYSTEM_ENTITY, "GovernmentFinance");
const cmpProduction = ConstructComponent(SYSTEM_ENTITY, "CommodityProductionManager");
const cmpExport = ConstructComponent(SYSTEM_ENTITY, "CommodityExportManager");
const cmpInvestment = ConstructComponent(SYSTEM_ENTITY, "InfrastructureInvestment");
cmpFinance.OnInitGame();
cmpConnectivity.OnInitGame();
g_Producers.push(33);
const cmpCocoa = ConstructComponent(33, "CommodityProducer", {
	"Commodity": "cocoa",
	"ProductionPerTick": "100",
	"Stock": "200"
});
const westernRoad = physicalRoad(41, 30, 32);
const northernRoad = physicalRoad(40, 30, 31);
TS_ASSERT_EQUALS(cmpConnectivity.IsConnectedToCapital(32), true);
TS_ASSERT_EQUALS(cmpTransport.GetEfficiency(33), 1);
TS_ASSERT_EQUALS(cmpExport.ExportAmount(33, cmpCocoa.GetStock()), 200);

western().SetDiscontent(100);
evaluate();
evaluate();
TS_ASSERT_EQUALS(status(32).livingRebels, 3);
const rebel = g_Spawned[0].id;
TS_ASSERT_EQUALS(westernRoad.cmpLink.GetCondition(), 100);
westernRoad.cmpHealth.TakeDamage(40, rebel, 3);
TS_ASSERT_EQUALS(westernRoad.cmpHealth.GetHitpoints(), 60);
TS_ASSERT_EQUALS(westernRoad.cmpLink.GetCondition(), 60);
westernRoad.cmpHealth.TakeDamage(40, rebel, 3);
TS_ASSERT_EQUALS(westernRoad.cmpLink.GetCondition(), 20);
westernRoad.cmpHealth.TakeDamage(40, rebel, 3);
TS_ASSERT_EQUALS(westernRoad.cmpHealth.GetHitpoints(), 0);
TS_ASSERT_EQUALS(westernRoad.cmpLink.GetCondition(), 0);
TS_ASSERT_EQUALS(cmpConnectivity.IsConnectedToCapital(32), false);
TS_ASSERT_EQUALS(northernRoad.cmpLink.GetCondition(), 100);
TS_ASSERT_EQUALS(cmpTransport.GetEfficiency(33), 1);
TS_ASSERT_EQUALS(western().GetDiscontent(), 100);

northernRoad.cmpHealth.TakeDamage(40, rebel, 3);
northernRoad.cmpHealth.TakeDamage(40, rebel, 3);
northernRoad.cmpHealth.TakeDamage(40, rebel, 3);
TS_ASSERT_EQUALS(northernRoad.cmpHealth.GetHitpoints(), 0);
TS_ASSERT_EQUALS(northernRoad.cmpLink.GetCondition(), 0);
TS_ASSERT_EQUALS(cmpConnectivity.IsConnectedToCapital(31), false);
TS_ASSERT_EQUALS(cmpConnectivity.IsConnectedToCapital(33), false);
TS_ASSERT_EQUALS(cmpTransport.GetEfficiency(33), 0);
TS_ASSERT_EQUALS(cmpTransport.GetRouteCondition(33), 0);
cmpProduction.ApplyProduction();
TS_ASSERT_EQUALS(cmpCocoa.GetStock(), 300);
const treasuryBefore = cmpFinance.GetTreasury(1);
cmpExport.ApplyExports();
TS_ASSERT_EQUALS(cmpExport.GetTotalExported(1, "cocoa"), 0);
TS_ASSERT_EQUALS(cmpCocoa.GetStock(), 300);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), treasuryBefore);

TS_ASSERT_EQUALS(cmpInvestment.Repair(1, 40), true);
TS_ASSERT_EQUALS(northernRoad.cmpLink.GetCondition(), 100);
TS_ASSERT_EQUALS(cmpTransport.GetEfficiency(33), 1);
cmpExport.ApplyExports();
TS_ASSERT_EQUALS(cmpExport.GetTotalExported(1, "cocoa"), 300);
TS_ASSERT_EQUALS(cmpCocoa.GetStock(), 0);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), treasuryBefore - 1000000 + 3000);
TS_ASSERT_EQUALS(western().GetDiscontent(), 100);
TS_ASSERT_EQUALS(western().GetStateIntegration(), 20);
