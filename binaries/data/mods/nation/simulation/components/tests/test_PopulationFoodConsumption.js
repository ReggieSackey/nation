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
Engine.RegisterInterface("ObstructionManager");
Engine.RegisterInterface("StatisticsTracker");
Engine.RegisterInterface("Mirage");
Engine.RegisterInterface("Visual");
Engine.RegisterInterface("Health");
Engine.RegisterInterface("Fogging");
Engine.RegisterInterface("Diplomacy");
Engine.LoadHelperScript("Player.js");
Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("interfaces/Player.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("interfaces/NationSettlement.js");
Engine.LoadComponentScript("interfaces/NationSettlementManager.js");
Engine.LoadComponentScript("interfaces/ResourceDropsite.js");
Engine.LoadComponentScript("interfaces/ResourceGatherer.js");
Engine.LoadComponentScript("interfaces/UnitAI.js");
Engine.LoadComponentScript("interfaces/ResourceSupply.js");
Engine.LoadComponentScript("interfaces/PopulationFoodConsumption.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("Player.js");
Engine.LoadComponentScript("NationSettlement.js");
Engine.LoadComponentScript("NationSettlementManager.js");
Engine.LoadComponentScript("ResourceDropsite.js");
Engine.LoadComponentScript("ResourceGatherer.js");
Engine.LoadComponentScript("ResourceSupply.js");
Engine.LoadComponentScript("PopulationFoodConsumption.js");

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

AddMock(SYSTEM_ENTITY, IID_ObstructionManager, {
	"IsInTargetRange": () => true
});

function start(food1, food2, food3)
{
	ResetState();
	g_Settlements = [];
	AddMock(SYSTEM_ENTITY, IID_ObstructionManager, {
		"IsInTargetRange": () => true
	});
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
	const p1 = ConstructComponent(1, "Player", playerTemplate);
	const p2 = ConstructComponent(2, "Player", playerTemplate);
	const p3 = ConstructComponent(3, "Player", playerTemplate);
	p1.SetPlayerID(1);
	p2.SetPlayerID(2);
	p3.SetPlayerID(3);
	p1.SetResourceCounts({ "food": food1 });
	p2.SetResourceCounts({ "food": food2 });
	p3.SetResourceCounts({ "food": food3 });
	return { "cmpTimer": cmpTimer, "cmpFood": cmpFood, "p1": p1, "p2": p2, "p3": p3 };
}

function settlement(id, population, x, owner)
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
		"Name": "Place",
		"Population": String(population),
		"StateIntegration": "20",
		"IsCapital": "false"
	});
}

function nation(world)
{
	// Owned by player 2, standing in player 1 land.
	settlement(30, 18000, 90, 2);
	settlement(31, 5000, 70, 2);
	settlement(32, 3500, 40, 2);
	settlement(33, 7000, 180, 2);
	// Owned by player 1, standing in player 2 land.
	settlement(34, 4000, 420, 1);
}

function advance(cmpTimer, seconds)
{
	cmpTimer.OnUpdate({ "turnLength": seconds });
}

let world = start(1000, 300, 500);
nation(world);
let before = world.cmpFood.GetFoodStatus(1);
TS_ASSERT_EQUALS(before.population, 33500);
TS_ASSERT_EQUALS(before.required, 335);
TS_ASSERT_EQUALS(before.consumed, 0);
TS_ASSERT_EQUALS(before.unmet, 0);
TS_ASSERT_EQUALS(before.shortageBps, 0);
TS_ASSERT_EQUALS(before.fulfillmentBps, 10000);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(2).required, 40);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(3).required, 0);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(0), null);

world.cmpFood.ConsumeFood();
let status = world.cmpFood.GetFoodStatus(1);
TS_ASSERT_EQUALS(status.required, 335);
TS_ASSERT_EQUALS(status.consumed, 335);
TS_ASSERT_EQUALS(status.unmet, 0);
TS_ASSERT_EQUALS(status.fulfillmentBps, 10000);
TS_ASSERT_EQUALS(status.shortageBps, 0);
TS_ASSERT_EQUALS(status.cumulativeUnmet, 0);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 665);
TS_ASSERT_EQUALS(world.p1.GetPopulationCount(), 0);
status = world.cmpFood.GetFoodStatus(2);
TS_ASSERT_EQUALS(status.population, 4000);
TS_ASSERT_EQUALS(status.required, 40);
TS_ASSERT_EQUALS(status.consumed, 40);
TS_ASSERT_EQUALS(status.unmet, 0);
TS_ASSERT_EQUALS(world.p2.GetResourceCounts().food, 260);
status = world.cmpFood.GetFoodStatus(3);
TS_ASSERT_EQUALS(status.population, 0);
TS_ASSERT_EQUALS(status.required, 0);
TS_ASSERT_EQUALS(status.consumed, 0);
TS_ASSERT_EQUALS(status.unmet, 0);
TS_ASSERT_EQUALS(status.fulfillmentBps, 10000);
TS_ASSERT_EQUALS(status.shortageBps, 0);
TS_ASSERT_EQUALS(world.p3.GetResourceCounts().food, 500);

world = start(100, 300, 0);
nation(world);
world.cmpFood.ConsumeFood();
status = world.cmpFood.GetFoodStatus(1);
TS_ASSERT_EQUALS(status.consumed, 100);
TS_ASSERT_EQUALS(status.unmet, 235);
TS_ASSERT_EQUALS(status.fulfillmentBps, 2985);
TS_ASSERT_EQUALS(status.shortageBps, 7015);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 0);
world.cmpFood.ConsumeFood();
world.cmpFood.ConsumeFood();
status = world.cmpFood.GetFoodStatus(1);
TS_ASSERT_EQUALS(status.consumed, 0);
TS_ASSERT_EQUALS(status.unmet, 335);
TS_ASSERT_EQUALS(status.fulfillmentBps, 0);
TS_ASSERT_EQUALS(status.shortageBps, 10000);
TS_ASSERT_EQUALS(status.cumulativeUnmet, 235 + 335 + 335);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 0);

world.p1.AddResource("food", 1000);
world.cmpFood.ConsumeFood();
status = world.cmpFood.GetFoodStatus(1);
TS_ASSERT_EQUALS(status.consumed, 335);
TS_ASSERT_EQUALS(status.unmet, 0);
TS_ASSERT_EQUALS(status.shortageBps, 0);
TS_ASSERT_EQUALS(status.fulfillmentBps, 10000);
TS_ASSERT_EQUALS(status.cumulativeUnmet, 235 + 335 + 335);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 665);

world = start(0, 0, 0);
nation(world);
world.cmpFood.ConsumeFood();
status = world.cmpFood.GetFoodStatus(1);
TS_ASSERT_EQUALS(status.consumed, 0);
TS_ASSERT_EQUALS(status.unmet, 335);
TS_ASSERT_EQUALS(status.shortageBps, 10000);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 0);

world = start(1000, 300, 0);
nation(world);
const farmer = ConstructComponent(51, "ResourceGatherer", {
	"MaxDistance": "2",
	"BaseSpeed": "1",
	"Rates": { "food.grain": "0.5" },
	"Capacities": { "food": "10" }
});
ConstructComponent(50, "ResourceSupply", {
	"KillBeforeGather": "false",
	"Max": "Infinity",
	"Type": "food.grain",
	"MaxGatherers": "5"
});
ConstructComponent(33, "ResourceDropsite", {
	"Types": "food",
	"Sharable": "false"
});
AddMock(51, IID_Ownership, { "GetOwner": () => 1 });
farmer.OnGlobalInitGame();
TS_ASSERT_EQUALS(farmer.StartGathering(50), true);
advance(world.cmpTimer, 20);
TS_ASSERT_EQUALS(farmer.GetCarryingStatus()[0].amount, 10);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 1000);
farmer.CommitResources(33);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 1010);
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 675);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).consumed, 335);
TS_ASSERT_EQUALS(world.p2.GetResourceCounts().food, 260);

world = start(1000, 300, 500);
nation(world);
world.cmpFood.OnInitGame();
const timers = world.cmpTimer.timers.size;
world.cmpFood.OnInitGame();
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, timers);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 665);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 330);

world.p1.SetResourceCounts({ "food": 100 });
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 0);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).cumulativeUnmet, 235);
const savedTimers = world.cmpTimer.timers.size;
world.cmpFood = SerializationCycle(world.cmpFood);
world.p1 = SerializationCycle(world.p1);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, savedTimers);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 0);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).cumulativeUnmet, 235);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).shortageBps, 7015);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 0);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).unmet, 335);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).cumulativeUnmet, 235 + 335);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, savedTimers);

// Avémé's population is Adomé's demand. It does not raise Densira's.
world = start(4200, 30000, 0);
settlement(30, 18000, 90, 1);
settlement(31, 5000, 70, 1);
settlement(32, 3500, 40, 1);
settlement(33, 7000, 180, 1);
settlement(35, 12000, 420, 2);
TS_ASSERT_EQUALS(world.cmpFood.Interval, 10000);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).population, 33500);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).required, 335);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(2).population, 12000);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(2).required, 120);
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 4200 - 335);
TS_ASSERT_EQUALS(world.p2.GetResourceCounts().food, 30000 - 120);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).shortageBps, 0);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(2).shortageBps, 0);
