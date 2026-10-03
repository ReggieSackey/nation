Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("interfaces/SovereignBorderTracker.js");
Engine.LoadComponentScript("SovereignBorderTracker.js");

let g_RegionsReady = false;

function sovereignAt(position)
{
	if (!g_RegionsReady)
		return INVALID_PLAYER;
	if (position.x < 0 || position.x > 512)
		return INVALID_PLAYER;
	// Shared edge x = 256 belongs to player 1, matching Sovereignty's earlier region.
	return position.x <= 256 ? 1 : 2;
}

AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
	"GetSovereignOwner": sovereignAt,
	"GetRegions": () => g_RegionsReady ? [{ "owner": 1 }, { "owner": 2 }] : []
});

const g_Crossings = [];
Engine.PostMessage = function(entity, type, message)
{
	if (type === MT_SovereignBorderCrossed)
		g_Crossings.push(message);
};

const UNIT = 13;
let g_Owner = 1;
AddMock(UNIT, IID_UnitMotion, {});
AddMock(UNIT, IID_Ownership, {
	"GetOwner": () => g_Owner
});

const BUILDING = 10;
AddMock(BUILDING, IID_Ownership, {
	"GetOwner": () => 1
});

const GAIA = 40;
AddMock(GAIA, IID_UnitMotion, {});
AddMock(GAIA, IID_Ownership, {
	"GetOwner": () => 0
});

var cmpTracker = ConstructComponent(SYSTEM_ENTITY, "SovereignBorderTracker");

function move(entity, x, z, inWorld)
{
	cmpTracker.OnGlobalPositionChanged({
		"entity": entity,
		"inWorld": inWorld !== false,
		"x": x,
		"z": z,
		"a": 0
	});
}

move(UNIT, 100, 200);
TS_ASSERT_EQUALS(g_Crossings.length, 0);
TS_ASSERT_EQUALS(cmpTracker.sovereignOwners[UNIT], undefined);

g_RegionsReady = true;

move(BUILDING, 100, 200);
move(BUILDING, 400, 200);
move(GAIA, 100, 200);
move(GAIA, 400, 200);
TS_ASSERT_EQUALS(g_Crossings.length, 0);
TS_ASSERT_EQUALS(cmpTracker.sovereignOwners[BUILDING], undefined);
TS_ASSERT_EQUALS(cmpTracker.sovereignOwners[GAIA], undefined);

// First observation records the sovereign owner and emits nothing.
move(UNIT, 100, 200);
TS_ASSERT_EQUALS(g_Crossings.length, 0);
TS_ASSERT_EQUALS(cmpTracker.sovereignOwners[UNIT], 1);

// Changing the entity's owner while it stays put is not a crossing.
g_Owner = 2;
TS_ASSERT_EQUALS(g_Crossings.length, 0);
TS_ASSERT_EQUALS(cmpTracker.sovereignOwners[UNIT], 1);
g_Owner = 1;

// Leaving the world, such as garrison, is not a land crossing.
move(UNIT, 0, 0, false);
TS_ASSERT_EQUALS(g_Crossings.length, 0);
TS_ASSERT_EQUALS(cmpTracker.sovereignOwners[UNIT], 1);

const cmpRestored = SerializationCycle(cmpTracker);
TS_ASSERT_EQUALS(cmpRestored.sovereignOwners[UNIT], 1);
cmpTracker = cmpRestored;

// Repeated movement inside one sovereign region emits nothing.
move(UNIT, 120, 200);
move(UNIT, 200, 180);
move(UNIT, 256, 200);
TS_ASSERT_EQUALS(g_Crossings.length, 0);
TS_ASSERT_EQUALS(cmpTracker.sovereignOwners[UNIT], 1);

move(UNIT, 400, 200);
TS_ASSERT_EQUALS(g_Crossings.length, 1);
TS_ASSERT_EQUALS(g_Crossings[0].entity, UNIT);
TS_ASSERT_EQUALS(g_Crossings[0].from, 1);
TS_ASSERT_EQUALS(g_Crossings[0].to, 2);

move(UNIT, 450, 220);
TS_ASSERT_EQUALS(g_Crossings.length, 1);

move(UNIT, 100, 200);
TS_ASSERT_EQUALS(g_Crossings.length, 2);
TS_ASSERT_EQUALS(g_Crossings[1].from, 2);
TS_ASSERT_EQUALS(g_Crossings[1].to, 1);

move(UNIT, 150, 200);
TS_ASSERT_EQUALS(g_Crossings.length, 2);

move(UNIT, 600, 200);
TS_ASSERT_EQUALS(g_Crossings.length, 3);
TS_ASSERT_EQUALS(g_Crossings[2].from, 1);
TS_ASSERT_EQUALS(g_Crossings[2].to, INVALID_PLAYER);

move(UNIT, 700, 10);
TS_ASSERT_EQUALS(g_Crossings.length, 3);

move(UNIT, 400, 200);
TS_ASSERT_EQUALS(g_Crossings.length, 4);
TS_ASSERT_EQUALS(g_Crossings[3].from, INVALID_PLAYER);
TS_ASSERT_EQUALS(g_Crossings[3].to, 2);

cmpTracker.OnGlobalDestroy({ "entity": UNIT });
TS_ASSERT_EQUALS(cmpTracker.sovereignOwners[UNIT], undefined);

move(UNIT, 400, 200);
TS_ASSERT_EQUALS(g_Crossings.length, 4);
TS_ASSERT_EQUALS(cmpTracker.sovereignOwners[UNIT], 2);
