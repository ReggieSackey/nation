Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("Sovereignty.js");

AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 3
});

const g_Calls = [];
AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, {
	"GetOwner": (x, z) =>
	{
		g_Calls.push({ "x": x, "z": z });
		// 8m cells. This stands in for the native grid. It does not ray-cast.
		const i = Math.floor(x / 8);
		const j = Math.floor(z / 8);
		if (i === 65 && j === 100)
			return 1;
		if (i === 164 && j === 102)
			return 2;
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

var cmpSovereignty = ConstructComponent(SYSTEM_ENTITY, "Sovereignty");
global.InitAttributes = {
	"settings": {
		"Sovereignty": g_Regions
	}
};
cmpSovereignty.OnInitGame();
TS_ASSERT_EQUALS(cmpSovereignty.GetRegions().length, 2);

// Densira. (100, 200) is cell (12, 25). The native mock returns player 1.
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 100, "z": 200 }), 1);
// Adomé. (400, 200) is cell (50, 25).
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 400, "z": 200 }), 2);
// Unclaimed stays INVALID_PLAYER. It is not rewritten to Gaia.
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 600, "z": 200 }), INVALID_PLAYER);
TS_ASSERT_EQUALS(INVALID_PLAYER, -1);

// Esika (520, 800) is cell (65, 100): Densira. Avémé (1312, 820) is cell (164, 102): Adomé.
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 520, "z": 800 }), 1);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 1312, "z": 820 }), 2);

// Quantization. x=256 is on the shared polygon edge. The old ray cast gave it to
// the earlier region, player 1. x=263 is inside the later region. Both points are
// cell (32, 25), whose center is (260, 204), and the native owner of that cell is 2.
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 256, "z": 200 }), 2);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 263, "z": 200 }), 2);

// The adapter forwards the queried point. It does not sample the cell center itself.
TS_ASSERT_EQUALS(g_Calls[g_Calls.length - 2].x, 256);
TS_ASSERT_EQUALS(g_Calls[g_Calls.length - 1].x, 263);

// Polygon data is not an ownership authority. These regions contain (100, 200)
// for player 1, and the native mock is replaced with a constant player 2.
DeleteMock(SYSTEM_ENTITY, IID_SovereigntyManager);
AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, {
	"GetOwner": () => 2
});
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 100, "z": 200 }), 2);
cmpSovereignty.ReadRegions("not-an-array");
TS_ASSERT_EQUALS(cmpSovereignty.GetRegions().length, 0);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 100, "z": 200 }), 2);

DeleteMock(SYSTEM_ENTITY, IID_SovereigntyManager);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 100, "z": 200 }), INVALID_PLAYER);

AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, {
	"GetOwner": () => 1
});
const cmpRestored = SerializationCycle(cmpSovereignty);
TS_ASSERT_EQUALS(cmpRestored.GetSovereignOwner({ "x": 100, "z": 200 }), 1);
TS_ASSERT_EQUALS(cmpRestored.GetRegions().length, 0);

AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 3
});
cmpSovereignty.ReadRegions([{ "owner": 1, "points": [{ "x": 0, "z": 0 }, { "x": 1, "z": 0 }] }]);
TS_ASSERT_EQUALS(cmpSovereignty.GetRegions().length, 0);
cmpSovereignty.ReadRegions([{ "owner": 9, "points": g_Regions[0].points }]);
TS_ASSERT_EQUALS(cmpSovereignty.GetRegions().length, 0);
cmpSovereignty.ReadRegions(null);
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
TS_ASSERT_EQUALS(cmpSovereignty.GetRegions().length, 2);
// Storing the food-crisis rings does not paint ownership. The mock still answers player 1.
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 520, "z": 790 }), 1);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 1312, "z": 820 }), 1);
