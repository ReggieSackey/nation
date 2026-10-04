Resources = {
	"GetCodes": () => ["food", "wood", "stone", "metal", "construction_materials"],
	"GetTradableCodes": () => ["food", "wood", "stone", "metal"],
	"GetBarterableCodes": () => ["food", "wood", "stone", "metal"],
	"GetResource": () => ({
		"name": "Construction Materials",
		"subtypes": {}
	}),
	"BuildSchema": type =>
	{
		let schema = "";
		for (const res of Resources.GetCodes())
			schema += "<optional><element name='" + res + "'><ref name='" + type + "'/></element></optional>";
		return "<interleave>" + schema + "</interleave>";
	},
	"BuildChoicesSchema": () => "<choice><value>wood</value></choice>"
};

Engine.RegisterGlobal("ApplyValueModificationsToEntity", (prop, oVal) => oVal);
Engine.RegisterGlobal("markForTranslation", msg => msg);
Engine.RegisterInterface("Player");
Engine.RegisterInterface("PlayerManager");
Engine.RegisterInterface("Identity");
Engine.RegisterInterface("Ownership");
Engine.RegisterInterface("GuiInterface");
Engine.RegisterInterface("TemplateManager");
Engine.RegisterInterface("StatisticsTracker");
Engine.RegisterInterface("Foundation");
Engine.RegisterInterface("EntityLimits");
Engine.RegisterInterface("SoundManager");
Engine.RegisterInterface("ModifiersManager");
Engine.LoadHelperScript("Player.js");
Engine.LoadHelperScript("Requirements.js");
Engine.LoadComponentScript("../../../public/globalscripts/Technologies.js");
Engine.LoadComponentScript("interfaces/Player.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/TechnologyManager.js");
Engine.LoadComponentScript("interfaces/Researcher.js");
Engine.LoadComponentScript("interfaces/Trigger.js");
Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("interfaces/IndustrialProduction.js");
Engine.LoadComponentScript("interfaces/NationSettlement.js");
Engine.LoadComponentScript("Player.js");
Engine.LoadComponentScript("TechnologyManager.js");
Engine.LoadComponentScript("Researcher.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("IndustrialProduction.js");
Engine.LoadComponentScript("NationSettlement.js");

const techDir = "/Users/reg/Documents/GitHub/nation/binaries/data/mods/nation/simulation/data/technologies";
const templateDir = "/Users/reg/Documents/GitHub/nation/binaries/data/mods/nation/simulation/templates";
const techNames = [
	"phase_village",
	"phase_town",
	"phase_town_athen",
	"phase_town_generic",
	"phase_city",
	"phase_city_athen",
	"phase_city_generic"
];
const techs = {};
for (const name of techNames)
	techs[name] = JSON.parse(fs.readFileSync(path.join(techDir, name + ".json"), "utf8"));

Engine.RegisterGlobal("TechnologyTemplates", {
	"GetAll": () => techs,
	"Get": name => techs[name],
	"Has": name => Object.hasOwn(techs, name)
});

const rawTribute = ["food", "wood", "stone", "metal"];
for (const name of techNames)
{
	TS_ASSERT_EQUALS(techs[name].modifications, undefined);
	const cost = techs[name].cost || {};
	for (const res of rawTribute)
		TS_ASSERT_EQUALS(cost[res], undefined);
}
TS_ASSERT_EQUALS(techs.phase_village.genericName, "Consolidation");
TS_ASSERT_EQUALS(techs.phase_village.autoResearch, true);
TS_ASSERT_EQUALS(techs.phase_town.genericName, "Development");
TS_ASSERT_EQUALS(techs.phase_city.genericName, "Advanced State");
for (const name of ["phase_town_athen", "phase_town_generic"])
{
	TS_ASSERT_EQUALS(techs[name].genericName, "Development");
	TS_ASSERT_EQUALS(techs[name].cost.construction_materials, 20);
	TS_ASSERT_EQUALS(techs[name].researchTime, 30);
	TS_ASSERT_EQUALS(techs[name].replaces[0], "phase_town");
	TS_ASSERT_EQUALS(techs[name].supersedes, "phase_village");
	TS_ASSERT_EQUALS(techs[name].requirements.all.length, 4);
}
TS_ASSERT_EQUALS(techs.phase_city_athen.genericName, "Advanced State");
TS_ASSERT_EQUALS(techs.phase_city_athen.cost.construction_materials, 50);
TS_ASSERT_EQUALS(techs.phase_city_athen.researchTime, 60);
TS_ASSERT_EQUALS(techs.phase_city_athen.supersedes, "phase_town_athen");
TS_ASSERT_EQUALS(techs.phase_city_athen.replaces[0], "phase_city");
TS_ASSERT_EQUALS(techs.phase_city_athen.requirements.entity.class, "NationConstructionMaterialsFactory");
TS_ASSERT_EQUALS(techs.phase_city_athen.requirements.entity.number, 2);
TS_ASSERT_EQUALS(techs.phase_city_generic.supersedes, "phase_town_generic");
TS_ASSERT_EQUALS(techs.phase_city_generic.cost.construction_materials, 50);

function readTemplate(rel)
{
	return fs.readFileSync(path.join(templateDir, rel), "utf8");
}

const factoryXml = readTemplate("structures/nation/construction_materials_factory.xml");
TS_ASSERT(factoryXml.includes("NationConstructionMaterialsFactory"));
TS_ASSERT(factoryXml.includes("phase_town"));
TS_ASSERT(factoryXml.includes("<wood>0</wood>"));
TS_ASSERT(factoryXml.includes("<Population>0</Population>"));

const adminXml = readTemplate("structures/nation/regional_administration.xml");
TS_ASSERT(adminXml.includes("phase_city"));
TS_ASSERT(adminXml.includes("<Root>true</Root>"));
TS_ASSERT(adminXml.includes("<Radius>72</Radius>"));
TS_ASSERT(adminXml.includes("<Weight>4000</Weight>"));
TS_ASSERT(adminXml.includes("<Population>0</Population>"));
TS_ASSERT(!adminXml.includes("<Bonus>"));

for (const rel of [
	"structures/nation/logging_camp.xml",
	"structures/nation/quarry.xml",
	"structures/nation/mine.xml"
])
	TS_ASSERT(readTemplate(rel).includes("Nation"));

for (const rel of ["units/nation/farmer.xml", "units/nation/extraction_worker.xml"])
{
	const xml = readTemplate(rel);
	TS_ASSERT(xml.includes("structures/nation/construction_materials_factory"));
	TS_ASSERT(xml.includes("structures/nation/regional_administration"));
}

const ccXml = readTemplate("structures/nation/civil_centre.xml");
TS_ASSERT(!ccXml.includes("<Researcher disable"));
TS_ASSERT(ccXml.includes("<time>2</time>"));

const playerTemplate = {
	"SpyCostMultiplier": "1",
	"BarterMultiplier": {
		"Buy": { "food": "1", "wood": "1", "stone": "1", "metal": "1" },
		"Sell": { "food": "1", "wood": "1", "stone": "1", "metal": "1" }
	},
	"Formations": { "_string": "" }
};

const researcherTemplate = {
	"Technologies": { "_string": "phase_town_{civ} phase_city_{civ}" }
};

const recipe = {
	"Interval": "10000",
	"Inputs": { "wood": "10", "stone": "10", "metal": "5" },
	"Outputs": { "construction_materials": "10" }
};

const classes = {
	"NationLoggingCamp": 1,
	"NationQuarry": 1,
	"NationMine": 1,
	"NationConstructionMaterialsFactory": 1
};

AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 4,
	"GetPlayerByID": id => id
});
AddMock(SYSTEM_ENTITY, IID_Trigger, {
	"CallEvent": () => {}
});
AddMock(SYSTEM_ENTITY, IID_GuiInterface, {
	"PushNotification": () => {}
});
AddMock(SYSTEM_ENTITY, IID_TemplateManager, {
	"GetTemplate": name =>
	{
		if (name == "structures/nation/construction_materials_factory")
			return {
				"Identity": {
					"Requirements": { "Techs": { "_string": "phase_town" } }
				}
			};
		if (name == "structures/nation/regional_administration")
			return {
				"Identity": {
					"Requirements": { "Techs": { "_string": "phase_city" } }
				}
			};
		return {};
	},
	"GetCurrentTemplateName": () => "structures/nation/mine"
});

function makePlayer(id, civ)
{
	const player = ConstructComponent(id, "Player", playerTemplate);
	player.SetPlayerID(id);
	const tech = ConstructComponent(id, "TechnologyManager");
	AddMock(id, IID_Identity, { "GetCiv": () => civ });
	tech.OnUpdate();
	return { "player": player, "tech": tech };
}

const nation = makePlayer(1, "athen");
const neighbor = makePlayer(2, "spart");
const rebels = makePlayer(3, "athen");
const settlement = ConstructComponent(30, "NationSettlement", {
	"Name": "Capital",
	"Population": "18000",
	"StateIntegration": "40",
	"IsCapital": "true"
});
nation.player.SetMaxPopulation(335);
nation.player.SetPopulationBonuses(335);
nation.player.AddPopulation(7);

function phaseOf(tech)
{
	if (tech.IsTechnologyResearched("phase_city"))
		return "city";
	if (tech.IsTechnologyResearched("phase_town"))
		return "town";
	if (tech.IsTechnologyResearched("phase_village"))
		return "village";
	return "";
}

TS_ASSERT_EQUALS(phaseOf(nation.tech), "village");
TS_ASSERT_EQUALS(phaseOf(neighbor.tech), "village");
TS_ASSERT_EQUALS(phaseOf(rebels.tech), "village");
TS_ASSERT(!nation.tech.IsTechnologyResearched("phase_town"));
TS_ASSERT(!nation.tech.IsTechnologyResearched("phase_town_athen"));
TS_ASSERT(!nation.tech.IsTechnologyResearched("phase_city"));
TS_ASSERT(!rebels.tech.IsTechnologyResearched("phase_town"));
TS_ASSERT(!rebels.tech.CanResearch("phase_town_athen"));

AddMock(10, IID_Ownership, { "GetOwner": () => 1 });
const researcher = ConstructComponent(10, "Researcher", researcherTemplate);
TS_ASSERT(researcher.GetTechnologiesList().indexOf("phase_town_athen") !== -1);

TS_ASSERT(!nation.tech.CanProduce("structures/nation/construction_materials_factory"));
TS_ASSERT(!nation.tech.CanProduce("structures/nation/regional_administration"));

const cmpTimer = ConstructComponent(SYSTEM_ENTITY, "Timer");
AddMock(70, IID_Ownership, { "GetOwner": () => 1 });
const factory = ConstructComponent(70, "IndustrialProduction", recipe);
factory.OnInitGame();
nation.player.SetResourceCounts({
	"food": 1000,
	"wood": 300,
	"stone": 300,
	"metal": 300,
	"construction_materials": 0
});
cmpTimer.OnUpdate({ "turnLength": 10 });
TS_ASSERT_EQUALS(nation.player.GetResourceCounts().construction_materials, 10);
TS_ASSERT_EQUALS(phaseOf(nation.tech), "village");
factory.Stop();

function stock()
{
	const counts = nation.player.GetResourceCounts();
	return {
		"food": counts.food,
		"wood": counts.wood,
		"stone": counts.stone,
		"metal": counts.metal,
		"construction_materials": counts.construction_materials
	};
}

nation.tech.classCounts = {
	"NationLoggingCamp": 1,
	"NationQuarry": 1,
	"NationMine": 0,
	"NationConstructionMaterialsFactory": 1
};
TS_ASSERT(!nation.tech.CanResearch("phase_town_athen"));
nation.player.SetResourceCounts({ "construction_materials": 20 });
TS_ASSERT(!nation.tech.IsInProgress("phase_town_athen"));
TS_ASSERT_EQUALS(nation.player.GetResourceCounts().construction_materials, 20);

AddMock(67, IID_Identity, {
	"GetClassesList": () => ["NationMine"]
});
nation.tech.OnGlobalOwnershipChanged({ "entity": 67, "from": -1, "to": 1 });
TS_ASSERT_EQUALS(nation.tech.classCounts.NationMine, 1);
TS_ASSERT(nation.tech.CanResearch("phase_town_athen"));
nation.tech.OnGlobalOwnershipChanged({ "entity": 67, "from": 1, "to": -1 });
TS_ASSERT_EQUALS(nation.tech.classCounts.NationMine, undefined);
TS_ASSERT(!nation.tech.CanResearch("phase_town_athen"));

for (const cls in classes)
	nation.tech.classCounts[cls] = classes[cls];
neighbor.tech.classCounts = Object.assign({}, classes);
TS_ASSERT(neighbor.tech.CanResearch("phase_town_generic"));
neighbor.tech.classCounts.NationQuarry = 0;
TS_ASSERT(!neighbor.tech.CanResearch("phase_town_generic"));

nation.player.SetResourceCounts({
	"food": 1000,
	"wood": 290,
	"stone": 290,
	"metal": 295,
	"construction_materials": 19
});
TS_ASSERT(nation.tech.CanResearch("phase_town_athen"));
TS_ASSERT_EQUALS(researcher.QueueTechnology("phase_town_athen"), -1);
TS_ASSERT_EQUALS(stock().construction_materials, 19);
TS_ASSERT_EQUALS(stock().food, 1000);
TS_ASSERT_EQUALS(stock().wood, 290);
TS_ASSERT(!nation.tech.IsInProgress("phase_town_athen"));

nation.player.SetResourceCounts({ "construction_materials": 20 });
const researchId = researcher.QueueTechnology("phase_town_athen");
TS_ASSERT(researchId >= 0);
TS_ASSERT_EQUALS(stock().construction_materials, 0);
TS_ASSERT_EQUALS(stock().food, 1000);
TS_ASSERT_EQUALS(stock().wood, 290);
TS_ASSERT_EQUALS(stock().stone, 290);
TS_ASSERT_EQUALS(stock().metal, 295);
TS_ASSERT(!nation.tech.IsTechnologyResearched("phase_town"));

// Requirements are not rechecked after research has started.
nation.tech.classCounts.NationMine = 0;
TS_ASSERT_EQUALS(researcher.Progress(researchId, 10000), 10000);
TS_ASSERT(nation.tech.IsInProgress("phase_town_athen"));
TS_ASSERT_EQUALS(nation.tech.GetBasicInfo("phase_town_athen").timeRemaining, 20000);

const savedTech = nation.tech.Serialize();
const savedResearch = researcher.Serialize();
delete g_Components[1][IID_TechnologyManager];
const restoredTech = ConstructComponent(1, "TechnologyManager");
restoredTech.Deserialize(savedTech);
nation.tech = restoredTech;
const restoredResearch = researcher;
restoredResearch.Deserialize(savedResearch);
TS_ASSERT_EQUALS(stock().construction_materials, 0);
TS_ASSERT_EQUALS(restoredResearch.Progress(researchId, 20000), 20000);
TS_ASSERT(restoredTech.IsTechnologyResearched("phase_town_athen"));
TS_ASSERT(restoredTech.IsTechnologyResearched("phase_town"));
TS_ASSERT(!restoredTech.IsTechnologyResearched("phase_city"));
TS_ASSERT_EQUALS(stock().construction_materials, 0);
TS_ASSERT_EQUALS(stock().food, 1000);
TS_ASSERT_EQUALS(phaseOf(restoredTech), "town");
TS_ASSERT(restoredTech.CanProduce("structures/nation/construction_materials_factory"));
TS_ASSERT(!restoredTech.CanProduce("structures/nation/regional_administration"));
TS_ASSERT(!restoredTech.CanResearch("phase_town_athen"));
TS_ASSERT(restoredResearch.GetTechnologiesList().indexOf("phase_city_athen") !== -1);
TS_ASSERT(restoredResearch.GetTechnologiesList().indexOf("phase_town_athen") === -1);

const savedDone = restoredTech.Serialize();
delete g_Components[1][IID_TechnologyManager];
const loadedDone = ConstructComponent(1, "TechnologyManager");
loadedDone.Deserialize(savedDone);
nation.tech = loadedDone;
TS_ASSERT(loadedDone.IsTechnologyResearched("phase_town"));
TS_ASSERT(!loadedDone.IsInProgress("phase_town_athen"));
TS_ASSERT(loadedDone.CanProduce("structures/nation/construction_materials_factory"));
TS_ASSERT_EQUALS(stock().construction_materials, 0);

TS_ASSERT_EQUALS(settlement.GetPopulation(), 18000);
TS_ASSERT_EQUALS(settlement.GetStateIntegration(), 40);
TS_ASSERT_EQUALS(settlement.GetDiscontent(), 0);
TS_ASSERT_EQUALS(nation.player.GetPopulationLimit(), 335);
TS_ASSERT_EQUALS(nation.player.GetPopulationCount(), 7);

AddMock(71, IID_Ownership, { "GetOwner": () => 1 });
const second = ConstructComponent(71, "IndustrialProduction", recipe);
factory.Start();
second.Start();
nation.player.SetResourceCounts({
	"wood": 40,
	"stone": 40,
	"metal": 20,
	"construction_materials": 0
});
cmpTimer.OnUpdate({ "turnLength": 10 });
TS_ASSERT_EQUALS(nation.player.GetResourceCounts().wood, 20);
TS_ASSERT_EQUALS(nation.player.GetResourceCounts().stone, 20);
TS_ASSERT_EQUALS(nation.player.GetResourceCounts().metal, 10);
TS_ASSERT_EQUALS(nation.player.GetResourceCounts().construction_materials, 20);
factory.Stop();
second.Stop();

loadedDone.classCounts.NationConstructionMaterialsFactory = 1;
TS_ASSERT(!loadedDone.CanResearch("phase_city_athen"));
loadedDone.classCounts.NationConstructionMaterialsFactory = 2;
nation.player.SetResourceCounts({
	"food": 1000,
	"wood": 20,
	"stone": 20,
	"metal": 10,
	"construction_materials": 49
});
TS_ASSERT(loadedDone.CanResearch("phase_city_athen"));
TS_ASSERT_EQUALS(researcher.QueueTechnology("phase_city_athen"), -1);
TS_ASSERT_EQUALS(nation.player.GetResourceCounts().construction_materials, 49);
TS_ASSERT_EQUALS(nation.player.GetResourceCounts().food, 1000);

nation.player.SetResourceCounts({ "construction_materials": 50 });
const cityId = researcher.QueueTechnology("phase_city_athen");
TS_ASSERT(cityId >= 0);
TS_ASSERT_EQUALS(nation.player.GetResourceCounts().construction_materials, 0);
TS_ASSERT_EQUALS(nation.player.GetResourceCounts().wood, 20);
TS_ASSERT_EQUALS(researcher.Progress(cityId, 59000), 59000);
TS_ASSERT(!loadedDone.IsTechnologyResearched("phase_city"));

const savedCity = loadedDone.Serialize();
const savedCityResearch = researcher.Serialize();
delete g_Components[1][IID_TechnologyManager];
const cityTech = ConstructComponent(1, "TechnologyManager");
cityTech.Deserialize(savedCity);
researcher.Deserialize(savedCityResearch);
TS_ASSERT_EQUALS(nation.player.GetResourceCounts().construction_materials, 0);
TS_ASSERT_EQUALS(researcher.Progress(cityId, 1000), 1000);
TS_ASSERT(cityTech.IsTechnologyResearched("phase_city_athen"));
TS_ASSERT(cityTech.IsTechnologyResearched("phase_city"));
TS_ASSERT(cityTech.IsTechnologyResearched("phase_town"));
TS_ASSERT_EQUALS(nation.player.GetResourceCounts().construction_materials, 0);
TS_ASSERT_EQUALS(phaseOf(cityTech), "city");
TS_ASSERT(cityTech.CanProduce("structures/nation/regional_administration"));
TS_ASSERT(cityTech.CanProduce("structures/nation/construction_materials_factory"));
TS_ASSERT(!cityTech.CanResearch("phase_city_athen"));
TS_ASSERT(!cityTech.CanResearch("phase_town_athen"));

TS_ASSERT_EQUALS(settlement.GetPopulation(), 18000);
TS_ASSERT_EQUALS(settlement.GetStateIntegration(), 40);
TS_ASSERT_EQUALS(settlement.GetDiscontent(), 0);
TS_ASSERT_EQUALS(nation.player.GetPopulationLimit(), 335);
TS_ASSERT_EQUALS(nation.player.GetPopulationCount(), 7);
TS_ASSERT_EQUALS(nation.player.GetResourceCounts().food, 1000);
TS_ASSERT(!rebels.tech.IsTechnologyResearched("phase_town"));
TS_ASSERT_EQUALS(phaseOf(neighbor.tech), "village");
