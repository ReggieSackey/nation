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
Engine.LoadComponentScript("interfaces/TransportEfficiency.js");
Engine.LoadComponentScript("TransportEfficiency.js");
Engine.LoadComponentScript("interfaces/GovernmentFinance.js");
Engine.LoadComponentScript("GovernmentFinance.js");
Engine.LoadComponentScript("interfaces/CommodityProducer.js");
Engine.LoadComponentScript("CommodityProducer.js");
Engine.LoadComponentScript("interfaces/CommodityProductionManager.js");
Engine.LoadComponentScript("CommodityProductionManager.js");
Engine.LoadComponentScript("interfaces/CommodityExportManager.js");
Engine.LoadComponentScript("CommodityExportManager.js");

INVALID_ENTITY = 0;
IID_PlayerManager = 4;
IID_Health = 70;

const g_Errors = [];
error = function(message)
{
	g_Errors.push(String(message));
};

let g_SettlementIds = [];
let g_LinkIds = [];
let g_ProducerIds = [];
let g_Hitpoints = 100;

AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
	"GetSovereignOwner": pos => pos.x <= 256 ? 1 : pos.x <= 512 ? 2 : INVALID_PLAYER
});
AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 3
});

Engine.GetEntitiesWithInterface = function(iid)
{
	if (iid === IID_NationSettlement)
		return g_SettlementIds.slice();
	if (iid === IID_InfrastructureLink)
		return g_LinkIds.slice();
	if (iid === IID_CommodityProducer)
		return g_ProducerIds.slice();
	return [];
};

function place(entity, x)
{
	AddMock(entity, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": x, "y": 100 })
	});
	AddMock(entity, IID_Ownership, {
		"GetOwner": () => 1
	});
	AddMock(entity, IID_Health, {
		"GetMaxHitpoints": () => 100,
		"GetHitpoints": () => g_Hitpoints
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

function link(entity, from, to)
{
	g_LinkIds.push(entity);
	return ConstructComponent(entity, "InfrastructureLink", {
		"From": String(from),
		"To": String(to)
	});
}

function producer(entity, stock)
{
	g_ProducerIds.push(entity);
	return ConstructComponent(entity, "CommodityProducer", {
		"Commodity": "cocoa",
		"ProductionPerTick": "100",
		"Stock": String(stock)
	});
}

function start(links)
{
	ResetState();
	g_Errors.length = 0;
	g_SettlementIds = [];
	g_LinkIds = [];
	g_ProducerIds = [];
	g_Hitpoints = 100;
	AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
		"GetSovereignOwner": pos => pos.x <= 256 ? 1 : pos.x <= 512 ? 2 : INVALID_PLAYER
	});
	AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
		"GetNumPlayers": () => 3
	});
	const cmpTimer = ConstructComponent(SYSTEM_ENTITY, "Timer");
	const cmpSettlements = ConstructComponent(SYSTEM_ENTITY, "NationSettlementManager");
	const cmpConnectivity = ConstructComponent(SYSTEM_ENTITY, "SettlementConnectivity");
	const cmpTransport = ConstructComponent(SYSTEM_ENTITY, "TransportEfficiency");
	const cmpFinance = ConstructComponent(SYSTEM_ENTITY, "GovernmentFinance");
	const cmpProduction = ConstructComponent(SYSTEM_ENTITY, "CommodityProductionManager");
	const cmpExport = ConstructComponent(SYSTEM_ENTITY, "CommodityExportManager");
	global.InitAttributes = {
		"settings": {
			"SettlementConnectivity": links,
			"GovernmentFinance": [{ "player": 1, "treasury": 10000000 }]
		}
	};
	cmpFinance.OnInitGame();
	cmpProduction.OnInitGame();
	cmpExport.OnInitGame();
	return {
		"cmpTimer": cmpTimer,
		"cmpSettlements": cmpSettlements,
		"cmpConnectivity": cmpConnectivity,
		"cmpTransport": cmpTransport,
		"cmpFinance": cmpFinance,
		"cmpProduction": cmpProduction,
		"cmpExport": cmpExport,
		"links": links
	};
}

function begin(world)
{
	world.cmpConnectivity.OnInitGame();
	world.cmpConnectivity.OnInitGame();
}

function advance(cmpTimer, seconds)
{
	cmpTimer.OnUpdate({ "turnLength": seconds });
}

// Sandbox route: Southern — abstract — Northern — physical road — Capital.
let world = start([{ "from": 31, "to": 33 }]);
settlement(30, "Capital", 18000, 90, 90, true);
settlement(31, "Northern Village", 5000, 35, 70, false);
settlement(32, "Western Village", 3500, 20, 40, false);
const southern = settlement(33, "Southern Village", 7000, 55, 190, false);
settlement(34, "Eastern Village", 4000, 40, 420, false);
const cocoa = producer(33, 200);
const road = link(40, 30, 31);
begin(world);

TS_ASSERT_EQUALS(road.GetCondition(), 100);
TS_ASSERT_EQUALS(road.GetConditionFraction(), 1);
TS_ASSERT_EQUALS(road.IsOperational(), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(31), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(33), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(32), false);
const healthyPath = world.cmpConnectivity.GetPathToCapital(33);
TS_ASSERT_EQUALS(healthyPath.length, 3);
TS_ASSERT_EQUALS(healthyPath[0], 33);
TS_ASSERT_EQUALS(healthyPath[1], 31);
TS_ASSERT_EQUALS(healthyPath[2], 30);
TS_ASSERT_EQUALS(world.cmpTransport.GetRouteCondition(33), 100);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(33), 1);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(32), 0);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(30), 0);

world.cmpExport.ApplyExports();
TS_ASSERT_EQUALS(cocoa.GetStock(), 0);
TS_ASSERT_EQUALS(world.cmpExport.GetTotalExported(1, "cocoa"), 200);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10002000);

// Partial damage reduces the export and leaves the rest in stock. Connectivity remains.
cocoa.Produce();
cocoa.Produce();
TS_ASSERT_EQUALS(cocoa.GetStock(), 200);
TS_ASSERT_EQUALS(road.SetCondition(50), true);
TS_ASSERT_EQUALS(road.GetConditionFraction(), 0.5);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(33), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(31), true);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(33), 0.5);
const paid = world.cmpFinance.GetTreasury(1);
world.cmpExport.ApplyExports();
TS_ASSERT_EQUALS(cocoa.GetStock(), 100);
TS_ASSERT_EQUALS(world.cmpExport.GetTotalExported(1, "cocoa"), 300);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), paid + 1000);

TS_ASSERT_EQUALS(road.SetCondition(25), true);
world.cmpExport.ApplyExports();
TS_ASSERT_EQUALS(cocoa.GetStock(), 75);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), paid + 1000 + 250);

// Zero condition severs the physical edge. Abstract Northern–Southern remains, but cannot reach the capital.
TS_ASSERT_EQUALS(road.SetCondition(0), true);
TS_ASSERT_EQUALS(road.IsOperational(), false);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(31), false);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(33), false);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(33), 0);
TS_ASSERT_EQUALS(world.cmpConnectivity.GetPathToCapital(33).length, 0);
const stuck = world.cmpFinance.GetTreasury(1);
const stuckStock = cocoa.GetStock();
world.cmpExport.ApplyExports();
TS_ASSERT_EQUALS(cocoa.GetStock(), stuckStock);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), stuck);

// Health damage writes the same condition. Restoration uses SetCondition because Health cannot rise from 0.
place(40);
g_Hitpoints = 40;
road.OnHealthChanged();
TS_ASSERT_EQUALS(road.GetCondition(), 40);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(33), true);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(33), 0.4);
g_Hitpoints = 0;
road.OnHealthChanged();
TS_ASSERT_EQUALS(road.GetCondition(), 0);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(33), false);
TS_ASSERT_EQUALS(road.SetCondition(100), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(33), true);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(33), 1);

// Destroying the road entity drops only that physical source.
road.OnDestroy();
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(31), false);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(33), false);

// A scenario edge for the same pair survives loss of the physical road.
world = start([{ "from": 30, "to": 31 }]);
settlement(30, "Capital", 1000, 90, 90, true);
const doubled = settlement(31, "Northern Village", 1000, 35, 70, false);
const doubledRoad = link(40, 30, 31);
begin(world);
TS_ASSERT_EQUALS(world.cmpConnectivity.Neighbors(30).length, 1);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(31), 1);
TS_ASSERT_EQUALS(doubledRoad.SetCondition(0), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(31), true);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(31), 1);
doubledRoad.OnDestroy();
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(31), true);
TS_ASSERT_EQUALS(doubled.GetStateIntegration(), 35);

// A path through Neighbor is not a domestic export route.
world = start([
	{ "from": 30, "to": 34 },
	{ "from": 34, "to": 33 }
]);
settlement(30, "Capital", 1000, 90, 90, true);
settlement(34, "Eastern Village", 1000, 40, 420, false);
settlement(33, "Southern Village", 1000, 55, 190, false);
begin(world);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(33), false);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(33), 0);
TS_ASSERT_EQUALS(world.cmpConnectivity.GetPathToCapital(33).length, 0);

// No capital, no route.
world = start([{ "from": 31, "to": 33 }]);
settlement(31, "Northern Village", 1000, 35, 70, false);
settlement(33, "Southern Village", 1000, 55, 190, false);
begin(world);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(33), 0);

// Integration follows the binary connection. Partial damage still grows. Zero condition stops it.
world = start([{ "from": 31, "to": 33 }]);
settlement(30, "Capital", 18000, 90, 90, true);
const north = settlement(31, "Northern Village", 5000, 35, 70, false);
const west = settlement(32, "Western Village", 3500, 20, 40, false);
const south = settlement(33, "Southern Village", 7000, 55, 190, false);
const repairRoad = link(40, 30, 31);
begin(world);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(north.GetStateIntegration(), 36);
TS_ASSERT_EQUALS(south.GetStateIntegration(), 56);
TS_ASSERT_EQUALS(west.GetStateIntegration(), 20);
TS_ASSERT_EQUALS(repairRoad.SetCondition(50), true);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(north.GetStateIntegration(), 37);
TS_ASSERT_EQUALS(south.GetStateIntegration(), 57);
TS_ASSERT_EQUALS(repairRoad.SetCondition(0), true);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(north.GetStateIntegration(), 37);
TS_ASSERT_EQUALS(south.GetStateIntegration(), 57);
TS_ASSERT_EQUALS(repairRoad.SetCondition(100), true);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(north.GetStateIntegration(), 38);
TS_ASSERT_EQUALS(south.GetStateIntegration(), 58);

// Population revenue does not read the road. A closed road still pays the population tick and keeps the cocoa.
world = start([{ "from": 31, "to": 33 }]);
settlement(30, "Capital", 10000, 90, 90, true);
settlement(31, "Northern Village", 0, 35, 70, false);
settlement(33, "Southern Village", 0, 55, 190, false);
const held = producer(33, 200);
const closed = link(40, 30, 31);
begin(world);
TS_ASSERT_EQUALS(closed.SetCondition(0), true);
TS_ASSERT_EQUALS(world.cmpFinance.GetRevenuePerTick(1), 100);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000100);
TS_ASSERT_EQUALS(held.GetStock(), 300);
advance(world.cmpTimer, 15);
TS_ASSERT_EQUALS(held.GetStock(), 400);
TS_ASSERT_EQUALS(world.cmpExport.GetTotalExported(1, "cocoa"), 0);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000200);

// Save and load keep the damaged road, the unsold stock, and a single set of timers.
world = start([{ "from": 31, "to": 33 }]);
settlement(30, "Capital", 0, 90, 90, true);
settlement(31, "Northern Village", 0, 35, 70, false);
const savedSouth = settlement(33, "Southern Village", 0, 55, 190, false);
const savedCocoa = producer(33, 0);
const savedRoad = link(40, 30, 31);
begin(world);
TS_ASSERT_EQUALS(savedRoad.SetCondition(50), true);
advance(world.cmpTimer, 4);
TS_ASSERT_EQUALS(savedCocoa.GetStock(), 0);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 4);

world.cmpTimer = SerializationCycle(world.cmpTimer);
world.cmpConnectivity = SerializationCycle(world.cmpConnectivity);
world.cmpTransport = SerializationCycle(world.cmpTransport);
world.cmpFinance = SerializationCycle(world.cmpFinance);
world.cmpProduction = SerializationCycle(world.cmpProduction);
world.cmpExport = SerializationCycle(world.cmpExport);
const loadedRoad = SerializationCycle(savedRoad);
SerializationCycle(savedSouth);
TS_ASSERT_EQUALS(loadedRoad.GetCondition(), 50);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 4);
world.cmpConnectivity.OnInitGame();
world.cmpProduction.OnInitGame();
world.cmpExport.OnInitGame();
world.cmpFinance.OnInitGame();
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 4);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(33), 0.5);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(33), true);

advance(world.cmpTimer, 6);
TS_ASSERT_EQUALS(Engine.QueryInterface(33, IID_CommodityProducer).GetStock(), 100);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(Engine.QueryInterface(33, IID_CommodityProducer).GetStock(), 200);
advance(world.cmpTimer, 5);
TS_ASSERT_EQUALS(Engine.QueryInterface(33, IID_CommodityProducer).GetStock(), 100);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10001000);
TS_ASSERT_EQUALS(world.cmpExport.GetTotalExported(1, "cocoa"), 100);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(33), 0.5);
