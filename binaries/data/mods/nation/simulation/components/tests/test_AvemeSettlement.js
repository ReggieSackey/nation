Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("Sovereignty.js");
Engine.LoadComponentScript("interfaces/NationSettlement.js");
Engine.LoadComponentScript("NationSettlement.js");
Engine.LoadComponentScript("interfaces/NationSettlementManager.js");
Engine.LoadComponentScript("NationSettlementManager.js");
Engine.LoadComponentScript("interfaces/SettlementConnectivity.js");
Engine.LoadComponentScript("interfaces/InfrastructureLink.js");
Engine.LoadComponentScript("SettlementConnectivity.js");
Engine.LoadComponentScript("interfaces/SettlementDiscontent.js");
Engine.LoadComponentScript("SettlementDiscontent.js");
Engine.LoadComponentScript("interfaces/RebellionManager.js");
Engine.LoadComponentScript("RebellionManager.js");
Engine.LoadComponentScript("interfaces/PopulationFoodConsumption.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.RegisterInterface("Health");

const root = "/Users/reg/Documents/GitHub/nation/binaries/data/mods/nation/";
const anchorXml = fs.readFileSync(root + "simulation/templates/structures/nation/aveme.xml", "utf8");
const parentXml = fs.readFileSync(root + "simulation/templates/template_nation_settlement.xml", "utf8");
const mapXml = fs.readFileSync(root + "maps/scenarios/nation_food_crisis.xml", "utf8");
TS_ASSERT(anchorXml.indexOf('parent="template_nation_settlement"') !== -1);
TS_ASSERT(anchorXml.indexOf("<Name>Avémé</Name>") !== -1);
TS_ASSERT(anchorXml.indexOf("<Population>12000</Population>") !== -1);
TS_ASSERT(anchorXml.indexOf("<StateIntegration>70</StateIntegration>") !== -1);
TS_ASSERT(anchorXml.indexOf("<IsCapital>true</IsCapital>") !== -1);
TS_ASSERT(parentXml.indexOf("<Health disable=\"\"/>") !== -1);
TS_ASSERT(mapXml.indexOf("<Template>structures/nation/aveme</Template>") !== -1);
TS_ASSERT(mapXml.indexOf("<Template>structures/nation/aveme_civic</Template>") !== -1);
TS_ASSERT(mapXml.indexOf('x="1312" z="820"') !== -1);

const enlarged = [
	{
		"owner": 1,
		"points": [
			{ "x": 0, "z": 0 },
			{ "x": 1020, "z": 0 },
			{ "x": 980, "z": 400 },
			{ "x": 1060, "z": 800 },
			{ "x": 990, "z": 1200 },
			{ "x": 1080, "z": 1536 },
			{ "x": 0, "z": 1536 }
		]
	},
	{
		"owner": 2,
		"points": [
			{ "x": 1020, "z": 0 },
			{ "x": 1536, "z": 0 },
			{ "x": 1536, "z": 1536 },
			{ "x": 1080, "z": 1536 },
			{ "x": 990, "z": 1200 },
			{ "x": 1060, "z": 800 },
			{ "x": 980, "z": 400 }
		]
	}
];

const g_Positions = {};
let g_SettlementIds = [];
let g_Spawned = [];
let g_NextSpawn = 1000;

Engine.GetEntitiesWithInterface = function(iid)
{
	if (iid === IID_NationSettlement)
		return g_SettlementIds.slice();
	return [];
};

Engine.AddEntity = function()
{
	const id = g_NextSpawn++;
	g_Spawned.push(id);
	AddMock(id, IID_Ownership, {
		"SetOwner": () => {}
	});
	AddMock(id, IID_Position, {
		"JumpTo": () => {}
	});
	return id;
};

Engine.DestroyEntity = function(id)
{
	const index = g_Spawned.indexOf(id);
	if (index !== -1)
		g_Spawned.splice(index, 1);
};

function place(entity, x, z)
{
	g_Positions[entity] = { "x": x, "y": z };
	AddMock(entity, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => g_Positions[entity]
	});
	AddMock(entity, IID_Ownership, {
		"GetOwner": () => 1
	});
}

function settlement(entity, name, population, integration, x, z, isCapital)
{
	place(entity, x, z);
	g_SettlementIds.push(entity);
	return ConstructComponent(entity, "NationSettlement", {
		"Name": name,
		"Population": String(population),
		"StateIntegration": String(integration),
		"IsCapital": isCapital ? "true" : "false"
	});
}

ResetState();
g_SettlementIds = [];
AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 4,
	"GetPlayerByID": id => id
});
const cmpSovereignty = ConstructComponent(SYSTEM_ENTITY, "Sovereignty");
global.InitAttributes = { "settings": { "Sovereignty": enlarged } };
cmpSovereignty.OnInitGame();
// These anchors sit well inside a sovereign cell. The audit found no entity whose
// polygon owner and cell-center owner disagree. The mock is the native grid.
AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, {
	"GetOwner": (x, z) => x < 1100 ? 1 : 2
});

const esika = settlement(30, "Esika", 18000, 90, 520, 800, true);
const bontuku = settlement(31, "Bontuku", 5000, 35, 480, 1360, false);
const sefira = settlement(32, "Sefira", 3500, 20, 180, 360, false);
const anomara = settlement(33, "Anomara", 7000, 55, 800, 220, false);
const aveme = settlement(34, "Avémé", 12000, 70, 1312, 820, true);
// A civic building is not a demographic record. Removing it changes nothing.
place(20, 1280, 830);

const cmpManager = ConstructComponent(SYSTEM_ENTITY, "NationSettlementManager");
const names = [esika, bontuku, sefira, anomara, aveme].map(cmp => cmp.GetName());
TS_ASSERT_EQUALS(names.join(","), "Esika,Bontuku,Sefira,Anomara,Avémé");
TS_ASSERT_EQUALS(cmpManager.GetTotalPopulation(1), 33500);
TS_ASSERT_EQUALS(cmpManager.GetTotalPopulation(2), 12000);
TS_ASSERT_EQUALS(cmpManager.GetTotalPopulation(1) + cmpManager.GetTotalPopulation(2), 45500);
TS_ASSERT_EQUALS(aveme.GetStateIntegration(), 70);
TS_ASSERT_EQUALS(aveme.GetDiscontent(), 0);
TS_ASSERT_EQUALS(aveme.GetIsCapital(), true);
TS_ASSERT_EQUALS(aveme.GetSovereignOwner(), 2);
TS_ASSERT_EQUALS(esika.GetSovereignOwner(), 1);
TS_ASSERT_EQUALS(cmpManager.GetSettlementsForSovereign(2).indexOf(20), -1);
TS_ASSERT_EQUALS(cmpManager.GetTotalPopulation(2), 12000);

const saved = SerializationCycle(aveme);
TS_ASSERT_EQUALS(saved.GetName(), "Avémé");
TS_ASSERT_EQUALS(saved.GetPopulation(), 12000);
TS_ASSERT_EQUALS(saved.GetStateIntegration(), 70);
TS_ASSERT_EQUALS(saved.GetDiscontent(), 0);

AddMock(SYSTEM_ENTITY, IID_PopulationFoodConsumption, {
	"GetFoodStatus": playerId => ({
		"population": playerId === 1 ? 33500 : playerId === 2 ? 12000 : 0,
		"required": playerId === 1 ? 335 : playerId === 2 ? 120 : 0,
		"shortageBps": playerId === 1 ? 10000 : 0
	})
});

const cmpDiscontent = ConstructComponent(SYSTEM_ENTITY, "SettlementDiscontent");
const cmpRebellion = ConstructComponent(SYSTEM_ENTITY, "RebellionManager");
cmpRebellion.ReadRebelPlayer(3);
let densiraRebel = false;
for (let tick = 0; tick < 12; ++tick)
{
	cmpDiscontent.OnGlobalFoodConsumptionCompleted();
	cmpRebellion.OnGlobalSettlementDiscontentCompleted();
	if (cmpRebellion.GetActiveCount(1) > 0)
		densiraRebel = true;
}
TS_ASSERT_EQUALS(aveme.GetDiscontent(), 0);
TS_ASSERT_EQUALS(cmpRebellion.GetActiveCount(2), 0);
TS_ASSERT_EQUALS(cmpRebellion.GetStatus(34).active, false);
TS_ASSERT(sefira.GetDiscontent() >= 80);
TS_ASSERT(densiraRebel);
TS_ASSERT(g_Spawned.length > 0);

const outpost = settlement(36, "Outpost", 100, 40, 1400, 200, false);
const cmpTimer = ConstructComponent(SYSTEM_ENTITY, "Timer");
const cmpConnectivity = ConstructComponent(SYSTEM_ENTITY, "SettlementConnectivity");
global.InitAttributes = {
	"settings": {
		"SettlementConnectivity": [
			{ "from": 30, "to": 31 },
			{ "from": 30, "to": 34 },
			{ "from": 30, "to": 36 }
		]
	}
};
cmpConnectivity.OnInitGame();
const beforeBontuku = bontuku.GetStateIntegration();
const beforeAveme = aveme.GetStateIntegration();
cmpTimer.OnUpdate({ "turnLength": 10 });
TS_ASSERT_EQUALS(bontuku.GetStateIntegration(), beforeBontuku + 1);
TS_ASSERT_EQUALS(aveme.GetStateIntegration(), beforeAveme);
TS_ASSERT_EQUALS(outpost.GetStateIntegration(), 40);
TS_ASSERT_EQUALS(esika.GetStateIntegration(), 90);
TS_ASSERT_EQUALS(cmpConnectivity.GetPathToCapital(34).length, 0);
TS_ASSERT_EQUALS(cmpConnectivity.GetPathToCapital(36).length, 0);
