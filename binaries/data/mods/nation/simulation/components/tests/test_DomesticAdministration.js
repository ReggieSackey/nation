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

AddMock(SYSTEM_ENTITY, IID_TerritoryManager, {
	"GetOwner": () =>
	{
		throw new Error("MayPlace consulted TerritoryManager");
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

const cmpAdmin = ConstructComponent(SYSTEM_ENTITY, "DomesticAdministration");

// Sovereign but uncontrolled land is allowed. TerritoryManager is not asked.
TS_ASSERT_EQUALS(cmpAdmin.MayPlace(1, 96, 230), true);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 96, "z": 230 }), 1);

// Foreign sovereignty is rejected, including the shared edge for the later polygon.
TS_ASSERT_EQUALS(cmpAdmin.MayPlace(1, 400, 400), false);
TS_ASSERT_EQUALS(cmpAdmin.MayPlace(1, 270, 380), false);
TS_ASSERT_EQUALS(cmpAdmin.MayPlace(2, 96, 230), false);

// The shared edge belongs to the earlier polygon, player 1.
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 256, "z": 256 }), 1);
TS_ASSERT_EQUALS(cmpAdmin.MayPlace(1, 256, 256), true);
TS_ASSERT_EQUALS(cmpAdmin.MayPlace(2, 256, 256), false);

TS_ASSERT_EQUALS(cmpAdmin.MayPlace(0, 96, 230), false);
TS_ASSERT_EQUALS(cmpAdmin.MayPlace(1, NaN, 230), false);

const restored = SerializationCycle(cmpAdmin);
TS_ASSERT_EQUALS(restored.MayPlace(1, 96, 230), true);
TS_ASSERT_EQUALS(restored.MayPlace(1, 400, 400), false);
TS_ASSERT_EQUALS(cmpSovereignty.GetRegions().length, 2);

TS_ASSERT_EQUALS(g_Commands.construct(1, {
	"template": "structures/nation/regional_administration",
	"x": 400,
	"z": 400
}), false);
TS_ASSERT_EQUALS(g_Calls.length, 0);

TS_ASSERT_EQUALS(g_Commands.construct(1, {
	"template": "structures/nation/regional_administration",
	"x": 270,
	"z": 380
}), false);
TS_ASSERT_EQUALS(g_Calls.length, 0);

TS_ASSERT_EQUALS(g_Commands.construct(1, {
	"template": "structures/nation/regional_administration",
	"x": 96,
	"z": 230
}), "built");
TS_ASSERT_EQUALS(g_Calls.length, 1);

TS_ASSERT_EQUALS(g_Commands.construct(1, {
	"template": "structures/nation/civil_centre",
	"x": 400,
	"z": 400
}), "built");
TS_ASSERT_EQUALS(g_Calls.length, 2);

global.QueryPlayerIDInterface = (player, iid) =>
	iid === IID_TechnologyManager ? { "CanProduce": () => false } : null;
TS_ASSERT_EQUALS(g_Commands.construct(1, {
	"template": "structures/nation/regional_administration",
	"x": 96,
	"z": 230
}), false);
TS_ASSERT_EQUALS(g_Calls.length, 2);
global.QueryPlayerIDInterface = () => null;

const templateDir = "/Users/reg/Documents/GitHub/nation/binaries/data/mods/nation/simulation/templates";
const adminXml = fs.readFileSync(
	path.join(templateDir, "structures/nation/regional_administration.xml"),
	"utf8");
TS_ASSERT(adminXml.includes("phase_city"));
TS_ASSERT(adminXml.includes("<Root>true</Root>"));
TS_ASSERT(adminXml.includes("<Radius>72</Radius>"));
TS_ASSERT(adminXml.includes("<Weight>4000</Weight>"));
TS_ASSERT(adminXml.includes("<Territory>own neutral</Territory>"));
TS_ASSERT(adminXml.includes("<Population>0</Population>"));
TS_ASSERT(!adminXml.includes("TerritoryInfluence disable"));
TS_ASSERT(!adminXml.includes("<PopulationBonus"));

const nationCentre = fs.readFileSync(
	path.join(templateDir, "structures/nation/civil_centre.xml"),
	"utf8");
TS_ASSERT(nationCentre.includes("<Radius>140</Radius>"));
TS_ASSERT(nationCentre.includes("<Weight>10000</Weight>"));

const neighborCentre = fs.readFileSync(
	path.join(templateDir, "structures/nation/neighbor_civil_centre.xml"),
	"utf8");
TS_ASSERT(neighborCentre.includes("<Radius>90</Radius>"));
TS_ASSERT(neighborCentre.includes("<Weight>10000</Weight>"));

DeleteMock(SYSTEM_ENTITY, IID_TerritoryManager);
const owners = {};
AddMock(SYSTEM_ENTITY, IID_TerritoryManager, {
	"GetOwner": (x, z) => owners[x + "," + z] || 0
});
AddMock(32, IID_Position, {
	"IsInWorld": () => true,
	"GetPosition2D": () => ({ "x": 40, "y": 220 })
});
owners["40,220"] = 0;
const western = ConstructComponent(32, "NationSettlement", {
	"Name": "Western Village",
	"Population": "4000",
	"StateIntegration": "40",
	"IsCapital": "false"
});
TS_ASSERT_EQUALS(western.GetSovereignOwner(), 1);
TS_ASSERT_EQUALS(western.GetEffectiveController(), 0);
owners["40,220"] = 1;
TS_ASSERT_EQUALS(western.GetEffectiveController(), 1);
const restoredWestern = SerializationCycle(western);
TS_ASSERT_EQUALS(restoredWestern.GetStateIntegration(), 40);
TS_ASSERT_EQUALS(restoredWestern.GetEffectiveController(), 1);
