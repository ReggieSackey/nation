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
let g_RoadOwner = 1;

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

function place(entity, x)
{
	AddMock(entity, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": x, "y": 100 })
	});
	AddMock(entity, IID_Ownership, {
		"GetOwner": () => g_RoadOwner
	});
}

function settlement(entity, name, x, isCapital)
{
	place(entity, x);
	g_SettlementIds.push(entity);
	return ConstructComponent(entity, "NationSettlement", {
		"Name": name,
		"Population": "0",
		"StateIntegration": "55",
		"IsCapital": isCapital ? "true" : "false"
	});
}

function start(treasury)
{
	ResetState();
	g_Errors.length = 0;
	g_SettlementIds = [];
	g_LinkIds = [];
	g_ProducerIds = [];
	g_RoadOwner = 1;
	AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
		"GetSovereignOwner": pos => pos.x <= 256 ? 1 : pos.x <= 512 ? 2 : INVALID_PLAYER
	});
	const cmpConnectivity = ConstructComponent(SYSTEM_ENTITY, "SettlementConnectivity");
	const cmpTransport = ConstructComponent(SYSTEM_ENTITY, "TransportEfficiency");
	const cmpFinance = ConstructComponent(SYSTEM_ENTITY, "GovernmentFinance");
	const cmpInvestment = ConstructComponent(SYSTEM_ENTITY, "InfrastructureInvestment");
	global.InitAttributes = {
		"settings": {
			"SettlementConnectivity": [{ "from": 31, "to": 33 }],
			"GovernmentFinance": [{ "player": 1, "treasury": treasury }, { "player": 2, "treasury": treasury }]
		}
	};
	cmpFinance.OnInitGame();
	settlement(30, "Capital", 90, true);
	settlement(31, "Northern Village", 70, false);
	settlement(33, "Southern Village", 190, false);
	g_LinkIds.push(40);
	const road = ConstructComponent(40, "InfrastructureLink", {
		"From": "30",
		"To": "31"
	});
	place(40, 80);
	cmpConnectivity.OnInitGame();
	return {
		"cmpConnectivity": cmpConnectivity,
		"cmpTransport": cmpTransport,
		"cmpFinance": cmpFinance,
				"cmpInvestment": cmpInvestment,
		"road": road
	};
}

let world = start(10000000);
TS_ASSERT_EQUALS(world.cmpInvestment.RepairCost(100), 0);
TS_ASSERT_EQUALS(world.cmpInvestment.RepairCost(75), 250000);
TS_ASSERT_EQUALS(world.cmpInvestment.RepairCost(50), 500000);
TS_ASSERT_EQUALS(world.cmpInvestment.RepairCost(0), 1000000);
TS_ASSERT_EQUALS(world.cmpInvestment.RepairCost(-1), null);
const healthy = world.cmpInvestment.GetRepairQuote(1, 40);
TS_ASSERT_EQUALS(healthy.repairable, false);
TS_ASSERT_EQUALS(healthy.cost, 0);
TS_ASSERT_EQUALS(healthy.condition, 100);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(1, 40), false);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);
TS_ASSERT_EQUALS(world.road.GetCondition(), 100);

TS_ASSERT_EQUALS(world.road.SetCondition(50), true);
const quote = world.cmpInvestment.GetRepairQuote(1, 40);
TS_ASSERT_EQUALS(quote.repairable, true);
TS_ASSERT_EQUALS(quote.cost, 500000);
TS_ASSERT_EQUALS(quote.canAfford, true);
TS_ASSERT_EQUALS(quote.condition, 50);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(33), 0.5);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(1, 40), true);
TS_ASSERT_EQUALS(world.road.GetCondition(), 100);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9500000);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(33), 1);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(33), true);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(1, 40), false);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9500000);
TS_ASSERT_EQUALS(world.road.GetCondition(), 100);

// The link owner repairs it. Another state cannot, even inside its own settlements' territory.
world = start(10000000);
g_RoadOwner = 2;
place(40, 80);
TS_ASSERT_EQUALS(world.road.SetCondition(40), true);
TS_ASSERT_EQUALS(world.cmpInvestment.GetRepairQuote(1, 40).authorized, false);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(1, 40), false);
TS_ASSERT_EQUALS(world.road.GetCondition(), 40);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(2, 40), true);
TS_ASSERT_EQUALS(world.road.GetCondition(), 100);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(2), 9400000);

world = start(10000000);
TS_ASSERT_EQUALS(world.road.SetCondition(50), true);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(2, 40), false);
TS_ASSERT_EQUALS(world.road.GetCondition(), 50);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(2), 10000000);
TS_ASSERT_EQUALS(world.cmpInvestment.GetRepairQuote(2, 40).authorized, false);

world = start(10000000);
settlement(34, "Eastern Village", 420, false);
g_LinkIds.push(41);
const foreignRoad = ConstructComponent(41, "InfrastructureLink", {
	"From": "33",
	"To": "34"
});
TS_ASSERT_EQUALS(foreignRoad.SetCondition(20), true);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(1, 41), false);
TS_ASSERT_EQUALS(foreignRoad.GetCondition(), 20);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);
g_RoadOwner = 4;
place(41, 300);
world.cmpFinance.AddFunds(4, 2000000);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(1, 41), false);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(4, 41), true);
TS_ASSERT_EQUALS(foreignRoad.GetCondition(), 100);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(4), 1200000);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);

world = start(200000);
TS_ASSERT_EQUALS(world.road.SetCondition(50), true);
TS_ASSERT_EQUALS(world.cmpInvestment.GetRepairQuote(1, 40).canAfford, false);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(1, 40), false);
TS_ASSERT_EQUALS(world.road.GetCondition(), 50);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 200000);

world = start(10000000);
TS_ASSERT_EQUALS(world.road.SetCondition(0), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(31), false);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(33), false);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(33), 0);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(1, 40), true);
TS_ASSERT_EQUALS(world.road.GetCondition(), 100);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9000000);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(33), true);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(31), true);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(33), 1);

world = start(10000000);
TS_ASSERT_EQUALS(world.road.SetCondition(0), true);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(0, 40), false);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(-1, 40), false);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(1, 0), false);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(1, 99), false);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(1.5, 40), false);
TS_ASSERT_EQUALS(world.road.GetCondition(), 0);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);

g_Commands = {};
RegisterInfrastructureRepairCommand();
TS_ASSERT_EQUALS(world.road.SetCondition(75), true);
g_Commands["nation-repair-infrastructure"](1, { "entity": "nope" });
TS_ASSERT_EQUALS(world.road.GetCondition(), 75);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);
g_Commands["nation-repair-infrastructure"](1, {});
TS_ASSERT_EQUALS(world.road.GetCondition(), 75);
g_Commands["nation-repair-infrastructure"](2, { "entity": 40 });
TS_ASSERT_EQUALS(world.road.GetCondition(), 75);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(2), 10000000);
g_Commands["nation-repair-infrastructure"](1, { "entity": 40 });
TS_ASSERT_EQUALS(world.road.GetCondition(), 100);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9750000);

world = start(10000000);
TS_ASSERT_EQUALS(world.road.SetCondition(50), true);
world.cmpFinance = SerializationCycle(world.cmpFinance);
world.cmpConnectivity = SerializationCycle(world.cmpConnectivity);
world.road = SerializationCycle(world.road);
world.cmpInvestment = SerializationCycle(world.cmpInvestment);
TS_ASSERT_EQUALS(world.road.GetCondition(), 50);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);
TS_ASSERT_EQUALS(world.cmpInvestment.Repair(1, 40), true);
world.cmpFinance = SerializationCycle(world.cmpFinance);
world.road = SerializationCycle(world.road);
world.cmpConnectivity = SerializationCycle(world.cmpConnectivity);
TS_ASSERT_EQUALS(world.road.GetCondition(), 100);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9500000);
TS_ASSERT_EQUALS(world.cmpConnectivity.IsConnectedToCapital(33), true);
TS_ASSERT_EQUALS(world.cmpTransport.GetEfficiency(33), 1);
