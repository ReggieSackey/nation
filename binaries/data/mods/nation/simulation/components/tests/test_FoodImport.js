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
Engine.LoadComponentScript("interfaces/GovernmentFinance.js");
Engine.LoadComponentScript("interfaces/TradeAccess.js");
Engine.LoadComponentScript("interfaces/FoodImportManager.js");
Engine.LoadComponentScript("interfaces/PopulationFoodConsumption.js");
Engine.LoadComponentScript("interfaces/NationSettlementManager.js");
Engine.LoadComponentScript("interfaces/ResourceDropsite.js");
Engine.LoadComponentScript("interfaces/ResourceGatherer.js");
Engine.LoadComponentScript("interfaces/UnitAI.js");
Engine.LoadComponentScript("interfaces/ResourceSupply.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("Player.js");
Engine.LoadComponentScript("GovernmentFinance.js");
Engine.LoadComponentScript("TradeAccess.js");
Engine.LoadComponentScript("PopulationFoodConsumption.js");
Engine.LoadComponentScript("ResourceDropsite.js");
Engine.LoadComponentScript("ResourceGatherer.js");
Engine.LoadComponentScript("ResourceSupply.js");
Engine.LoadComponentScript("FoodImportManager.js");

const playerTemplate = {
	"SpyCostMultiplier": "1",
	"BarterMultiplier": {
		"Buy": { "food": "1", "wood": "1", "stone": "1", "metal": "1" },
		"Sell": { "food": "1", "wood": "1", "stone": "1", "metal": "1" }
	},
	"Formations": { "_string": "" }
};

const OFFER = "neighbor-food-import";

AddMock(SYSTEM_ENTITY, IID_ObstructionManager, {
	"IsInTargetRange": () => true
});

function start(treasury, food1, food2)
{
	ResetState();
	AddMock(SYSTEM_ENTITY, IID_ObstructionManager, {
		"IsInTargetRange": () => true
	});
	AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
		"GetNumPlayers": () => 4,
		"GetPlayerByID": id => id
	});
	AddMock(SYSTEM_ENTITY, IID_NationSettlementManager, {
		"GetTotalPopulation": id => id === 1 ? 33500 : 0
	});
	const cmpTimer = ConstructComponent(SYSTEM_ENTITY, "Timer");
	const cmpFinance = ConstructComponent(SYSTEM_ENTITY, "GovernmentFinance");
	const cmpTrade = ConstructComponent(SYSTEM_ENTITY, "TradeAccess");
	const cmpFood = ConstructComponent(SYSTEM_ENTITY, "PopulationFoodConsumption");
	const cmpImport = ConstructComponent(SYSTEM_ENTITY, "FoodImportManager");
	const p1 = ConstructComponent(1, "Player", playerTemplate);
	const p2 = ConstructComponent(2, "Player", playerTemplate);
	p1.SetPlayerID(1);
	p2.SetPlayerID(2);
	p1.SetResourceCounts({ "food": food1 });
	p2.SetResourceCounts({ "food": food2 });
	cmpFinance.ReadAccounts([
		{ "player": 1, "treasury": treasury },
		{ "player": 2, "treasury": 5000000 }
	]);
	cmpTrade.ReadGrants([{ "from": 1, "to": 2, "trade": true }]);
	cmpImport.ReadOffers([{
		"id": OFFER,
		"buyer": 1,
		"seller": 2,
		"resource": "food",
		"amount": cmpImport.FoodImportAmount,
		"cost": cmpImport.FoodImportCost
	}]);
	return {
		"cmpTimer": cmpTimer,
		"cmpFinance": cmpFinance,
		"cmpTrade": cmpTrade,
		"cmpFood": cmpFood,
		"cmpImport": cmpImport,
		"p1": p1,
		"p2": p2
	};
}

let world = start(10000000, 0, 300);
TS_ASSERT_EQUALS(world.cmpImport.FoodImportAmount, 1000);
TS_ASSERT_EQUALS(world.cmpImport.FoodImportCost, 500000);

let quote = world.cmpImport.GetQuote(1);
TS_ASSERT_EQUALS(quote.id, OFFER);
TS_ASSERT_EQUALS(quote.seller, 2);
TS_ASSERT_EQUALS(quote.resource, "food");
TS_ASSERT_EQUALS(quote.amount, 1000);
TS_ASSERT_EQUALS(quote.cost, 500000);
TS_ASSERT_EQUALS(quote.tradeAllowed, true);
TS_ASSERT_EQUALS(quote.canAfford, true);
TS_ASSERT_EQUALS(quote.available, true);
TS_ASSERT_EQUALS(world.cmpImport.GetQuote(2), null);
TS_ASSERT_EQUALS(world.cmpImport.GetQuote(0), null);

TS_ASSERT_EQUALS(world.cmpImport.Purchase(1, OFFER), true);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9500000);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 1000);
TS_ASSERT_EQUALS(world.p2.GetResourceCounts().food, 300);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(2), 5000000);

TS_ASSERT_EQUALS(world.cmpImport.Purchase(1, OFFER), true);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9000000);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 2000);
TS_ASSERT_EQUALS(world.cmpImport.GetQuote(1).available, true);

world = start(400000, 0, 300);
quote = world.cmpImport.GetQuote(1);
TS_ASSERT_EQUALS(quote.tradeAllowed, true);
TS_ASSERT_EQUALS(quote.canAfford, false);
TS_ASSERT_EQUALS(quote.available, false);
TS_ASSERT_EQUALS(world.cmpImport.Purchase(1, OFFER), false);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 400000);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 0);
TS_ASSERT_EQUALS(world.p2.GetResourceCounts().food, 300);

world = start(10000000, 0, 300);
world.cmpTrade.ReadGrants([]);
quote = world.cmpImport.GetQuote(1);
TS_ASSERT_EQUALS(quote.tradeAllowed, false);
TS_ASSERT_EQUALS(quote.canAfford, true);
TS_ASSERT_EQUALS(quote.available, false);
TS_ASSERT_EQUALS(world.cmpImport.Purchase(1, OFFER), false);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 0);

world.cmpTrade.ReadGrants([{ "from": 1, "to": 2, "trade": false }]);
TS_ASSERT_EQUALS(world.cmpImport.Purchase(1, OFFER), false);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 0);

world = start(10000000, 2000, 300);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).shortageBps, 0);
TS_ASSERT_EQUALS(world.cmpImport.Purchase(1, OFFER), true);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 3000);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).shortageBps, 0);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9500000);

world = start(10000000, 0, 300);
world.cmpFood.ConsumeFood();
let status = world.cmpFood.GetFoodStatus(1);
TS_ASSERT_EQUALS(status.shortageBps, 10000);
TS_ASSERT_EQUALS(status.unmet, 335);
TS_ASSERT_EQUALS(status.cumulativeUnmet, 335);
TS_ASSERT_EQUALS(world.cmpImport.Purchase(1, OFFER), true);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 1000);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9500000);
status = world.cmpFood.GetFoodStatus(1);
TS_ASSERT_EQUALS(status.shortageBps, 10000);
TS_ASSERT_EQUALS(status.consumed, 0);
TS_ASSERT_EQUALS(status.unmet, 335);
TS_ASSERT_EQUALS(status.cumulativeUnmet, 335);
world.cmpFood.ConsumeFood();
status = world.cmpFood.GetFoodStatus(1);
TS_ASSERT_EQUALS(status.consumed, 335);
TS_ASSERT_EQUALS(status.unmet, 0);
TS_ASSERT_EQUALS(status.shortageBps, 0);
TS_ASSERT_EQUALS(status.fulfillmentBps, 10000);
TS_ASSERT_EQUALS(status.cumulativeUnmet, 335);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 665);

world = start(10000000, 0, 300);
TS_ASSERT_EQUALS(world.cmpImport.Purchase(1, OFFER), true);
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
world.cmpTimer.OnUpdate({ "turnLength": 20 });
TS_ASSERT_EQUALS(farmer.GetCarryingStatus()[0].amount, 10);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 1000);
farmer.CommitResources(33);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 1010);
world.cmpFood.ConsumeFood();
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 675);
TS_ASSERT_EQUALS(world.cmpFood.GetFoodStatus(1).consumed, 335);
TS_ASSERT_EQUALS(world.p2.GetResourceCounts().food, 300);

world = start(10000000, 0, 300);
g_Commands = {};
RegisterFoodImportCommand();
TS_ASSERT_EQUALS(g_Commands["nation-purchase-import"](2, { "offer": OFFER }), undefined);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 10000000);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(2), 5000000);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 0);
TS_ASSERT_EQUALS(world.p2.GetResourceCounts().food, 300);

g_Commands["nation-purchase-import"](1, { "offer": "missing-offer" });
g_Commands["nation-purchase-import"](1, { "offer": "" });
g_Commands["nation-purchase-import"](1, {});
g_Commands["nation-purchase-import"](1, { "offer": 12 });
g_Commands["nation-purchase-import"](0, { "offer": OFFER });
g_Commands["nation-purchase-import"](1, { "offer": OFFER, "cost": 1, "amount": 999999 });
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9500000);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 1000);
TS_ASSERT_EQUALS(world.p2.GetResourceCounts().food, 300);

world.p1.AddResource = function() {};
TS_ASSERT_EQUALS(world.cmpImport.Purchase(1, OFFER), false);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9500000);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 1000);

world = start(10000000, 40, 300);
TS_ASSERT_EQUALS(world.cmpImport.Purchase(1, OFFER), true);
world.cmpImport = SerializationCycle(world.cmpImport);
world.cmpTrade = SerializationCycle(world.cmpTrade);
world.cmpFinance = SerializationCycle(world.cmpFinance);
world.p1 = SerializationCycle(world.p1);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9500000);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 1040);
TS_ASSERT_EQUALS(world.cmpTrade.CanTrade(1, 2), true);
TS_ASSERT_EQUALS(world.cmpTrade.CanTrade(2, 1), false);
TS_ASSERT_EQUALS(world.cmpImport.GetQuote(1).available, true);
TS_ASSERT_EQUALS(world.cmpImport.Purchase(1, OFFER), true);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 9000000);
TS_ASSERT_EQUALS(world.p1.GetResourceCounts().food, 2040);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 0);

const reportError = error;
error = () => {};
TS_ASSERT_EQUALS(world.cmpImport.ReadOffers([{ "id": "bad", "buyer": 1, "seller": 1, "resource": "food" }]), false);
TS_ASSERT_EQUALS(world.cmpImport.GetQuote(1), null);
error = reportError;
