Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("interfaces/NationSettlement.js");
Engine.LoadComponentScript("NationSettlement.js");
Engine.LoadComponentScript("interfaces/SettlementConnectivity.js");
Engine.LoadComponentScript("SettlementConnectivity.js");
Engine.LoadComponentScript("interfaces/InfrastructureLink.js");
Engine.LoadComponentScript("InfrastructureLink.js");
Engine.LoadComponentScript("interfaces/TransportEfficiency.js");
Engine.LoadComponentScript("TransportEfficiency.js");
Engine.LoadComponentScript("interfaces/GovernmentFinance.js");
Engine.LoadComponentScript("GovernmentFinance.js");
Engine.LoadComponentScript("interfaces/InfrastructureInvestment.js");
Engine.LoadComponentScript("InfrastructureInvestment.js");

INVALID_ENTITY = 0;

const g_Errors = [];
error = function(message)
{
	g_Errors.push(String(message));
};

let g_SettlementIds = [];
let g_LinkIds = [];
let g_ProducerIds = [];
let g_NextEntity = 50;
let g_AddEntityResult = null;
let g_SpawnFrom = 30;
let g_SpawnTo = 32;
let g_Placed = null;
let g_SpawnOwner = null;
let g_AddCalls = 0;
let g_LastTemplate = null;
let g_SettlementOwner = 1;
let g_TerritoryOwner = 0;

const westernProject = {
	"id": "capital-western-road",
	"from": 30,
	"to": 32,
	"cost": 2000000,
	"template": "structures/nation/capital_western_road",
	"x": 65,
	"z": 320,
	"angle": -2.896613990462929
};

const borderProject = {
	"id": "capital-eastern-road",
	"from": 30,
	"to": 34,
	"cost": 2000000,
	"template": "structures/nation/capital_western_road",
	"x": 200,
	"z": 400,
	"angle": 0
};

AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
	"GetSovereignOwner": pos => pos.x <= 256 ? 1 : pos.x <= 512 ? 2 : INVALID_PLAYER
});

Engine.GetEntitiesWithInterface = function(iid)
{
	if (iid === IID_NationSettlement)
		return g_SettlementIds.slice();
	if (iid === IID_InfrastructureLink)
		return g_LinkIds.slice();
		return [];
};

const g_DestroyEntity = Engine.DestroyEntity;
Engine.DestroyEntity = function(ent)
{
	const cmpLink = Engine.QueryInterface(ent, IID_InfrastructureLink);
	if (cmpLink && cmpLink.OnDestroy)
		cmpLink.OnDestroy();
	g_DestroyEntity(ent);
	const index = g_LinkIds.indexOf(ent);
	if (index >= 0)
		g_LinkIds.splice(index, 1);
};

Engine.AddEntity = function(template)
{
	++g_AddCalls;
	g_LastTemplate = template;
	if (g_AddEntityResult !== null)
		return g_AddEntityResult;

	const id = g_NextEntity++;
	g_LinkIds.push(id);
	ConstructComponent(id, "InfrastructureLink", {
		"From": String(g_SpawnFrom),
		"To": String(g_SpawnTo)
	});
	AddMock(id, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": 65, "y": 320 }),
		"JumpTo": (x, z) =>
		{
			g_Placed = { "ent": id, "x": x, "z": z };
		},
		"SetYRotation": angle =>
		{
			g_Placed.angle = angle;
		}
	});
	AddMock(id, IID_Ownership, {
		"GetOwner": () => g_SpawnOwner,
		"SetOwner": player =>
		{
			g_SpawnOwner = player;
		}
	});
	return id;
};

function place(entity, x)
{
	AddMock(entity, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": x, "y": 100 })
	});
	AddMock(entity, IID_Ownership, {
		"GetOwner": () => g_SettlementOwner
	});
}

function settlement(entity, name, population, integration, x, isCapital)
{
	place(entity, x);
	g_SettlementIds.push(entity);
	return ConstructComponent(entity, "NationSettlement", {
		"Name": name,
		"Population": String(population),
		"StateIntegration": String(integration),
		"IsCapital": isCapital ? "true" : "false"
	});
}

function start(treasury, projects, links)
{
	ResetState();
	g_Errors.length = 0;
	g_SettlementIds = [];
	g_LinkIds = [];
	g_ProducerIds = [];
	g_NextEntity = 50;
	g_AddEntityResult = null;
	g_SpawnFrom = 30;
	g_SpawnTo = 32;
	g_Placed = null;
	g_SpawnOwner = null;
	g_AddCalls = 0;
	g_SettlementOwner = 1;
	g_TerritoryOwner = 0;
	AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
		"GetSovereignOwner": pos => pos.x <= 256 ? 1 : pos.x <= 512 ? 2 : INVALID_PLAYER
	});
	AddMock(SYSTEM_ENTITY, IID_TerritoryManager, {
		"GetOwner": () => g_TerritoryOwner
	});
	const cmpTimer = ConstructComponent(SYSTEM_ENTITY, "Timer");
	const cmpConnectivity = ConstructComponent(SYSTEM_ENTITY, "SettlementConnectivity");
	const cmpTransport = ConstructComponent(SYSTEM_ENTITY, "TransportEfficiency");
	const cmpFinance = ConstructComponent(SYSTEM_ENTITY, "GovernmentFinance");
	const cmpInvestment = ConstructComponent(SYSTEM_ENTITY, "InfrastructureInvestment");
	global.InitAttributes = {
		"settings": {
			"SettlementConnectivity": links || [],
			"GovernmentFinance": [
				{ "player": 1, "treasury": treasury },
				{ "player": 2, "treasury": treasury }
			],
			"InfrastructureProjects": projects
		}
	};
	cmpFinance.OnInitGame();
	cmpInvestment.OnInitGame();
	return {
		"cmpTimer": cmpTimer,
		"cmpConnectivity": cmpConnectivity,
		"cmpTransport": cmpTransport,
		"cmpFinance": cmpFinance,
				"cmpInvestment": cmpInvestment
	};
}

function begin(world)
{
	world.cmpConnectivity.OnInitGame();
}

function advance(cmpTimer, seconds)
{
	cmpTimer.OnUpdate({ "turnLength": seconds });
}

let world = start(10000000, [westernProject]);
const capital = settlement(30, "Capital", 18000, 90, 90, true);
settlement(32, "Western Village", 3500, 20, 40, false);
begin(world);
let quote = world.cmpInvestment.GetConstructionQuote(1, 32);
TS_ASSERT_EQUALS(quote.available, true);
TS_ASSERT_EQUALS(quote.completed, false);
TS_ASSERT_EQUALS(quote.cost, 2000000);
TS_ASSERT_EQUALS(quote.canAfford, true);
TS_ASSERT_EQUALS(quote.population, 3500);
TS_ASSERT_EQUALS(quote.integration, 20);
TS_ASSERT_EQUALS(quote.connected, false);
TS_ASSERT_EQUALS(world.cmpInvestment.GetConstructionQuote(1, 30), null);
g_TerritoryOwner = 3;
TS_ASSERT_EQUALS(world.cmpInvestment.GetConstructionQuote(1, 32).authorized, false);
TS_ASSERT_EQUALS(world.cmpInvestment.Construct(1, "capital-western-road"), false);
TS_ASSERT_EQUALS(g_AddCalls, 0);
g_TerritoryOwner = 0;
TS_ASSERT_EQUALS(world.cmpInvestment.GetConstructionQuote(1, 32).authorized, true);

world = start(1500000, [westernProject]);
settlement(30, "Capital", 0, 90, 90, true);
settlement(32, "Western Village", 3500, 20, 40, false);
begin(world);
quote = world.cmpInvestment.GetConstructionQuote(1, 32);
TS_ASSERT_EQUALS(quote.canAfford, false);
TS_ASSERT_EQUALS(quote.available, true);
TS_ASSERT_EQUALS(world.cmpInvestment.Construct(1, "capital-western-road"), false);
TS_ASSERT_EQUALS(g_AddCalls, 0);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 1500000);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(32), false);

world = start(10000000, [westernProject]);
settlement(30, "Capital", 0, 90, 90, true);
const western = settlement(32, "Western Village", 3500, 20, 40, false);
begin(world);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(32), false);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(32), 0);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(western.GetStateIntegration(), 20);
TS_ASSERT_EQUALS(world.cmpInvestment.Construct(1, "capital-western-road"), true);
TS_ASSERT_EQUALS(g_AddCalls, 1);
TS_ASSERT_EQUALS(g_LastTemplate, "structures/nation/capital_western_road");
TS_ASSERT_EQUALS(g_Placed.x, 65);
TS_ASSERT_EQUALS(g_Placed.z, 320);
TS_ASSERT_EQUALS(g_SpawnOwner, 1);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 8000000);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(2), 10000000);
const built = world.cmpInvestment.FindLink(30, 32);
TS_ASSERT(built !== INVALID_ENTITY);
TS_ASSERT_EQUALS(Engine.QueryInterface(built, IID_InfrastructureLink).GetCondition(), 100);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(32), true);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(32), 1);
TS_ASSERT_EQUALS(western.GetStateIntegration(), 20);
quote = world.cmpInvestment.GetConstructionQuote(1, 32);
TS_ASSERT_EQUALS(quote.completed, true);
TS_ASSERT_EQUALS(quote.available, false);
TS_ASSERT_EQUALS(quote.connected, true);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetStateIntegration(), 21);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetStateIntegration(), 22);
TS_ASSERT_EQUALS(capital.GetStateIntegration(), 90);

const callsAfter = g_AddCalls;
TS_ASSERT_EQUALS(world.cmpInvestment.Construct(1, "capital-western-road"), false);
TS_ASSERT_EQUALS(g_AddCalls, callsAfter);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 8000000);

const road = Engine.QueryInterface(built, IID_InfrastructureLink);
TS_ASSERT_EQUALS(road.SetCondition(0), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(32), false);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(32), 0);
TS_ASSERT_EQUALS(world.cmpInvestment.GetRepairQuote(1, built).cost, 1000000);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(1, built), true);
TS_ASSERT_EQUALS(road.GetCondition(), 100);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 7000000);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(32), true);

TS_ASSERT_EQUALS(road.SetCondition(50), true);
TS_ASSERT_EQUALS(world.cmpInvestment.GetRepairQuote(1, built).cost, 500000);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(32), true);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(1, built), true);
TS_ASSERT_EQUALS(road.GetCondition(), 100);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 6500000);

road.OnDestroy();
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(32), false);

world = start(10000000, [westernProject]);
settlement(30, "Capital", 0, 90, 90, true);
settlement(32, "Western Village", 3500, 20, 40, false);
begin(world);
TS_ASSERT_EQUALS(world.cmpInvestment.Construct(2, "capital-western-road"), false);
TS_ASSERT_EQUALS(g_AddCalls, 0);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(2), 10000000);
TS_ASSERT_EQUALS(world.cmpInvestment.GetConstructionQuote(2, 32).authorized, false);

world = start(10000000, [westernProject, borderProject]);
settlement(30, "Capital", 0, 90, 90, true);
settlement(32, "Western Village", 3500, 20, 40, false);
settlement(34, "Eastern Village", 4000, 40, 420, false);
begin(world);
TS_ASSERT_EQUALS(world.cmpInvestment.Construct(1, "capital-eastern-road"), false);
TS_ASSERT_EQUALS(g_AddCalls, 0);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);
TS_ASSERT_EQUALS(world.cmpInvestment.GetConstructionQuote(1, 34).authorized, false);

world = start(10000000, [westernProject]);
settlement(30, "Capital", 0, 90, 90, true);
g_SettlementOwner = 2;
settlement(32, "Western Village", 3500, 20, 40, false);
begin(world);
TS_ASSERT_EQUALS(world.cmpInvestment.Construct(2, "capital-western-road"), false);
TS_ASSERT_EQUALS(g_AddCalls, 0);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(2), 10000000);
TS_ASSERT_EQUALS(world.cmpInvestment.Construct(1, "capital-western-road"), true);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 8000000);

world = start(10000000, [westernProject]);
settlement(30, "Capital", 0, 90, 90, true);
settlement(32, "Western Village", 0, 20, 40, false);
begin(world);
g_AddEntityResult = INVALID_ENTITY;
TS_ASSERT_EQUALS(world.cmpInvestment.Construct(1, "capital-western-road"), false);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(32), false);
g_AddEntityResult = null;
g_SpawnTo = 31;
TS_ASSERT_EQUALS(world.cmpInvestment.Construct(1, "capital-western-road"), false);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);
TS_ASSERT_EQUALS(world.cmpInvestment.FindLink(30, 32), INVALID_ENTITY);

g_Commands = {};
RegisterInfrastructureRepairCommand();
g_SpawnTo = 32;
TS_ASSERT_EQUALS(world.cmpInvestment.Construct(1, "not-a-project"), false);
g_Commands["nation-construct-infrastructure"](1, { "cost": 1 });
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);
g_Commands["nation-construct-infrastructure"](1, { "project": "capital-western-road" });
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 8000000);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(32), true);
const beforeDuplicate = g_AddCalls;
g_Commands["nation-construct-infrastructure"](1, { "project": "capital-western-road" });
TS_ASSERT_EQUALS(g_AddCalls, beforeDuplicate);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 8000000);

world = start(10000000, [westernProject], [{ "from": 31, "to": 33 }]);
settlement(30, "Capital", 0, 90, 90, true);
settlement(31, "Northern Village", 0, 35, 70, false);
settlement(32, "Western Village", 0, 20, 40, false);
settlement(33, "Southern Village", 0, 55, 180, false);
g_LinkIds.push(40);
ConstructComponent(40, "InfrastructureLink", { "From": "30", "To": "31" });
begin(world);
const southernPath = world.cmpConnectivity.GetPathToCapital(33);
TS_ASSERT_EQUALS(southernPath.length, 3);
TS_ASSERT_EQUALS(southernPath[0], 33);
TS_ASSERT_EQUALS(southernPath[1], 31);
TS_ASSERT_EQUALS(southernPath[2], 30);
TS_ASSERT_EQUALS(world.cmpInvestment.Construct(1, "capital-western-road"), true);
const southernAfter = world.cmpConnectivity.GetPathToCapital(33);
TS_ASSERT_EQUALS(southernAfter[0], 33);
TS_ASSERT_EQUALS(southernAfter[1], 31);
TS_ASSERT_EQUALS(southernAfter[2], 30);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(33), 1);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(32), 1);
const westernLink = world.cmpInvestment.FindLink(30, 32);
TS_ASSERT_EQUALS(Engine.QueryInterface(westernLink, IID_InfrastructureLink).SetCondition(0), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(32), false);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(33), true);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(33), 1);

world = start(10000000, [westernProject]);
settlement(30, "Capital", 0, 90, 90, true);
settlement(32, "Western Village", 3500, 20, 40, false);
begin(world);
const timers = world.cmpTimer.timers.size;
world.cmpInvestment = SerializationCycle(world.cmpInvestment);
world.cmpFinance = SerializationCycle(world.cmpFinance);
world.cmpConnectivity = SerializationCycle(world.cmpConnectivity);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, timers);
quote = world.cmpInvestment.GetConstructionQuote(1, 32);
TS_ASSERT_EQUALS(quote.available, true);
TS_ASSERT_EQUALS(quote.cost, 2000000);
TS_ASSERT_EQUALS(world.cmpInvestment.Construct(1, "capital-western-road"), true);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 8000000);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(32), true);

const builtId = world.cmpInvestment.FindLink(30, 32);
world.cmpInvestment = SerializationCycle(world.cmpInvestment);
world.cmpFinance = SerializationCycle(world.cmpFinance);
world.cmpConnectivity = SerializationCycle(world.cmpConnectivity);
SerializationCycle(Engine.QueryInterface(builtId, IID_InfrastructureLink));
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, timers);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 8000000);
TS_ASSERT_EQUALS(world.cmpInvestment.GetConstructionQuote(1, 32).completed, true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(32), true);
const savedCalls = g_AddCalls;
TS_ASSERT_EQUALS(world.cmpInvestment.Construct(1, "capital-western-road"), false);
TS_ASSERT_EQUALS(g_AddCalls, savedCalls);
TS_ASSERT_EQUALS(Engine.QueryInterface(builtId, IID_InfrastructureLink).SetCondition(50), true);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(1, builtId), true);
TS_ASSERT_EQUALS(Engine.QueryInterface(builtId, IID_InfrastructureLink).GetCondition(), 100);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 7500000);

g_Errors.length = 0;
world = start(10000000, [{ "id": "", "from": 30, "to": 32, "cost": 1, "template": "x", "x": 0, "z": 0, "angle": 0 }]);
TS_ASSERT(g_Errors.length > 0);
TS_ASSERT_EQUALS(world.cmpInvestment.Construct(1, "capital-western-road"), false);
