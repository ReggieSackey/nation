// Milestone 1: routine domestic territory influence is gone. Placement uses the
// generic BuildRestrictions "sovereign" token, and effective control falls back
// to the sovereign when TerritoryManager reports 0.

Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/NationSettlement.js");
Engine.LoadComponentScript("Sovereignty.js");
Engine.LoadComponentScript("NationSettlement.js");

const g_Calls = [];
global.g_Commands = {
	"construct": function(player, cmd)
	{
		g_Calls.push({
			"player": player,
			"template": cmd.template,
			"x": cmd.x,
			"z": cmd.z
		});
		return "built";
	}
};

Engine.LoadComponentScript("interfaces/DomesticAdministration.js");
Engine.LoadComponentScript("DomesticAdministration.js");

Engine.RegisterInterface("TerritoryManager");
Engine.RegisterInterface("TechnologyManager");
global.QueryPlayerIDInterface = () => null;

AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 3
});

// Native grid for the two test rectangles. Cell centers at x=4..252 are player 1.
// The shared edge x=256 is cell 32, center 260, player 2.
AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, {
	"GetOwner": (x, z) =>
	{
		const i = Math.floor(x / 8);
		const j = Math.floor(z / 8);
		if (i < 0 || j < 0)
			return INVALID_PLAYER;
		if (i < 32)
			return 1;
		if (i < 64)
			return 2;
		return INVALID_PLAYER;
	}
});

const g_Regions = [
	{
		"owner": 1,
		"points": [
			{ "x": 0, "z": 0 },
			{ "x": 256, "z": 0 },
			{ "x": 256, "z": 512 },
			{ "x": 0, "z": 512 }
		]
	},
	{
		"owner": 2,
		"points": [
			{ "x": 256, "z": 0 },
			{ "x": 512, "z": 0 },
			{ "x": 512, "z": 512 },
			{ "x": 256, "z": 512 }
		]
	}
];

const cmpSovereignty = ConstructComponent(SYSTEM_ENTITY, "Sovereignty");
global.InitAttributes = {
	"settings": {
		"Sovereignty": g_Regions
	}
};
cmpSovereignty.OnInitGame();

// ---------------------------------------------------------------
// Effective controller: sovereign fallback, hostile override.
// ---------------------------------------------------------------

const owners = {};
AddMock(SYSTEM_ENTITY, IID_TerritoryManager, {
	"GetOwner": (x, z) => owners[x + "," + z] || 0
});

AddMock(32, IID_Position, {
	"IsInWorld": () => true,
	"GetPosition2D": () => ({ "x": 40, "y": 220 })
});
const western = ConstructComponent(32, "NationSettlement", {
	"Name": "Western Village",
	"Population": "4000",
	"StateIntegration": "40",
	"IsCapital": "false"
});

TS_ASSERT_EQUALS(western.GetSovereignOwner(), 1);
// Sovereign 1 / territory 0 -> normal peacetime Densiran control.
TS_ASSERT_EQUALS(western.GetEffectiveController(), 1);
// Sovereign 1 / territory 1 -> tolerated, still 1.
owners["40,220"] = 1;
TS_ASSERT_EQUALS(western.GetEffectiveController(), 1);
// Sovereign 1 / territory 2 -> Adoméan control.
owners["40,220"] = 2;
TS_ASSERT_EQUALS(western.GetEffectiveController(), 2);
owners["40,220"] = 0;

AddMock(33, IID_Position, {
	"IsInWorld": () => true,
	"GetPosition2D": () => ({ "x": 400, "y": 300 })
});
const eastern = ConstructComponent(33, "NationSettlement", {
	"Name": "Eastern Village",
	"Population": "2000",
	"StateIntegration": "20",
	"IsCapital": "false"
});
TS_ASSERT_EQUALS(eastern.GetSovereignOwner(), 2);
TS_ASSERT_EQUALS(eastern.GetEffectiveController(), 2);

const restoredWestern = SerializationCycle(western);
TS_ASSERT_EQUALS(restoredWestern.GetStateIntegration(), 40);
TS_ASSERT_EQUALS(restoredWestern.GetEffectiveController(), 1);

// ---------------------------------------------------------------
// DomesticAdministration: only the phase gate remains.
// ---------------------------------------------------------------

TS_ASSERT_EQUALS(g_Commands.construct(1, {
	"template": "structures/nation/regional_administration",
	"x": 96,
	"z": 230
}), "built");
TS_ASSERT_EQUALS(g_Calls.length, 1);

// The spatial rule no longer lives here; foreign coordinates are not checked
// by this wrapper. The phase gate still is.
global.QueryPlayerIDInterface = (player, iid) =>
	iid === IID_TechnologyManager ? { "CanProduce": () => false } : null;
TS_ASSERT_EQUALS(g_Commands.construct(1, {
	"template": "structures/nation/regional_administration",
	"x": 400,
	"z": 400
}), false);
TS_ASSERT_EQUALS(g_Calls.length, 1);
global.QueryPlayerIDInterface = () => null;

TS_ASSERT_EQUALS(g_Commands.construct(1, {
	"template": "structures/nation/civil_centre",
	"x": 400,
	"z": 400
}), "built");
TS_ASSERT_EQUALS(g_Calls.length, 2);

// ---------------------------------------------------------------
// Templates: no routine domestic territory influence, no decay,
// sovereign placement; the foreign office keeps its influence.
// ---------------------------------------------------------------

const templateDir = "/Users/reg/Documents/GitHub/nation/binaries/data/mods/nation/simulation/templates";

const adminXml = fs.readFileSync(
	path.join(templateDir, "structures/nation/regional_administration.xml"),
	"utf8");
TS_ASSERT(adminXml.includes("phase_city"));
TS_ASSERT(adminXml.includes("<Territory>sovereign</Territory>"));
TS_ASSERT(adminXml.includes("TerritoryInfluence disable"));
TS_ASSERT(adminXml.includes("TerritoryDecay disable"));
TS_ASSERT(!adminXml.includes("<Root>"));
TS_ASSERT(!adminXml.includes("<Radius>"));
TS_ASSERT(!adminXml.includes("<Weight>"));

const districtXml = fs.readFileSync(
	path.join(templateDir, "structures/nation/district_office.xml"),
	"utf8");
TS_ASSERT(!districtXml.includes("TerritoryInfluence"));
TS_ASSERT(!districtXml.includes("TerritoryDecay"));

const nationCentre = fs.readFileSync(
	path.join(templateDir, "structures/nation/civil_centre.xml"),
	"utf8");
TS_ASSERT(nationCentre.includes("<Territory>sovereign</Territory>"));
TS_ASSERT(nationCentre.includes("TerritoryInfluence disable"));
TS_ASSERT(nationCentre.includes("TerritoryDecay disable"));
TS_ASSERT(!nationCentre.includes("<Radius>"));

const neighborCentre = fs.readFileSync(
	path.join(templateDir, "structures/nation/neighbor_civil_centre.xml"),
	"utf8");
TS_ASSERT(neighborCentre.includes("<Territory>sovereign</Territory>"));
TS_ASSERT(neighborCentre.includes("TerritoryInfluence disable"));
TS_ASSERT(neighborCentre.includes("TerritoryDecay disable"));

const foreignXml = fs.readFileSync(
	path.join(templateDir, "structures/nation/foreign_administration.xml"),
	"utf8");
// The exceptional occupation office keeps projecting control.
TS_ASSERT(!foreignXml.includes("TerritoryInfluence disable"));
TS_ASSERT(foreignXml.includes("<Radius>72</Radius>"));
TS_ASSERT(!foreignXml.includes("<Territory>sovereign</Territory>"));
