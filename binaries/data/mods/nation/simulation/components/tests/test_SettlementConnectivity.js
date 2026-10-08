Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("interfaces/NationSettlement.js");
Engine.LoadComponentScript("NationSettlement.js");
Engine.LoadComponentScript("interfaces/NationSettlementManager.js");
Engine.LoadComponentScript("NationSettlementManager.js");
Engine.LoadComponentScript("interfaces/SettlementConnectivity.js");
Engine.LoadComponentScript("SettlementConnectivity.js");
Engine.LoadComponentScript("interfaces/InfrastructureLink.js");
Engine.LoadComponentScript("InfrastructureLink.js");

INVALID_ENTITY = 0;

const g_Errors = [];
error = function(message)
{
	g_Errors.push(String(message));
};

const g_Positions = {};
let g_SettlementIds = [];
let g_LinkIds = [];
let g_TerritoryOwner = 0;

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

function place(entity, x, z)
{
	g_Positions[entity] = { "x": x, "y": z };
	AddMock(entity, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => g_Positions[entity]
	});
}

function settlement(entity, name, population, integration, x, isCapital)
{
	place(entity, x, 100);
	g_SettlementIds.push(entity);
	return ConstructComponent(entity, "NationSettlement", {
		"Name": name,
		"Population": String(population),
		"StateIntegration": String(integration),
		"IsCapital": isCapital ? "true" : "false"
	});
}

function start(links)
{
	ResetState();
	g_Errors.length = 0;
	g_SettlementIds = [];
	g_LinkIds = [];
	g_TerritoryOwner = 0;
	AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
		"GetSovereignOwner": pos => pos.x <= 256 ? 1 : pos.x <= 512 ? 2 : INVALID_PLAYER
	});
	AddMock(SYSTEM_ENTITY, IID_TerritoryManager, {
		"GetOwner": () => g_TerritoryOwner
	});
	const cmpTimer = ConstructComponent(SYSTEM_ENTITY, "Timer");
	const cmpManager = ConstructComponent(SYSTEM_ENTITY, "NationSettlementManager");
	const cmpConnectivity = ConstructComponent(SYSTEM_ENTITY, "SettlementConnectivity");
	return {
		"cmpTimer": cmpTimer,
		"cmpManager": cmpManager,
		"cmpConnectivity": cmpConnectivity,
		"links": links
	};
}

function link(entity, from, to)
{
	g_LinkIds.push(entity);
	return ConstructComponent(entity, "InfrastructureLink", {
		"From": String(from),
		"To": String(to)
	});
}
function begin(world)
{
	global.InitAttributes = {
		"settings": {
			"SettlementConnectivity": world.links
		}
	};
	world.cmpConnectivity.OnInitGame();
	world.cmpConnectivity.OnInitGame();
}

function advance(cmpTimer, seconds)
{
	cmpTimer.OnUpdate({ "turnLength": seconds });
}

// One capital in Player 1 land is that state's capital.
let world = start([]);
settlement(1, "Capital", 18000, 90, 100, true);
settlement(2, "Northern Village", 5000, 35, 80, false);
begin(world);
TS_ASSERT_EQUALS(world.cmpConnectivity.GetCapitalForSovereign(1), 1);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);

// Connected integration pauses under hostile control and resumes afterwards.
world = start([{ "from": 1, "to": 2 }]);
settlement(1, "Capital", 18000, 90, 100, true);
const controlled = settlement(2, "Sefira", 3500, 20, 80, false);
begin(world);
g_TerritoryOwner = 3;
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(controlled.GetStateIntegration(), 20);
g_TerritoryOwner = 0;
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(controlled.GetStateIntegration(), 21);

// Two capitals for one sovereign are rejected. Nothing in that state is connected.
world = start([{ "from": 1, "to": 2 }]);
settlement(1, "Capital", 18000, 90, 100, true);
settlement(2, "Other Capital", 1000, 50, 80, true);
begin(world);
TS_ASSERT_EQUALS(world.cmpConnectivity.GetCapitalForSovereign(1), INVALID_ENTITY);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(1), false);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(2), false);
TS_ASSERT(g_Errors.length > 0);
const reported = g_Errors.length;
TS_ASSERT_EQUALS(world.cmpConnectivity.GetCapitalForSovereign(1), INVALID_ENTITY);
TS_ASSERT_EQUALS(g_Errors.length, reported);

// Direct, multi-hop, disconnected, and a cross-border edge.
world = start([
	{ "from": 1, "to": 2 },
	{ "from": 2, "to": 4 },
	{ "from": 1, "to": 5 },
	{ "from": 5, "to": 6 }
]);
settlement(1, "Capital", 18000, 90, 100, true);
settlement(2, "Northern Village", 5000, 35, 80, false);
settlement(3, "Western Village", 3500, 20, 40, false);
settlement(4, "Southern Village", 7000, 55, 180, false);
settlement(5, "Eastern Village", 4000, 40, 400, false);
settlement(6, "Far Village", 1000, 10, 120, false);
begin(world);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(2), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(4), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(3), false);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(1), false);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(5), false);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(6), false);
TS_ASSERT_EQUALS(world.cmpConnectivity.GetCapitalForSovereign(2), INVALID_ENTITY);

// A sovereign with settlements and no capital connects nothing.
world = start([{ "from": 1, "to": 2 }]);
settlement(1, "Town", 1000, 10, 100, false);
settlement(2, "Village", 1000, 10, 80, false);
begin(world);
TS_ASSERT_EQUALS(world.cmpConnectivity.GetCapitalForSovereign(1), INVALID_ENTITY);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(1), false);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(2), false);

// Malformed links store nothing.
world = start([{ "from": 1, "to": 99 }]);
settlement(1, "Capital", 1000, 90, 100, true);
settlement(2, "Northern Village", 1000, 35, 80, false);
begin(world);
TS_ASSERT(g_Errors.length > 0);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(2), false);

// Connected settlements gain one point. Northern's edge is physical. Southern's edge is scenario data.
world = start([
	{ "from": 1, "to": 4 },
	{ "from": 1, "to": 6 },
	{ "from": 1, "to": 7 }
]);
const capital = settlement(1, "Capital", 18000, 90, 100, true);
const northern = settlement(2, "Northern Village", 5000, 35, 80, false);
const western = settlement(3, "Western Village", 3500, 20, 40, false);
const southern = settlement(4, "Southern Village", 7000, 55, 180, false);
const eastern = settlement(5, "Eastern Village", 4000, 40, 400, false);
const nearMax = settlement(6, "Near Max", 0, 99.5, 60, false);
const atMax = settlement(7, "At Max", 0, 100, 70, false);
begin(world);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(2), false);
const road = link(8, 1, 2);
const borderRoad = link(9, 1, 5);
world.cmpConnectivity.OnInitGame();
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(2), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(4), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(3), false);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(5), false);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);
const weightedBefore = (18000 * 90 + 5000 * 35 + 3500 * 20 + 7000 * 55) / 33500;
TS_ASSERT_EQUALS(world.cmpManager.GetPopulationWeightedIntegration(1), weightedBefore);

advance(world.cmpTimer, 4);
TS_ASSERT_EQUALS(northern.GetStateIntegration(), 35);

world.cmpTimer = SerializationCycle(world.cmpTimer);
world.cmpConnectivity = SerializationCycle(world.cmpConnectivity);
const restoredRoad = SerializationCycle(road);
const restoredNorthern = SerializationCycle(northern);
const restoredCapital = SerializationCycle(capital);
SerializationCycle(western);
SerializationCycle(southern);
SerializationCycle(eastern);
SerializationCycle(nearMax);
SerializationCycle(atMax);

TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);
TS_ASSERT_EQUALS(restoredCapital.GetStateIntegration(), 90);
TS_ASSERT_EQUALS(restoredCapital.GetIsCapital(), true);
TS_ASSERT_EQUALS(restoredRoad.GetFrom(), 1);
TS_ASSERT_EQUALS(restoredRoad.GetTo(), 2);
TS_ASSERT_EQUALS(restoredNorthern.GetStateIntegration(), 35);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(2), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(4), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(3), false);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(5), false);

advance(world.cmpTimer, 6);
TS_ASSERT_EQUALS(Engine.QueryInterface(1, IID_NationSettlement).GetStateIntegration(), 90);
TS_ASSERT_EQUALS(Engine.QueryInterface(2, IID_NationSettlement).GetStateIntegration(), 36);
TS_ASSERT_EQUALS(Engine.QueryInterface(3, IID_NationSettlement).GetStateIntegration(), 20);
TS_ASSERT_EQUALS(Engine.QueryInterface(4, IID_NationSettlement).GetStateIntegration(), 56);
TS_ASSERT_EQUALS(Engine.QueryInterface(5, IID_NationSettlement).GetStateIntegration(), 40);
TS_ASSERT_EQUALS(Engine.QueryInterface(6, IID_NationSettlement).GetStateIntegration(), 100);
TS_ASSERT_EQUALS(Engine.QueryInterface(7, IID_NationSettlement).GetStateIntegration(), 100);
const weightedAfter = (18000 * 90 + 5000 * 36 + 3500 * 20 + 7000 * 56) / 33500;
TS_ASSERT_EQUALS(world.cmpManager.GetPopulationWeightedIntegration(1), weightedAfter);
TS_ASSERT_EQUALS(world.cmpManager.GetTotalPopulation(1), 33500);

advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(Engine.QueryInterface(2, IID_NationSettlement).GetStateIntegration(), 37);
TS_ASSERT_EQUALS(Engine.QueryInterface(1, IID_NationSettlement).GetStateIntegration(), 90);
TS_ASSERT_EQUALS(Engine.QueryInterface(3, IID_NationSettlement).GetStateIntegration(), 20);

// A physical link and an abstract edge for the same pair are one edge.
world = start([{ "from": 1, "to": 2 }]);
settlement(1, "Capital", 1000, 90, 100, true);
const doubled = settlement(2, "Northern Village", 1000, 35, 80, false);
link(8, 1, 2);
begin(world);
TS_ASSERT_EQUALS(world.cmpConnectivity.Neighbors(1).length, 1);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(doubled.GetStateIntegration(), 36);

// An abstract hop continues past a physical link.
world = start([{ "from": 2, "to": 4 }]);
settlement(1, "Capital", 1000, 90, 100, true);
settlement(2, "Northern Village", 1000, 35, 80, false);
settlement(4, "Southern Village", 1000, 55, 180, false);
link(8, 1, 2);
begin(world);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(2), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(4), true);

// A missing endpoint, a non-settlement, and a self-link add no edge.
world = start([]);
settlement(1, "Capital", 1000, 90, 100, true);
settlement(2, "Northern Village", 1000, 35, 80, false);
g_Errors.length = 0;
link(8, 1, 99);
link(9, 1, 50);
link(10, 1, 1);
begin(world);
TS_ASSERT(g_Errors.length > 0);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(2), false);
TS_ASSERT_EQUALS(world.cmpConnectivity.Neighbors(1).length, 0);
TS_ASSERT_EQUALS(Engine.QueryInterface(10, IID_InfrastructureLink).IsUsable(), false);

// Densira's roads are one link each. Condition 42 still connects. A house is not a settlement.
world = start([]);
settlement(30, "Esika", 18000, 90, 100, true);
settlement(31, "Bontuku", 5000, 35, 120, false);
settlement(32, "Sefira", 3500, 20, 140, false);
settlement(33, "Anomara", 7000, 55, 160, false);
place(34, 180, 100);
link(40, 30, 31);
link(41, 30, 32);
link(42, 30, 33);
Engine.QueryInterface(40, IID_InfrastructureLink).SetCondition(42);
begin(world);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(31), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(32), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(33), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.GetHopCondition(30, 31), 42);
TS_ASSERT_EQUALS(g_SettlementIds.indexOf(34), -1);
TS_ASSERT_EQUALS(world.cmpManager.GetTotalPopulation(1), 33500);
