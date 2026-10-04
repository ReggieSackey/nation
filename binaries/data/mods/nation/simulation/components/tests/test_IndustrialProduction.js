Resources = {
	"GetCodes": () => ["food", "wood", "stone", "metal", "construction_materials"],
	"GetTradableCodes": () => ["food", "wood", "stone", "metal"],
	"GetBarterableCodes": () => ["food", "wood", "stone", "metal"],
	"GetResource": () => ({
		"name": "Resource",
		"subtypes": {}
	}),
	"BuildSchema": type =>
	{
		let schema = "";
		for (const res of Resources.GetCodes())
			schema += "<optional><element name='" + res + "'><ref name='" + type + "'/></element></optional>";
		return "<interleave>" + schema + "</interleave>";
	},
	"BuildChoicesSchema": () => "<choice><value>wood</value><value>stone</value><value>metal</value></choice>"
};

Engine.RegisterGlobal("ApplyValueModificationsToEntity", (prop, oVal) => oVal);
Engine.RegisterGlobal("PlaySound", () => {});
Engine.RegisterInterface("Player");
Engine.RegisterInterface("PlayerManager");
Engine.RegisterInterface("StatisticsTracker");
Engine.RegisterInterface("Fogging");
Engine.RegisterInterface("DeathDamage");
Engine.RegisterInterface("Loot");
Engine.RegisterInterface("Looter");
Engine.RegisterInterface("RangeManager");
Engine.RegisterInterface("Repairable");
Engine.LoadHelperScript("Player.js");
Engine.LoadComponentScript("interfaces/Player.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("interfaces/ResourceDropsite.js");
Engine.LoadComponentScript("interfaces/Health.js");
Engine.LoadComponentScript("interfaces/NationSettlement.js");
Engine.LoadComponentScript("interfaces/IndustrialProduction.js");
Engine.LoadComponentScript("Player.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("ResourceDropsite.js");
Engine.LoadComponentScript("Health.js");
Engine.LoadComponentScript("NationSettlement.js");
Engine.LoadComponentScript("IndustrialProduction.js");

const playerTemplate = {
	"SpyCostMultiplier": "1",
	"BarterMultiplier": {
		"Buy": { "food": "1", "wood": "1", "stone": "1", "metal": "1" },
		"Sell": { "food": "1", "wood": "1", "stone": "1", "metal": "1" }
	},
	"Formations": { "_string": "" }
};

const recipe = {
	"Interval": "10000",
	"Inputs": { "wood": "10", "stone": "10", "metal": "5" },
	"Outputs": { "construction_materials": "10" }
};

const healthTemplate = {
	"Max": "2000",
	"RegenRate": "0",
	"IdleRegenRate": "0",
	"DeathType": "vanish",
	"Unhealable": "false"
};

let owner = 1;

function start()
{
	ResetState();
	owner = 1;
	AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
		"GetNumPlayers": () => 3,
		"GetPlayerByID": id => id
	});
	const cmpTimer = ConstructComponent(SYSTEM_ENTITY, "Timer");
	const p1 = ConstructComponent(1, "Player", playerTemplate);
	const p2 = ConstructComponent(2, "Player", playerTemplate);
	p1.SetPlayerID(1);
	p2.SetPlayerID(2);
	p1.SetResourceCounts({
		"food": 1000,
		"wood": 100,
		"stone": 100,
		"metal": 100,
		"construction_materials": 0
	});
	p2.SetResourceCounts({
		"food": 300,
		"wood": 50,
		"stone": 50,
		"metal": 50,
		"construction_materials": 0
	});
	p1.SetMaxPopulation(335);
	p1.SetPopulationBonuses(335);
	const settlement = ConstructComponent(30, "NationSettlement", {
		"Name": "Capital",
		"Population": "18000",
		"StateIntegration": "90",
		"IsCapital": "true"
	});
	AddMock(70, IID_Ownership, {
		"GetOwner": () => owner
	});
	const factory = ConstructComponent(70, "IndustrialProduction", recipe);
	factory.OnInitGame();
	return {
		"cmpTimer": cmpTimer,
		"p1": p1,
		"p2": p2,
		"settlement": settlement,
		"factory": factory
	};
}

function stock(player)
{
	const counts = player.GetResourceCounts();
	return [
		counts.wood,
		counts.stone,
		counts.metal,
		counts.construction_materials,
		counts.food
	];
}

function advance(timer, seconds)
{
	timer.OnUpdate({ "turnLength": seconds });
}

const world = start();
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);
world.factory.OnInitGame();
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);

advance(world.cmpTimer, 10);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p1), [90, 90, 95, 10, 1000]);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p2), [50, 50, 50, 0, 300]);

advance(world.cmpTimer, 10);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p1), [80, 80, 90, 20, 1000]);

world.p1.SetResourceCounts({ "wood": 9, "stone": 100, "metal": 100, "construction_materials": 20 });
advance(world.cmpTimer, 10);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p1), [9, 100, 100, 20, 1000]);

world.p1.SetResourceCounts({ "wood": 100, "stone": 9, "metal": 100, "construction_materials": 20 });
advance(world.cmpTimer, 10);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p1), [100, 9, 100, 20, 1000]);

world.p1.SetResourceCounts({ "wood": 100, "stone": 100, "metal": 4, "construction_materials": 20 });
advance(world.cmpTimer, 10);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p1), [100, 100, 4, 20, 1000]);

world.p1.AddResource("metal", 1);
advance(world.cmpTimer, 10);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p1), [90, 90, 0, 30, 1000]);

world.p1.SetResourceCounts({ "wood": 10, "stone": 10, "metal": 5, "construction_materials": 0 });
advance(world.cmpTimer, 10);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p1), [0, 0, 0, 10, 1000]);

world.p1.SetResourceCounts({ "wood": 40, "stone": 40, "metal": 40, "construction_materials": 0 });
world.p2.SetResourceCounts({ "wood": 40, "stone": 40, "metal": 40, "construction_materials": 0 });
owner = 2;
advance(world.cmpTimer, 10);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p1), [40, 40, 40, 0, 1000]);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p2), [30, 30, 35, 10, 300]);

owner = 0;
advance(world.cmpTimer, 10);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p2), [30, 30, 35, 10, 300]);
owner = -1;
advance(world.cmpTimer, 10);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p1), [40, 40, 40, 0, 1000]);

owner = 1;
world.p1.SetResourceCounts({ "wood": 0, "stone": 0, "metal": 0, "construction_materials": 0 });
const dropsite = ConstructComponent(61, "ResourceDropsite", {
	"Types": "wood stone metal",
	"Sharable": "false"
});
AddMock(62, IID_Ownership, { "GetOwner": () => 1 });
dropsite.ReceiveResources({ "wood": 30 }, 62);
AddMock(65, IID_Ownership, { "GetOwner": () => 1 });
dropsite.ReceiveResources({ "stone": 30 }, 65);
AddMock(68, IID_Ownership, { "GetOwner": () => 1 });
dropsite.ReceiveResources({ "metal": 20 }, 68);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p1), [30, 30, 20, 0, 1000]);
advance(world.cmpTimer, 10);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p1), [20, 20, 15, 10, 1000]);

TS_ASSERT_EQUALS(world.settlement.GetPopulation(), 18000);
TS_ASSERT_EQUALS(world.p1.GetPopulationCount(), 0);
TS_ASSERT_EQUALS(world.p1.GetPopulationLimit(), 335);

world.p1.SetResourceCounts({ "wood": 100, "stone": 100, "metal": 100, "construction_materials": 20 });
const savedFactory = SerializationCycle(world.factory);
const savedTimer = SerializationCycle(world.cmpTimer);
savedFactory.OnInitGame();
TS_ASSERT_EQUALS(savedTimer.timers.size, 1);
advance(savedTimer, 10);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p1), [90, 90, 95, 30, 1000]);
advance(savedTimer, 0);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p1), [90, 90, 95, 30, 1000]);

const cmpHealth = ConstructComponent(70, "Health", healthTemplate);
cmpHealth.TakeDamage(40, 74, 3);
TS_ASSERT_EQUALS(cmpHealth.GetHitpoints(), 1960);
advance(savedTimer, 10);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p1), [80, 80, 90, 40, 1000]);
TS_ASSERT_EQUALS(cmpHealth.GetHitpoints(), 1960);

Engine.DestroyEntity = function(ent)
{
	const cmp = Engine.QueryInterface(ent, IID_IndustrialProduction);
	if (cmp)
		cmp.OnDestroy();
	if (g_Components[ent])
		delete g_Components[ent][IID_IndustrialProduction];
};
cmpHealth.TakeDamage(1960, 74, 3);
TS_ASSERT_EQUALS(cmpHealth.GetHitpoints(), 0);
TS_ASSERT(!Engine.QueryInterface(70, IID_IndustrialProduction));
const stalled = stock(world.p1);
advance(savedTimer, 30);
TS_ASSERT_UNEVAL_EQUALS(stock(world.p1), stalled);
TS_ASSERT_EQUALS(world.settlement.GetPopulation(), 18000);
TS_ASSERT_EQUALS(world.p1.GetPopulationCount(), 0);
