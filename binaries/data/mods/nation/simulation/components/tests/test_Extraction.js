Resources = {
	"GetCodes": () => ["food", "wood", "stone", "metal"],
	"GetTradableCodes": () => ["food", "wood", "stone", "metal"],
	"GetBarterableCodes": () => ["food", "wood", "stone", "metal"],
	"GetResource": () => ({
		"name": "Resource",
		"subtypes": {
			"grain": "Grain",
			"tree": "Tree",
			"rock": "Rock",
			"ore": "Ore"
		}
	}),
	"BuildSchema": type =>
	{
		let schema = "";
		for (const res of Resources.GetCodes())
			schema += "<optional><element name='" + res + "'><ref name='" + type + "'/></element></optional>";
		return "<interleave>" + schema + "</interleave>";
	},
	"BuildChoicesSchema": () => "<choice><value>wood.tree</value><value>stone.rock</value><value>metal.ore</value></choice>"
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
Engine.RegisterInterface("DeathDamage");
Engine.RegisterInterface("Loot");
Engine.RegisterInterface("Looter");
Engine.RegisterInterface("RangeManager");
Engine.RegisterInterface("Repairable");
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
Engine.LoadComponentScript("interfaces/Health.js");
Engine.LoadComponentScript("Player.js");
Engine.LoadComponentScript("ResourceDropsite.js");
Engine.LoadComponentScript("ResourceGatherer.js");
Engine.LoadComponentScript("ResourceSupply.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("InitialGather.js");
Engine.LoadComponentScript("Health.js");

function PlaySound()
{
}

const playerTemplate = {
	"SpyCostMultiplier": "1",
	"BarterMultiplier": {
		"Buy": { "food": "1", "wood": "1", "stone": "1", "metal": "1" },
		"Sell": { "food": "1", "wood": "1", "stone": "1", "metal": "1" }
	},
	"Formations": { "_string": "" }
};

const workerTemplate = {
	"MaxDistance": "2",
	"BaseSpeed": "1",
	"Rates": {
		"wood.tree": "1",
		"stone.rock": "1",
		"metal.ore": "1"
	},
	"Capacities": {
		"wood": "10",
		"stone": "10",
		"metal": "10"
	}
};

const healthTemplate = {
	"Max": "800",
	"RegenRate": "0",
	"IdleRegenRate": "0",
	"DeathType": "remain",
	"Unhealable": "false"
};

const industries = [
	{ "resource": "wood", "type": "wood.tree", "supply": 60, "dropsite": 61, "worker": 62 },
	{ "resource": "stone", "type": "stone.rock", "supply": 63, "dropsite": 64, "worker": 65 },
	{ "resource": "metal", "type": "metal.ore", "supply": 66, "dropsite": 67, "worker": 68 }
];

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
	return { "cmpTimer": cmpTimer, "nation": nation, "neighbor": neighbor };
}

function advance(cmpTimer, seconds)
{
	cmpTimer.OnUpdate({ "turnLength": seconds });
}

function supply(entity, type, max)
{
	const cmpSupply = ConstructComponent(entity, "ResourceSupply", {
		"KillBeforeGather": "false",
		"Max": String(max),
		"Type": type,
		"MaxGatherers": "8"
	});
	cmpSupply.RecalculateValues();
	return cmpSupply;
}

function worker(entity, owner)
{
	AddMock(entity, IID_Ownership, { "GetOwner": () => owner });
	const cmpWorker = ConstructComponent(entity, "ResourceGatherer", workerTemplate);
	cmpWorker.OnGlobalInitGame();
	return cmpWorker;
}

function dropsite(entity, type, owner)
{
	AddMock(entity, IID_Ownership, { "GetOwner": () => owner });
	return ConstructComponent(entity, "ResourceDropsite", {
		"Types": type,
		"Sharable": "false"
	});
}

let world = players();
TS_ASSERT_EQUALS(world.nation.GetResourceCounts().food, 1000);
TS_ASSERT_EQUALS(world.nation.GetResourceCounts().wood, 300);
TS_ASSERT_EQUALS(world.nation.GetResourceCounts().stone, 300);
TS_ASSERT_EQUALS(world.nation.GetResourceCounts().metal, 300);
TS_ASSERT_EQUALS(world.neighbor.GetResourceCounts().wood, 300);
TS_ASSERT_EQUALS(world.neighbor.GetResourceCounts().stone, 300);
TS_ASSERT_EQUALS(world.neighbor.GetResourceCounts().metal, 300);

for (const industry of industries)
{
	world = players();
	const cmpSupply = supply(industry.supply, industry.type, 100);
	const cmpWorker = worker(industry.worker, 1);
	const cmpDropsite = dropsite(industry.dropsite, industry.resource, 1);
	TS_ASSERT_EQUALS(cmpSupply.IsInfinite(), false);
	TS_ASSERT_EQUALS(cmpSupply.GetCurrentAmount(), 100);
	TS_ASSERT_EQUALS(cmpDropsite.AcceptsType(industry.resource), true);
	TS_ASSERT_EQUALS(cmpWorker.StartGathering(industry.supply), true);
	advance(world.cmpTimer, 3);
	TS_ASSERT_EQUALS(cmpWorker.GetCarryingStatus()[0].type, industry.resource);
	TS_ASSERT_EQUALS(cmpWorker.GetCarryingStatus()[0].amount, 3);
	TS_ASSERT_EQUALS(world.nation.GetResourceCounts()[industry.resource], 300);
	TS_ASSERT_EQUALS(cmpSupply.GetCurrentAmount(), 97);
	cmpWorker.CommitResources(industry.dropsite);
	TS_ASSERT_EQUALS(world.nation.GetResourceCounts()[industry.resource], 303);
	TS_ASSERT_EQUALS(world.neighbor.GetResourceCounts()[industry.resource], 300);
	TS_ASSERT_EQUALS(cmpWorker.IsCarrying(industry.resource), false);

	const otherType = industry.resource == "wood" ? "stone" : "wood";
	const wrong = dropsite(90, otherType, 1);
	cmpWorker.GiveResources([{ "type": industry.resource, "amount": 2, "max": 10 }]);
	cmpWorker.CommitResources(90);
	TS_ASSERT_EQUALS(wrong.AcceptsType(industry.resource), false);
	TS_ASSERT_EQUALS(cmpWorker.IsCarrying(industry.resource), true);
	TS_ASSERT_EQUALS(world.nation.GetResourceCounts()[industry.resource], 303);

	const neighborWorker = worker(80, 2);
	neighborWorker.GiveResources([{ "type": industry.resource, "amount": 4, "max": 10 }]);
	TS_ASSERT(!neighborWorker.CanReturnResource(industry.dropsite, true));
	neighborWorker.CommitResources(industry.dropsite);
	TS_ASSERT_EQUALS(world.nation.GetResourceCounts()[industry.resource], 303);
	TS_ASSERT_EQUALS(world.neighbor.GetResourceCounts()[industry.resource], 304);

	cmpWorker.DropResources();
	cmpWorker.StopGathering();
	Engine.DestroyEntity(industry.supply);
	TS_ASSERT_EQUALS(cmpWorker.StartGathering(industry.supply), false);
	const before = world.nation.GetResourceCounts()[industry.resource];
	advance(world.cmpTimer, 5);
	TS_ASSERT_EQUALS(world.nation.GetResourceCounts()[industry.resource], before);

	const finite = supply(70, industry.type, 2);
	TS_ASSERT_EQUALS(cmpWorker.StartGathering(70), true);
	advance(world.cmpTimer, 3);
	TS_ASSERT_EQUALS(Engine.QueryInterface(70, IID_ResourceSupply), null);
	TS_ASSERT_EQUALS(cmpWorker.GetCarryingStatus()[0].amount, 2);
	TS_ASSERT_EQUALS(world.nation.GetResourceCounts()[industry.resource], before);
	cmpWorker.CommitResources(industry.dropsite);
	TS_ASSERT_EQUALS(world.nation.GetResourceCounts()[industry.resource], before + 2);
	TS_ASSERT_EQUALS(cmpWorker.StartGathering(70), false);
	advance(world.cmpTimer, 5);
	TS_ASSERT_EQUALS(world.nation.GetResourceCounts()[industry.resource], before + 2);

	cmpWorker.GiveResources([{ "type": industry.resource, "amount": 5, "max": 10 }]);
	Engine.DestroyEntity(industry.dropsite);
	cmpWorker.CommitResources(industry.dropsite);
	TS_ASSERT_EQUALS(cmpWorker.IsCarrying(industry.resource), true);
	TS_ASSERT_EQUALS(world.nation.GetResourceCounts()[industry.resource], before + 2);

	const savedPlayer = SerializationCycle(world.nation);
	TS_ASSERT_EQUALS(savedPlayer.GetResourceCounts()[industry.resource], before + 2);
	const savedSupply = supply(71, industry.type, 40);
	savedSupply.TakeResources(7);
	const reloadedSupply = SerializationCycle(savedSupply);
	TS_ASSERT_EQUALS(reloadedSupply.GetCurrentAmount(), 33);
	cmpWorker.GiveResources([{ "type": industry.resource, "amount": 6, "max": 10 }]);
	const reloadedWorker = SerializationCycle(cmpWorker);
	TS_ASSERT_EQUALS(reloadedWorker.GetCarryingStatus()[0].amount, 6);
}

let gathered = {};
world = players();
for (const industry of industries)
{
	AddMock(industry.worker, IID_UnitAI, {
		"Gather": target =>
		{
			gathered[industry.worker] = target;
		}
	});
	AddMock(industry.worker, IID_Ownership, { "GetOwner": () => 1 });
	supply(industry.supply, industry.type, 100);
	const order = ConstructComponent(industry.worker, "InitialGather", { "Target": String(industry.supply) });
	order.OnInitGame();
	TS_ASSERT_EQUALS(gathered[industry.worker], undefined);
}
advance(world.cmpTimer, 0.2);
for (const industry of industries)
{
	TS_ASSERT_EQUALS(gathered[industry.worker], industry.supply);
	const order = Engine.QueryInterface(industry.worker, IID_InitialGather);
	const reloaded = SerializationCycle(order);
	TS_ASSERT_EQUALS(reloaded.timer, 0);
	TS_ASSERT_EQUALS(gathered[industry.worker], industry.supply);
}

world = players();
for (const industry of industries)
{
	dropsite(industry.dropsite, industry.resource, 1);
	const cmpHealth = ConstructComponent(industry.dropsite, "Health", healthTemplate);
	TS_ASSERT_EQUALS(cmpHealth.GetHitpoints(), 800);
	cmpHealth.TakeDamage(40, 74, 3);
	TS_ASSERT_EQUALS(cmpHealth.GetHitpoints(), 760);
}
