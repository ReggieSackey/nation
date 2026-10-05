Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("Sovereignty.js");

AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 3
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

var cmpSovereignty = ConstructComponent(SYSTEM_ENTITY, "Sovereignty");
global.InitAttributes = {
	"settings": {
		"Sovereignty": g_Regions
	}
};
cmpSovereignty.OnInitGame();

TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 100, "z": 200 }), 1);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 400, "z": 200 }), 2);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 600, "z": 200 }), INVALID_PLAYER);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": -10, "z": 10 }), INVALID_PLAYER);
// Shared edge x=256 belongs to the earlier region.
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 256, "z": 200 }), 1);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 0, "z": 0 }), 1);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 512, "z": 512 }), 2);

const cmpRestored = SerializationCycle(cmpSovereignty);
TS_ASSERT_EQUALS(cmpRestored.GetSovereignOwner({ "x": 100, "z": 200 }), 1);
TS_ASSERT_EQUALS(cmpRestored.GetSovereignOwner({ "x": 400, "z": 200 }), 2);
TS_ASSERT_EQUALS(cmpRestored.GetSovereignOwner({ "x": 256, "z": 200 }), 1);
TS_ASSERT_UNEVAL_EQUALS(cmpRestored.GetRegions().length, 2);

cmpSovereignty.ReadRegions("not-an-array");
TS_ASSERT_EQUALS(cmpSovereignty.GetRegions().length, 0);
cmpSovereignty.ReadRegions([{ "owner": 1, "points": [{ "x": 0, "z": 0 }, { "x": 1, "z": 0 }] }]);
TS_ASSERT_EQUALS(cmpSovereignty.GetRegions().length, 0);
cmpSovereignty.ReadRegions([{ "owner": 9, "points": g_Regions[0].points }]);
TS_ASSERT_EQUALS(cmpSovereignty.GetRegions().length, 0);

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
TS_ASSERT_EQUALS(cmpSovereignty.ReadRegions(enlarged), true);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 520, "z": 790 }), 1);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 480, "z": 1360 }), 1);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 180, "z": 360 }), 1);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 800, "z": 220 }), 1);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 1280, "z": 820 }), 2);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 1400, "z": 200 }), 2);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 1020, "z": 0 }), 1);
const enlargedSaved = SerializationCycle(cmpSovereignty);
TS_ASSERT_EQUALS(enlargedSaved.GetSovereignOwner({ "x": 800, "z": 220 }), 1);
TS_ASSERT_EQUALS(enlargedSaved.GetSovereignOwner({ "x": 1280, "z": 820 }), 2);
