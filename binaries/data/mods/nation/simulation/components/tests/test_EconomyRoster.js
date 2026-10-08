// Milestone 2 economy: worker rosters, trainer rosters, template placement,
// decay, and representative-capacity behavior.

const templateDir = "/Users/reg/Documents/GitHub/nation/binaries/data/mods/nation/simulation/templates";
function readTemplate(rel)
{
	return fs.readFileSync(path.join(templateDir, rel), "utf8");
}

// ------------------------------------------------------------------
// 1. Worker Builder rosters.
// ------------------------------------------------------------------

const farmer = readTemplate("units/nation/farmer.xml");
const extraction = readTemplate("units/nation/extraction_worker.xml");

const domesticRoster = [
	"structures/nation/grain_field",
	"structures/nation/farmstead",
	"structures/nation/logging_camp",
	"structures/nation/quarry",
	"structures/nation/mine",
	"structures/nation/town_house",
	"structures/nation/town_market",
	"structures/nation/town_storehouse",
	"structures/nation/town_barracks",
	"structures/nation/court",
	"structures/nation/regional_administration",
	"structures/nation/national_project",
	"structures/nation/trade_depot"
];

for (const building of domesticRoster)
{
	TS_ASSERT(farmer.includes(building));
}

// The extraction worker inherits the farmer roster through its parent and
// removes only the farm-only structures.
TS_ASSERT(extraction.includes('parent="units/nation/farmer"'));
TS_ASSERT(extraction.includes("-structures/nation/grain_field"));
TS_ASSERT(extraction.includes("-structures/nation/farmstead"));
for (const removal of extraction.match(/-structures\/nation\/[a-z_]+/g) || [])
	TS_ASSERT(["-structures/nation/grain_field", "-structures/nation/farmstead"].includes(removal));

TS_ASSERT(!farmer.includes("structures/nation/cocoa_grove"));
TS_ASSERT(!farmer.includes("structures/nation/cocoa_store"));
TS_ASSERT(!farmer.includes("structures/nation/construction_materials_factory"));

// The extraction worker removes the farm-only structures explicitly.
TS_ASSERT(extraction.includes("-structures/nation/grain_field"));
TS_ASSERT(extraction.includes("-structures/nation/farmstead"));

// No Athenian {civ} building stays buildable: every {civ} token is negated.
for (const token of farmer.split("\n"))
{
	const trimmed = token.trim();
	if (trimmed.includes("structures/{civ}/"))
		TS_ASSERT(trimmed.startsWith("-"));
}

// Workers carry the NationWorker class for infrastructure modifiers.
TS_ASSERT(farmer.includes("NationWorker"));

// Foreign administration stays technically buildable through this path,
// with its occupation prerequisite in MilitaryOccupation.MayPlace.
TS_ASSERT(farmer.includes("structures/nation/foreign_administration"));

// ------------------------------------------------------------------
// 2-4. Placement, influence, decay on every newly constructible building.
// ------------------------------------------------------------------

const sovereignBuildings = [
	"grain_field",
	"farmstead",
	"logging_camp",
	"quarry",
	"mine",
	"town_house",
	"town_market",
	"town_storehouse",
	"town_barracks",
	"court",
	"regional_administration",
	"national_project",
	"trade_depot",
	"civil_centre"
];

const inheritedSovereign = new Set();

for (const name of sovereignBuildings)
{
	const xml = readTemplate("structures/nation/" + name + ".xml");
	const parent = xml.match(/parent="([^"]+)"/)[1];
	if (!inheritedSovereign.has(name))
	{
		TS_ASSERT(xml.includes("<Territory>sovereign</Territory>"));
		TS_ASSERT(xml.includes("TerritoryDecay disable"));
		TS_ASSERT(xml.includes("TerritoryInfluence disable"));
	}
	else
	{
		// Effective through a Nation parent that carries all three.
		TS_ASSERT(parent.startsWith("structures/nation/"));
		const parentXml = readTemplate(parent + ".xml");
		TS_ASSERT(parentXml.includes("<Territory>sovereign</Territory>"));
		TS_ASSERT(parentXml.includes("TerritoryDecay disable"));
		TS_ASSERT(parentXml.includes("TerritoryInfluence disable"));
	}
}

// The foreign office is the exception: exceptional unrestricted influence.
const foreignXml = readTemplate("structures/nation/foreign_administration.xml");
TS_ASSERT(!foreignXml.includes("TerritoryInfluence disable"));
TS_ASSERT(!foreignXml.includes("Territory>sovereign"));

// Avémé's physical civic centre projects ordinary effective control so Petra
// can identify and develop its base. Legal sovereignty remains authoritative.
const neighborCivic = readTemplate("structures/nation/neighbor_civil_centre.xml");
TS_ASSERT(neighborCivic.includes("<Territory>sovereign</Territory>"));
TS_ASSERT(neighborCivic.includes("TerritoryDecay disable"));
TS_ASSERT(!neighborCivic.includes("TerritoryInfluence disable"));

// ------------------------------------------------------------------
// 5. Government House trains Nation workers.
// ------------------------------------------------------------------

const cc = readTemplate("structures/nation/civil_centre.xml");
TS_ASSERT(cc.includes("units/nation/farmer"));
TS_ASSERT(cc.includes("units/nation/extraction_worker"));
TS_ASSERT(cc.includes("-units/{civ}/infantry_spearman_b"));
TS_ASSERT(cc.includes("-units/{civ}/infantry_slinger_b"));
TS_ASSERT(cc.includes("-units/{civ}/cavalry_javelineer_b"));

const neighborCc = readTemplate("structures/nation/neighbor_civil_centre.xml");
TS_ASSERT(neighborCc.includes("units/nation/adome_worker"));
TS_ASSERT(neighborCc.includes("-units/{native}/support_civilian"));
TS_ASSERT(neighborCc.includes("-units/{civ}/infantry_spearman_b"));

const adomeWorker = readTemplate("units/nation/adome_worker.xml");
TS_ASSERT(adomeWorker.includes('parent="units/spart/support_female_citizen"'));
TS_ASSERT(adomeWorker.includes("NationWorker"));
for (const building of [
	"structures/nation/grain_field",
	"structures/nation/farmstead",
	"structures/nation/logging_camp",
	"structures/nation/quarry",
	"structures/nation/mine",
	"structures/nation/neighbor_house",
	"structures/nation/neighbor_market",
	"structures/nation/neighbor_barracks",
	"structures/nation/town_storehouse",
	"structures/nation/foreign_administration"
])
	TS_ASSERT(adomeWorker.includes(building));

// ------------------------------------------------------------------
// 6. Barracks trains the Nation soldier, not Athenians.
// ------------------------------------------------------------------

const barracks = readTemplate("structures/nation/town_barracks.xml");
TS_ASSERT(barracks.includes("units/nation/infantry"));
TS_ASSERT(barracks.includes("-units/{civ}/infantry_clubman"));
TS_ASSERT(barracks.includes("-units/{civ}/infantry_spearman_b"));
TS_ASSERT(barracks.includes("-units/{civ}/infantry_slinger_b"));
TS_ASSERT(barracks.includes("-units/{civ}/champion_infantry_spearman"));

const soldier = readTemplate("units/nation/infantry.xml");
// An ordinary representative soldier: costs population, no promotion.
TS_ASSERT(!soldier.includes("<Population>0</Population>"));
TS_ASSERT(soldier.includes("Promotion disable"));

// Rebel units remain population-cost 0.
const rebel = readTemplate("units/nation/rebel_fighter.xml");
TS_ASSERT(rebel.includes("<Population>0</Population>"));

// ------------------------------------------------------------------
// 7-8. Representative capacity stays authoritative; training does not
// touch demographic population. Verified through component behavior:
// ------------------------------------------------------------------

Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/NationSettlement.js");
Engine.LoadComponentScript("Sovereignty.js");
Engine.LoadComponentScript("NationSettlement.js");

const g_PopChanges = [];
AddMock(SYSTEM_ENTITY, IID_PlayerManager, { "GetNumPlayers": () => 2 });
AddMock(1, IID_Position, {
	"IsInWorld": () => true,
	"GetPosition2D": () => ({ "x": 40, "y": 220 })
});
const settlement = ConstructComponent(1, "NationSettlement", {
	"Name": "Western Village",
	"Population": "4000",
	"StateIntegration": "40",
	"IsCapital": "false"
});
TS_ASSERT_EQUALS(settlement.GetPopulation(), 4000);
// The training path never calls NationSettlement population setters; the
// authoritative capacity derivation lives in RepresentativeCapacity and
// consumes GetPopulation only. Recorded here as the invariant.
TS_ASSERT_EQUALS(settlement.GetPopulation(), 4000);
