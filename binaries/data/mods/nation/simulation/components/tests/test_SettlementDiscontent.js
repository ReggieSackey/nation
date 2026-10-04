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
Engine.LoadHelperScript("Player.js");
Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("interfaces/Player.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("interfaces/NationSettlement.js");
Engine.LoadComponentScript("interfaces/NationSettlementManager.js");
Engine.LoadComponentScript("interfaces/PopulationFoodConsumption.js");
Engine.LoadComponentScript("interfaces/SettlementDiscontent.js");
Engine.LoadComponentScript("interfaces/GovernmentFinance.js");
Engine.LoadComponentScript("interfaces/TradeAccess.js");
Engine.LoadComponentScript("interfaces/FoodImportManager.js");
Engine.LoadComponentScript("interfaces/SettlementConnectivity.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("Player.js");
Engine.LoadComponentScript("NationSettlement.js");
Engine.LoadComponentScript("NationSettlementManager.js");
Engine.LoadComponentScript("PopulationFoodConsumption.js");
Engine.LoadComponentScript("GovernmentFinance.js");
Engine.LoadComponentScript("TradeAccess.js");
Engine.LoadComponentScript("FoodImportManager.js");
Engine.LoadComponentScript("SettlementConnectivity.js");
Engine.LoadComponentScript("SettlementDiscontent.js");

const playerTemplate = {
	"SpyCostMultiplier": "1",
	"BarterMultiplier": {
		"Buy": { "food": "1", "wood": "1", "stone": "1", "metal": "1" },
		"Sell": { "food": "1", "wood": "1", "stone": "1", "metal": "1" }
	},
	"Formations": { "_string": "" }
};

let g_Settlements = [];
Engine.GetEntitiesWithInterface = function(iid)
{
	if (iid === IID_NationSettlement)
		return g_Settlements.slice();
	return [];
};

Engine.BroadcastMessage = function(type)
{
	if (type !== MT_FoodConsumptionCompleted)
		return;
	const cmpDiscontent = Engine.QueryInterface(SYSTEM_ENTITY, IID_SettlementDiscontent);
	if (cmpDiscontent)
		cmpDiscontent.OnGlobalFoodConsumptionCompleted();
};

function start(food1, food2)
{
	ResetState();
	g_Settlements = [];
	AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
		"GetSovereignOwner": pos => pos.x <= 256 ? 1 : pos.x <= 512 ? 2 : INVALID_PLAYER
	});
	AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
		"GetNumPlayers": () => 4,
		"GetPlayerByID": id => id
	});
	const cmpTimer = ConstructComponent(SYSTEM_ENTITY, "Timer");
	ConstructComponent(SYSTEM_ENTITY, "NationSettlementManager");
	const cmpFood = ConstructComponent(SYSTEM_ENTITY, "PopulationFoodConsumption");
	const cmpDiscontent = ConstructComponent(SYSTEM_ENTITY, "SettlementDiscontent");
	const p1 = ConstructComponent(1, "Player", playerTemplate);
	const p2 = ConstructComponent(2, "Player", playerTemplate);
	p1.SetPlayerID(1);
	p2.SetPlayerID(2);
	p1.SetResourceCounts({ "food": food1 });
	p2.SetResourceCounts({ "food": food2 });
	return {
		"cmpTimer": cmpTimer,
		"cmpFood": cmpFood,
		"cmpDiscontent": cmpDiscontent,
		"p1": p1,
		"p2": p2
	};
}

function settlement(id, name, population, integration, x, owner, isCapital)
{
	AddMock(id, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": x, "y": 10 })
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
	// Entity owner 2, standing in player 1 land.
	settlement(30, "Capital", 18000, 90, 90, 2, true);
	settlement(31, "Northern Village", 5000, 35, 70, 2, false);
	settlement(32, "Western Village", 3500, 20, 40, 2, false);
	settlement(33, "Southern Village", 7000, 55, 180, 2, false);
	// Entity owner 1, standing in player 2 land.
	settlement(34, "Eastern Village", 4000, 40, 420, 1, false);
}

let world = start(100000, 100000);
nation();
TS_ASSERT_EQUALS(world.cmpDiscontent.GetNationalDiscontent(1), 0);
TS_ASSERT_EQUALS(world.cmpDiscontent.GetNationalDiscontent(3), 0);
TS_ASSERT_EQUALS(world.cmpDiscontent.FoodPressure(0), 0);
TS_ASSERT_EQUALS(world.cmpDiscontent.FoodPressure(2500), 3);
TS_ASSERT_EQUALS(world.cmpDiscontent.FoodPressure(5000), 5);
TS_ASSERT_EQUALS(world.cmpDiscontent.FoodPressure(7500), 8);
TS_ASSERT_EQUALS(world.cmpDiscontent.FoodPressure(10000), 10);
TS_ASSERT_EQUALS(world.cmpDiscontent.IntegrationPenalty(90), 0);
TS_ASSERT_EQUALS(world.cmpDiscontent.IntegrationPenalty(70), 1);
TS_ASSERT_EQUALS(world.cmpDiscontent.IntegrationPenalty(55), 2);
TS_ASSERT_EQUALS(world.cmpDiscontent.IntegrationPenalty(35), 3);
TS_ASSERT_EQUALS(world.cmpDiscontent.IntegrationPenalty(20), 4);
TS_ASSERT_EQUALS(world.cmpDiscontent.IntegrationPenalty(0), 5);
TS_ASSERT_EQUALS(world.cmpDiscontent.DiscontentDelta(0, 20), -5);
TS_ASSERT_EQUALS(world.cmpDiscontent.DiscontentDelta(10000, 90), 10);
TS_ASSERT_EQUALS(world.cmpDiscontent.DiscontentDelta(10000, 20), 14);

world.cmpFood.ConsumeFood();
world.cmpFood.ConsumeFood();
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 0);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent(), 0);
TS_ASSERT_EQUALS(Engine.QueryInterface(33, IID_NationSettlement).GetDiscontent(), 0);
TS_ASSERT_EQUALS(Engine.QueryInterface(34, IID_NationSettlement).GetDiscontent(), 0);
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetStateIntegration(), 90);
TS_ASSERT_EQUALS(world.cmpDiscontent.GetNationalDiscontent(1), 0);

world = start(0, 100000);
nation();
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).shortageBps, 10000);
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 10);
TS_ASSERT_EQUALS(Engine.QueryInterface(31, IID_NationSettlement).GetDiscontent(), 13);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent(), 14);
TS_ASSERT_EQUALS(Engine.QueryInterface(33, IID_NationSettlement).GetDiscontent(), 12);
TS_ASSERT_EQUALS(Engine.QueryInterface(34, IID_NationSettlement).GetDiscontent(), 0);
TS_ASSERT_EQUALS(world.cmpDiscontent.GetNationalDiscontent(1), 11);
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetStateIntegration(), 90);

world.cmpFood.ConsumeFood();
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 30);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent(), 42);
TS_ASSERT_EQUALS(Engine.QueryInterface(33, IID_NationSettlement).GetDiscontent(), 36);

for (let i = 0; i < 20; ++i)
	world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 100);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent(), 100);
TS_ASSERT_EQUALS(world.cmpDiscontent.GetNationalDiscontent(1), 100);

world.p1.AddResource("food", 100000);
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).shortageBps, 0);
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 95);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent(), 95);
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 90);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent(), 90);
for (let i = 0; i < 30; ++i)
	world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 0);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent(), 0);

world = start(0, 100000);
nation();
world.cmpFood.ConsumeFood();
world.cmpFood.ConsumeFood();
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 30);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent(), 42);
world.p1.SetResourceCounts({ "food": 100000 });
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).shortageBps, 0);
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 25);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent(), 37);
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 20);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent(), 32);

world = start(168, 100000);
nation();
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).shortageBps, 4985);
TS_ASSERT_EQUALS(world.cmpDiscontent.FoodPressure(4985), 5);
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 5);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent(), 9);
TS_ASSERT(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent() < 14);
TS_ASSERT(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent() < 10);

world = start(0, 0);
nation();
const cmpFinance = ConstructComponent(SYSTEM_ENTITY, "GovernmentFinance");
const cmpTrade = ConstructComponent(SYSTEM_ENTITY, "TradeAccess");
const cmpImport = ConstructComponent(SYSTEM_ENTITY, "FoodImportManager");
cmpFinance.ReadAccounts([
	{ "player": 1, "treasury": 10000000 },
	{ "player": 2, "treasury": 5000000 }
]);
cmpTrade.ReadGrants([{ "from": 1, "to": 2, "trade": true }]);
cmpImport.ReadOffers([{
	"id": "neighbor-food-import",
	"buyer": 1,
	"seller": 2,
	"resource": "food",
	"amount": 1000,
	"cost": 500000
}]);
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).shortageBps, 10000);
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 10);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent(), 14);
const treasuryBefore = cmpFinance.GetTreasury(1);
TS_ASSERT_EQUALS(cmpImport.Purchase(1, "neighbor-food-import"), true);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 1000);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), treasuryBefore - 500000);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).shortageBps, 10000);
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 10);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent(), 14);
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).shortageBps, 0);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).consumed, 335);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 665);
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 5);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent(), 9);

world = start(0, 100000);
nation();
const cmpConnectivity = ConstructComponent(SYSTEM_ENTITY, "SettlementConnectivity");
cmpConnectivity.AddScenarioEdge(30, 32);
TS_ASSERT_EQUALS(cmpConnectivity.IsConnectedToCapital(32), true);
cmpConnectivity.ApplyConnectivityGrowth();
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetStateIntegration(), 21);
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetStateIntegration(), 90);
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(world.cmpDiscontent.IntegrationPenalty(21), 3);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent(), 13);
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 10);

world = start(0, 100000);
nation();
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 10);
const savedTimers = world.cmpTimer.timers.size;
const savedCapital = SerializationCycle(Engine.QueryInterface(30, IID_NationSettlement));
const savedWest = SerializationCycle(Engine.QueryInterface(32, IID_NationSettlement));
world.cmpFood = SerializationCycle(world.cmpFood);
world.cmpDiscontent = SerializationCycle(world.cmpDiscontent);
TS_ASSERT_EQUALS(savedCapital.GetDiscontent(), 10);
TS_ASSERT_EQUALS(savedWest.GetDiscontent(), 14);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, savedTimers);
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetDiscontent(), 20);
TS_ASSERT_EQUALS(Engine.QueryInterface(32, IID_NationSettlement).GetDiscontent(), 28);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, savedTimers);
