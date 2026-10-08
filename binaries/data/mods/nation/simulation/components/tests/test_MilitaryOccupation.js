Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/NationSettlement.js");
Engine.LoadComponentScript("interfaces/RebellionManager.js");
Engine.LoadComponentScript("interfaces/Diplomacy.js");
Engine.LoadComponentScript("interfaces/Health.js");
Engine.LoadComponentScript("interfaces/TechnologyManager.js");
Engine.RegisterInterface("Identity");
Engine.RegisterInterface("UnitMotion");
Engine.RegisterInterface("RangeManager");
Engine.RegisterInterface("TerritoryManager");

const g_Calls = [];
global.g_Commands = {
	"construct": function(player, cmd)
	{
		g_Calls.push(cmd.template);
		return "built";
	}
};

Engine.LoadComponentScript("interfaces/MilitaryOccupation.js");
Engine.LoadComponentScript("MilitaryOccupation.js");

const EAST = 34;
const stances = {};
let techReady = true;
const units = {};
let queryPlayers = [];

function stance(player, other, value)
{
	if (!stances[player])
		stances[player] = {};
	stances[player][other] = value;
}

global.QueryPlayerIDInterface = (player, iid) =>
{
	if (iid === IID_Diplomacy)
		return {
			"IsEnemy": other => !!(stances[player] && stances[player][other] < 0)
		};
	if (iid === IID_TechnologyManager)
		return { "CanProduce": () => techReady };
	return null;
};

AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 5
});
AddMock(SYSTEM_ENTITY, IID_RebellionManager, {
	"GetRebelPlayer": () => 3
});
AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
	"GetSovereignOwner": pos => pos.x < 256 ? 1 : 2
});
AddMock(SYSTEM_ENTITY, IID_TerritoryManager, {
	"GetOwner": () =>
	{
		throw new Error("occupation consulted TerritoryManager");
	}
});
AddMock(SYSTEM_ENTITY, IID_RangeManager, {
	"ExecuteQueryAroundPos": (pos, min, max, players) =>
	{
		queryPlayers = players.slice();
		TS_ASSERT_EQUALS(max, 60);
		return Object.keys(units).map(id => +id).filter(id => players.indexOf(units[id].owner) !== -1);
	}
});

Engine.GetEntitiesWithInterface = iid => iid === IID_NationSettlement ? [EAST] : [];

AddMock(EAST, IID_NationSettlement, {
	"GetSovereignOwner": () => 2
});
AddMock(EAST, IID_Position, {
	"IsInWorld": () => true,
	"GetPosition2D": () => ({ "x": 420, "y": 400 })
});

function addUnit(id, owner, x, z, soldier, hitpoints)
{
	units[id] = { "owner": owner, "x": x, "z": z, "soldier": soldier, "hitpoints": hitpoints };
	AddMock(id, IID_Identity, {
		"HasClass": name => units[id].soldier && name === "Soldier"
	});
	AddMock(id, IID_UnitMotion, {});
	AddMock(id, IID_Health, {
		"GetHitpoints": () => units[id].hitpoints
	});
	AddMock(id, IID_Ownership, {
		"GetOwner": () => units[id].owner
	});
	AddMock(id, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": units[id].x, "y": units[id].z })
	});
}

const cmp = ConstructComponent(SYSTEM_ENTITY, "MilitaryOccupation");

TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 0);
TS_ASSERT(!cmp.IsOccupied(EAST));

addUnit(101, 1, 424, 408, true, 100);
addUnit(102, 1, 412, 404, true, 100);
TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 0);

addUnit(103, 1, 428, 392, true, 100);
TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 0);
TS_ASSERT_EQUALS(queryPlayers.indexOf(1), -1);

stance(1, 2, -1);
stance(2, 1, -1);
TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 1);
TS_ASSERT(cmp.IsOccupiedBy(EAST, 1));

units[103].x = 420;
units[103].z = 470;
TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 0);
units[103].x = 428;
units[103].z = 392;
TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 1);

addUnit(104, 1, 430, 400, true, 100);
TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 1);

stance(1, 2, 0);
stance(2, 1, 0);
TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 0);
stance(1, 2, -1);
stance(2, 1, -1);
TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 1);

addUnit(201, 1, 424, 408, false, 100);
addUnit(202, 1, 412, 404, false, 100);
addUnit(203, 1, 428, 392, false, 100);
units[101].soldier = false;
units[102].soldier = false;
units[103].soldier = false;
units[104].soldier = false;
TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 0);
units[101].soldier = true;
units[102].soldier = true;
units[103].soldier = true;
units[104].soldier = true;

addUnit(301, 3, 424, 408, true, 100);
addUnit(302, 3, 412, 404, true, 100);
addUnit(303, 3, 428, 392, true, 100);
stance(3, 2, -1);
stance(2, 3, -1);
TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 1);

units[104].x = 420;
units[104].z = 470;
units[101].hitpoints = 0;
TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 0);
units[101].hitpoints = 100;
units[104].x = 430;
units[104].z = 400;
TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 1);

TS_ASSERT_EQUALS(cmp.MayPlace(1, 440, 400), true);
TS_ASSERT_EQUALS(cmp.MayPlace(1, 270, 380), false);
TS_ASSERT_EQUALS(cmp.MayPlace(1, 96, 230), false);
TS_ASSERT_EQUALS(cmp.MayPlace(1, 420, 500), false);

TS_ASSERT_EQUALS(g_Commands.construct(1, {
	"template": "structures/nation/foreign_administration",
	"x": 270,
	"z": 380
}), false);
TS_ASSERT_EQUALS(g_Calls.length, 0);
techReady = false;
TS_ASSERT_EQUALS(g_Commands.construct(1, {
	"template": "structures/nation/foreign_administration",
	"x": 440,
	"z": 400
}), false);
TS_ASSERT_EQUALS(g_Calls.length, 0);
techReady = true;
TS_ASSERT_EQUALS(g_Commands.construct(1, {
	"template": "structures/nation/foreign_administration",
	"x": 440,
	"z": 400
}), "built");
TS_ASSERT_EQUALS(g_Calls.length, 1);

stance(4, 2, 0);
stance(2, 4, 0);
units[101].owner = 2;
units[102].owner = 2;
units[103].owner = 2;
units[104].owner = 2;
TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 0);
TS_ASSERT_EQUALS(cmp.MayPlace(1, 440, 400), false);
units[101].owner = 1;
units[102].owner = 1;
units[103].owner = 1;
units[104].owner = 1;
stance(1, 2, 0);
stance(2, 1, 0);
TS_ASSERT_EQUALS(cmp.MayPlace(1, 440, 400), false);
stance(1, 2, -1);
stance(2, 1, -1);
TS_ASSERT_EQUALS(cmp.MayPlace(1, 440, 400), true);

units[104].x = 420;
units[104].z = 470;
addUnit(401, 4, 418, 406, true, 100);
addUnit(402, 4, 422, 396, true, 100);
addUnit(403, 4, 416, 402, true, 100);
addUnit(404, 4, 426, 404, true, 100);
stance(4, 2, -1);
stance(2, 4, -1);
TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 4);
units[404].hitpoints = 0;
TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 1);
units[404].hitpoints = 100;
TS_ASSERT_EQUALS(cmp.GetOccupier(EAST), 4);

TS_ASSERT_EQUALS(g_Commands.construct(1, {
	"template": "structures/nation/regional_administration",
	"x": 440,
	"z": 400
}), "built");

const restored = SerializationCycle(cmp);
TS_ASSERT_EQUALS(restored.GetOccupier(EAST), 4);
TS_ASSERT_EQUALS(Object.keys(restored).length, 0);

const templateDir = path.resolve("binaries/data/mods/nation/simulation/templates");
const xml = fs.readFileSync(path.join(templateDir, "structures/nation/foreign_administration.xml"), "utf8");
TS_ASSERT(xml.includes("phase_city"));
TS_ASSERT(xml.includes("<Root>true</Root>"));
TS_ASSERT(xml.includes("<Radius>72</Radius>"));
TS_ASSERT(xml.includes("<Weight>16000</Weight>"));
TS_ASSERT(xml.includes("<Population>0</Population>"));
TS_ASSERT(xml.includes("own neutral enemy"));
