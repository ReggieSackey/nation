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
Engine.LoadComponentScript("interfaces/Player.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/ResourceDropsite.js");
Engine.LoadComponentScript("interfaces/ResourceGatherer.js");
Engine.LoadComponentScript("interfaces/ResourceSupply.js");
Engine.LoadComponentScript("interfaces/StatisticsTracker.js");
Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("interfaces/UnitAI.js");
Engine.LoadComponentScript("interfaces/InitialGather.js");
Engine.LoadComponentScript("Player.js");
Engine.LoadComponentScript("ResourceDropsite.js");
Engine.LoadComponentScript("ResourceGatherer.js");
Engine.LoadComponentScript("ResourceSupply.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("InitialGather.js");

const playerTemplate = {
	"SpyCostMultiplier": "1",
	"BarterMultiplier": {
		"Buy": { "food": "1", "wood": "1", "stone": "1", "metal": "1" },
		"Sell": { "food": "1", "wood": "1", "stone": "1", "metal": "1" }
	},
	"Formations": { "_string": "" }
};

const gathererTemplate = {
	"MaxDistance": "2",
	"BaseSpeed": "1",
	"Rates": { "food.grain": "0.5" },
	"Capacities": { "food": "10" }
};

const fieldTemplate = {
	"KillBeforeGather": "false",
	"Max": "Infinity",
	"Type": "food.grain",
	"MaxGatherers": "5",
	"DiminishingReturns": "0.9"
};

AddMock(SYSTEM_ENTITY, IID_ObstructionManager, {
	"IsInTargetRange": () => true
});

function players()
{
	ResetState();
	AddMock(SYSTEM_ENTITY, IID_ObstructionManager, {
		"IsInTargetRange": () => true
	});
	AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
		"GetPlayerByID": id => id
	});
	const cmpTimer = ConstructComponent(SYSTEM_ENTITY, "Timer");
	const nation = ConstructComponent(1, "Player", playerTemplate);
	const neighbor = ConstructComponent(2, "Player", playerTemplate);
	nation.SetPlayerID(1);
	neighbor.SetPlayerID(2);
	nation.SetResourceCounts({ "food": 1000 });
	neighbor.SetResourceCounts({ "food": 300 });
	return { "cmpTimer": cmpTimer, "nation": nation, "neighbor": neighbor };
}

function advance(cmpTimer, seconds)
{
	cmpTimer.OnUpdate({ "turnLength": seconds });
}

let world = players();
TS_ASSERT_EQUALS(world.nation.GetResourceCounts().food, 1000);
TS_ASSERT_EQUALS(world.nation.GetResourceCounts().wood, 300);
TS_ASSERT_EQUALS(world.neighbor.GetResourceCounts().food, 300);
advance(world.cmpTimer, 30);
TS_ASSERT_EQUALS(world.nation.GetResourceCounts().food, 1000);
TS_ASSERT_EQUALS(world.neighbor.GetResourceCounts().food, 300);

world = players();
const field = ConstructComponent(50, "ResourceSupply", fieldTemplate);
const farmer = ConstructComponent(51, "ResourceGatherer", gathererTemplate);
const dropsite = ConstructComponent(33, "ResourceDropsite", {
	"Types": "food",
	"Sharable": "false"
});
AddMock(51, IID_Ownership, { "GetOwner": () => 1 });
AddMock(33, IID_Ownership, { "GetOwner": () => 1 });
farmer.OnGlobalInitGame();
TS_ASSERT_EQUALS(farmer.StartGathering(50), true);
advance(world.cmpTimer, 20);
TS_ASSERT_EQUALS(farmer.GetCarryingStatus()[0].amount, 10);
TS_ASSERT_EQUALS(world.nation.GetResourceCounts().food, 1000);
farmer.CommitResources(33);
TS_ASSERT_EQUALS(world.nation.GetResourceCounts().food, 1010);
TS_ASSERT_EQUALS(world.neighbor.GetResourceCounts().food, 300);
TS_ASSERT_EQUALS(farmer.IsCarrying("food"), false);
advance(world.cmpTimer, 30);
TS_ASSERT_EQUALS(world.nation.GetResourceCounts().food, 1010);

const saved = SerializationCycle(world.nation);
TS_ASSERT_EQUALS(saved.GetResourceCounts().food, 1010);
TS_ASSERT_EQUALS(saved.GetResourceCounts().wood, 300);

AddMock(52, IID_Ownership, { "GetOwner": () => 2 });
const other = ConstructComponent(52, "ResourceGatherer", gathererTemplate);
other.OnGlobalInitGame();
other.GiveResources([{ "type": "food", "amount": 4, "max": 10 }]);
other.CommitResources(33);
TS_ASSERT_EQUALS(world.nation.GetResourceCounts().food, 1010);
TS_ASSERT_EQUALS(world.neighbor.GetResourceCounts().food, 304);
TS_ASSERT_EQUALS(field.IsInfinite(), true);
TS_ASSERT_EQUALS(dropsite.AcceptsType("food"), true);
TS_ASSERT_EQUALS(dropsite.AcceptsType("wood"), false);

Engine.DestroyEntity(50);
const stopped = ConstructComponent(53, "ResourceGatherer", gathererTemplate);
AddMock(53, IID_Ownership, { "GetOwner": () => 1 });
stopped.OnGlobalInitGame();
TS_ASSERT_EQUALS(stopped.StartGathering(50), false);
advance(world.cmpTimer, 20);
TS_ASSERT_EQUALS(world.nation.GetResourceCounts().food, 1010);

let gathered = 0;
world = players();
AddMock(51, IID_UnitAI, {
	"Gather": target =>
	{
		gathered = target;
	}
});
AddMock(51, IID_Ownership, { "GetOwner": () => 1 });
const order = ConstructComponent(51, "InitialGather", { "Target": "50" });
ConstructComponent(50, "ResourceSupply", fieldTemplate);
order.OnInitGame();
TS_ASSERT_EQUALS(gathered, 0);
advance(world.cmpTimer, 0.2);
TS_ASSERT_EQUALS(gathered, 50);

gathered = 0;
order.BeginWork();
TS_ASSERT_EQUALS(gathered, 50);
Engine.DestroyEntity(50);
order.BeginWork();
TS_ASSERT_EQUALS(gathered, 50);
