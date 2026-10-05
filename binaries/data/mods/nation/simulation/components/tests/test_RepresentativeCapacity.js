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
Engine.RegisterInterface("Cost");
Engine.RegisterInterface("Identity");
Engine.RegisterInterface("Timer");
Engine.LoadHelperScript("Player.js");
Engine.LoadComponentScript("interfaces/Player.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("interfaces/NationSettlement.js");
Engine.LoadComponentScript("interfaces/NationSettlementManager.js");
Engine.LoadComponentScript("interfaces/RepresentativeCapacity.js");
Engine.LoadComponentScript("Player.js");
Engine.LoadComponentScript("NationSettlement.js");
Engine.LoadComponentScript("NationSettlementManager.js");
Engine.LoadComponentScript("RepresentativeCapacity.js");

const playerTemplate = {
	"SpyCostMultiplier": "1",
	"BarterMultiplier": {
		"Buy": { "food": "1", "wood": "1", "stone": "1", "metal": "1" },
		"Sell": { "food": "1", "wood": "1", "stone": "1", "metal": "1" }
	},
	"Formations": { "_string": "" }
};

let g_Settlements = [];
let g_Destroyed = 0;

Engine.GetEntitiesWithInterface = function(iid)
{
	if (iid === IID_NationSettlement)
		return g_Settlements.slice();
	return [];
};

Engine.DestroyEntity = function()
{
	g_Destroyed++;
};

function deliverPopulationChanged(type, message)
{
	if (type !== MT_NationPopulationChanged)
		return;
	const cmp = Engine.QueryInterface(SYSTEM_ENTITY, IID_RepresentativeCapacity);
	if (cmp)
		cmp.OnGlobalNationPopulationChanged(message);
}

Engine.BroadcastMessage = deliverPopulationChanged;

function start()
{
	ResetState();
	g_Settlements = [];
	g_Destroyed = 0;
	Engine.BroadcastMessage = deliverPopulationChanged;
	AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
		"GetSovereignOwner": pos => pos.x <= 256 ? 1 : pos.x <= 512 ? 2 : INVALID_PLAYER
	});
	AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
		"GetNumPlayers": () => 4,
		"GetPlayerByID": id => id
	});
	ConstructComponent(SYSTEM_ENTITY, "NationSettlementManager");
	const cmp = ConstructComponent(SYSTEM_ENTITY, "RepresentativeCapacity");
	const p1 = ConstructComponent(1, "Player", playerTemplate);
	const p2 = ConstructComponent(2, "Player", playerTemplate);
	const p3 = ConstructComponent(3, "Player", playerTemplate);
	p1.SetPlayerID(1);
	p2.SetPlayerID(2);
	p3.SetPlayerID(3);
	return { "cmp": cmp, "p1": p1, "p2": p2, "p3": p3 };
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

function sandbox()
{
	const world = start();
	const capital = settlement(30, 18000, 90, 1);
	const northern = settlement(31, 5000, 70, 1);
	const western = settlement(32, 3500, 40, 2);
	const southern = settlement(33, 7000, 190, 1);
	const eastern = settlement(34, 4000, 420, 1);
	return Object.assign(world, {
		"capital": capital,
		"northern": northern,
		"western": western,
		"southern": southern,
		"eastern": eastern
	});
}

function demographic(world)
{
	return Engine.QueryInterface(SYSTEM_ENTITY, IID_NationSettlementManager).GetTotalPopulation(1);
}

function ownUnit(world, ent, player, cost)
{
	AddMock(ent, IID_Cost, {
		"GetPopCost": () => cost
	});
	const cmpPlayer = player === 1 ? world.p1 : player === 2 ? world.p2 : world.p3;
	cmpPlayer.OnGlobalOwnershipChanged({
		"entity": ent,
		"from": INVALID_PLAYER,
		"to": player
	});
}

function releaseUnit(world, ent, player)
{
	const cmpPlayer = player === 1 ? world.p1 : player === 2 ? world.p2 : world.p3;
	cmpPlayer.OnGlobalOwnershipChanged({
		"entity": ent,
		"from": player,
		"to": INVALID_PLAYER
	});
}

const world = sandbox();
world.p1.SetMaxPopulation(300);
world.p2.SetMaxPopulation(300);
world.cmp.OnInitGame();

TS_ASSERT_EQUALS(world.cmp.PeoplePerSlot, 100);
TS_ASSERT_EQUALS(demographic(world), 33500);
TS_ASSERT_EQUALS(world.p1.GetPopulationLimit(), 335);
TS_ASSERT_EQUALS(world.p1.GetPopulationCount(), 0);
TS_ASSERT_EQUALS(world.p1.GetMaxPopulation(), 335);
TS_ASSERT_EQUALS(Engine.QueryInterface(SYSTEM_ENTITY, IID_NationSettlementManager).GetTotalPopulation(2), 4000);
TS_ASSERT_EQUALS(world.p2.GetPopulationLimit(), 40);
TS_ASSERT_EQUALS(world.p3.GetPopulationLimit(), 0);

// Entity ownership is not sovereign membership. Western is owned by player 2 and still counts for player 1.
TS_ASSERT_EQUALS(world.p1.GetPopulationLimit(), 335);
TS_ASSERT_EQUALS(world.p2.GetPopulationLimit(), 40);

world.capital.SetPopulation(18500);
TS_ASSERT_EQUALS(demographic(world), 34000);
TS_ASSERT_EQUALS(world.p1.GetPopulationLimit(), 340);
world.capital.SetPopulation(14500);
TS_ASSERT_EQUALS(demographic(world), 30000);
TS_ASSERT_EQUALS(world.p1.GetPopulationLimit(), 300);
world.capital.SetPopulation(18000);
TS_ASSERT_EQUALS(world.p1.GetPopulationLimit(), 335);

// Trainer.Item.Start rejects through TryReservePopulationSlots. This is that gate.
let missing = world.p1.TryReservePopulationSlots(1);
TS_ASSERT_EQUALS(missing, 0);
TS_ASSERT_EQUALS(world.p1.GetPopulationCount(), 1);
world.p1.UnReservePopulationSlots(1);
TS_ASSERT_EQUALS(world.p1.GetPopulationCount(), 0);

ownUnit(world, 51, 1, 1);
TS_ASSERT_EQUALS(world.p1.GetPopulationCount(), 1);
TS_ASSERT_EQUALS(demographic(world), 33500);
releaseUnit(world, 51, 1);
TS_ASSERT_EQUALS(world.p1.GetPopulationCount(), 0);
TS_ASSERT_EQUALS(demographic(world), 33500);

world.capital.SetPopulation(200);
world.northern.SetPopulation(0);
world.western.SetPopulation(0);
world.southern.SetPopulation(0);
TS_ASSERT_EQUALS(world.p1.GetPopulationLimit(), 2);
ownUnit(world, 11, 1, 1);
ownUnit(world, 12, 1, 1);
missing = world.p1.TryReservePopulationSlots(1);
TS_ASSERT(missing > 0);
TS_ASSERT_EQUALS(world.p1.GetPopulationCount(), 2);
TS_ASSERT_EQUALS(demographic(world), 200);

ownUnit(world, 13, 1, 1);
ownUnit(world, 14, 1, 1);
ownUnit(world, 15, 1, 1);
TS_ASSERT_EQUALS(world.p1.GetPopulationCount(), 5);
world.capital.SetPopulation(200);
TS_ASSERT_EQUALS(world.p1.GetPopulationLimit(), 2);
TS_ASSERT_EQUALS(world.p1.GetPopulationCount(), 5);
TS_ASSERT_EQUALS(g_Destroyed, 0);
missing = world.p1.TryReservePopulationSlots(1);
TS_ASSERT(missing > 0);
TS_ASSERT_EQUALS(world.p1.GetPopulationCount(), 5);
releaseUnit(world, 15, 1);
TS_ASSERT_EQUALS(world.p1.GetPopulationCount(), 4);
TS_ASSERT_EQUALS(g_Destroyed, 0);
TS_ASSERT_EQUALS(demographic(world), 200);

world.capital.SetPopulation(18000);
world.northern.SetPopulation(5000);
world.western.SetPopulation(3500);
world.southern.SetPopulation(7000);
releaseUnit(world, 11, 1);
releaseUnit(world, 12, 1);
releaseUnit(world, 13, 1);
releaseUnit(world, 14, 1);
TS_ASSERT_EQUALS(world.p1.GetPopulationCount(), 0);
TS_ASSERT_EQUALS(world.p1.GetPopulationLimit(), 335);

world.p1.SetMaxPopulation(1000);
world.p1.AddPopulationBonuses(20);
TS_ASSERT_EQUALS(world.p1.GetPopulationLimit(), 355);
world.cmp.RefreshAll();
TS_ASSERT_EQUALS(world.p1.GetMaxPopulation(), 335);
TS_ASSERT_EQUALS(world.p1.GetPopulationLimit(), 335);
world.cmp.RefreshAll();
TS_ASSERT_EQUALS(world.p1.GetPopulationLimit(), 335);

world.western.ChangeStateIntegration(70);
world.capital.SetDiscontent(90);
world.cmp.RefreshAll();
TS_ASSERT_EQUALS(world.p1.GetPopulationLimit(), 335);
TS_ASSERT_EQUALS(demographic(world), 33500);

const beforeRebel = world.p1.GetPopulationCount();
const beforeDemographic = demographic(world);
ownUnit(world, 74, 3, 0);
TS_ASSERT_EQUALS(world.p1.GetPopulationCount(), beforeRebel);
TS_ASSERT_EQUALS(world.p3.GetPopulationCount(), 0);
TS_ASSERT_EQUALS(demographic(world), beforeDemographic);
TS_ASSERT_EQUALS(world.p1.GetPopulationLimit(), 335);

world.cmp.PeoplePerSlot = 1000;
world.cmp.RefreshAll();
TS_ASSERT_EQUALS(world.p1.GetPopulationLimit(), 33);
world.cmp.PeoplePerSlot = 100;
world.cmp.RefreshAll();
TS_ASSERT_EQUALS(world.p1.GetPopulationLimit(), 335);

const savedPlayer = SerializationCycle(world.p1);
TS_ASSERT_EQUALS(savedPlayer.GetPopulationLimit(), 335);
TS_ASSERT_EQUALS(savedPlayer.GetPopulationCount(), 0);
const savedSettlement = SerializationCycle(world.capital);
TS_ASSERT_EQUALS(savedSettlement.GetPopulation(), 18000);
savedPlayer.AddPopulationBonuses(20);
const savedAdapter = SerializationCycle(world.cmp);
savedAdapter.RefreshAll();
TS_ASSERT_EQUALS(QueryPlayerIDInterface(1).GetPopulationLimit(), 335);
TS_ASSERT_EQUALS(Engine.QueryInterface(30, IID_NationSettlement).GetPopulation(), 18000);

const adome = start();
settlement(30, 18000, 90, 1);
settlement(31, 5000, 70, 1);
settlement(32, 3500, 40, 1);
settlement(33, 7000, 190, 1);
settlement(35, 12000, 420, 2);
adome.cmp.RefreshAll();
TS_ASSERT_EQUALS(adome.p1.GetPopulationLimit(), 335);
TS_ASSERT_EQUALS(adome.p2.GetPopulationLimit(), 120);
TS_ASSERT_EQUALS(adome.p3.GetPopulationLimit(), 0);
