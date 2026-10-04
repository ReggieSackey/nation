Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("interfaces/NationSettlement.js");
Engine.LoadComponentScript("NationSettlement.js");
Engine.LoadComponentScript("interfaces/NationSettlementManager.js");
Engine.LoadComponentScript("NationSettlementManager.js");
Engine.LoadComponentScript("interfaces/GovernmentFinance.js");
Engine.LoadComponentScript("GovernmentFinance.js");

IID_PlayerManager = 4;

const g_Errors = [];
error = function(message)
{
	g_Errors.push(String(message));
};

let g_SettlementIds = [];

AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
	"GetSovereignOwner": pos => pos.x <= 256 ? 1 : pos.x <= 512 ? 2 : INVALID_PLAYER
});

AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 3
});

Engine.GetEntitiesWithInterface = function(iid)
{
	if (iid !== IID_NationSettlement)
		return [];
	return g_SettlementIds.slice();
};

function place(entity, x)
{
	AddMock(entity, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": x, "y": 100 })
	});
}

function settlement(entity, name, population, x)
{
	place(entity, x);
	g_SettlementIds.push(entity);
	return ConstructComponent(entity, "NationSettlement", {
		"Name": name,
		"Population": String(population),
		"StateIntegration": "10",
		"IsCapital": "false"
	});
}

function start(accounts)
{
	ResetState();
	g_Errors.length = 0;
	g_SettlementIds = [];
	AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
		"GetSovereignOwner": pos => pos.x <= 256 ? 1 : pos.x <= 512 ? 2 : INVALID_PLAYER
	});
	AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
		"GetNumPlayers": () => 3
	});
	const cmpTimer = ConstructComponent(SYSTEM_ENTITY, "Timer");
	ConstructComponent(SYSTEM_ENTITY, "NationSettlementManager");
	const cmpFinance = ConstructComponent(SYSTEM_ENTITY, "GovernmentFinance");
	global.InitAttributes = {
		"settings": {
			"GovernmentFinance": accounts
		}
	};
	cmpFinance.OnInitGame();
	cmpFinance.OnInitGame();
	return {
		"cmpTimer": cmpTimer,
		"cmpFinance": cmpFinance
	};
}

function advance(cmpTimer, seconds)
{
	cmpTimer.OnUpdate({ "turnLength": seconds });
}

let world = start([
	{ "player": 1, "treasury": 10000000 },
	{ "player": 2, "treasury": 5000000 }
]);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(2), 5000000);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(3), 0);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);

world = start(undefined);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 0);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(2), 0);

g_Errors.length = 0;
world = start([{ "player": 1, "treasury": -1 }]);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 0);
TS_ASSERT(g_Errors.length > 0);

g_Errors.length = 0;
world = start([
	{ "player": 1, "treasury": 10 },
	{ "player": 1, "treasury": 20 }
]);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 0);
TS_ASSERT(g_Errors.length > 0);

world = start([
	{ "player": 1, "treasury": 10000000 },
	{ "player": 2, "treasury": 5000000 }
]);
settlement(1, "Capital", 18000, 100);
settlement(2, "Northern Village", 5000, 80);
settlement(3, "Western Village", 3500, 40);
settlement(4, "Southern Village", 7000, 180);
settlement(5, "Eastern Village", 4000, 400);
TS_ASSERT_EQUALS(world.cmpFinance.GetRevenuePerTick(1), 335);
TS_ASSERT_EQUALS(world.cmpFinance.GetRevenuePerTick(2), 40);
TS_ASSERT_EQUALS(world.cmpFinance.GetRevenuePerTick(3), 0);

advance(world.cmpTimer, 4);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);

world.cmpTimer = SerializationCycle(world.cmpTimer);
world.cmpFinance = SerializationCycle(world.cmpFinance);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);
world.cmpFinance.OnInitGame();
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);

advance(world.cmpTimer, 6);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000335);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(2), 5000040);

TS_ASSERT_EQUALS(world.cmpFinance.Spend(1, 100000), true);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9900335);
TS_ASSERT_EQUALS(world.cmpFinance.Spend(1, 20000000), false);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9900335);
TS_ASSERT_EQUALS(world.cmpFinance.Spend(1, -100), false);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9900335);
TS_ASSERT_EQUALS(world.cmpFinance.Spend(0, 1), false);
TS_ASSERT_EQUALS(world.cmpFinance.CanAfford(1, 9900335), true);
TS_ASSERT_EQUALS(world.cmpFinance.CanAfford(1, 9900336), false);

world.cmpTimer = SerializationCycle(world.cmpTimer);
world.cmpFinance = SerializationCycle(world.cmpFinance);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9900335);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(2), 5000040);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);

advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9900670);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(2), 5000080);

Engine.QueryInterface(1, IID_NationSettlement).population = 8000;
TS_ASSERT_EQUALS(world.cmpFinance.GetRevenuePerTick(1), 235);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9900905);

world = start([{ "player": 1, "treasury": 1000 }]);
TS_ASSERT_EQUALS(world.cmpFinance.Spend(1, 400), true);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 600);
TS_ASSERT_EQUALS(world.cmpFinance.Spend(1, 700), false);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 600);
TS_ASSERT_EQUALS(world.cmpFinance.Spend(1, -100), false);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 600);
TS_ASSERT_EQUALS(world.cmpFinance.AddFunds(1, 500), true);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 1100);
TS_ASSERT_EQUALS(world.cmpFinance.AddFunds(1, -10), false);
TS_ASSERT_EQUALS(world.cmpFinance.AddFunds(1, 0), false);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 1100);
TS_ASSERT_EQUALS(world.cmpFinance.AddFunds(2, 25), true);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(2), 25);
