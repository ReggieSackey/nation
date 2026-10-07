// The generic "sovereign" placement token on the Nation BuildRestrictions
// override, plus legacy token compatibility.

global.markForTranslation = (t) => t;
global.markForTranslationWithContext = (c, t) => t;
global.markForPluralTranslation = (s, p, n) => n === 1 ? s : p;
global.ApplyValueModificationsToEntity = (value, mod, entity) => mod;
global.removeFiltersFromTemplateName = (t) => t;
global.QueryPlayerIDInterface = (player, iid) =>
	iid === IID_Player ? g_PlayerMock :
	iid === IID_Diplomacy ? g_DiplomacyMock : null;
global.QueryOwnerInterface = function(ent, iid)
{
	const cmpOwnership = Engine.QueryInterface(ent, IID_Ownership);
	if (!cmpOwnership)
		return null;
	return QueryPlayerIDInterface(cmpOwnership.GetOwner(), iid);
};
const g_PlayerMock = {
	"IsAI": () => true,
	"GetPlayerID": () => 1
};
const g_DiplomacyMock = {
	"IsExclusiveMutualAlly": () => false
};

Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("Sovereignty.js");
Engine.LoadComponentScript("BuildRestrictions.js");

Engine.RegisterInterface("TerritoryManager");
Engine.RegisterInterface("TechnologyManager");

AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 4
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

// The native 8m grid behind the JS adapter. Cell centers at x=4..252 are
// player 1; x=260..508 are player 2; beyond is unclaimed.
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

const cmpSovereignty = ConstructComponent(SYSTEM_ENTITY, "Sovereignty");
global.InitAttributes = {
	"settings": {
		"Sovereignty": g_Regions
	}
};
cmpSovereignty.OnInitGame();

// Territory state per coordinate. Default 0 (peacetime).
const g_Territory = {};
AddMock(SYSTEM_ENTITY, IID_TerritoryManager, {
	"GetOwner": (x, z) => g_Territory[x + "," + z] || 0,
	"IsTerritoryBlinking": () => false
});
AddMock(SYSTEM_ENTITY, IID_TemplateManager, {
	"GetCurrentTemplateName": () => "structures/nation/test",
	"GetTemplate": () => ({})
});

function MockEntity(id, x, z)
{
	AddMock(id, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": x, "y": z })
	});
	AddMock(id, IID_Ownership, {
		"GetOwner": () => 1
	});
	AddMock(id, IID_Player, {
		"IsAI": () => true
	});
	AddMock(id, IID_Identity, {
		"GetGenericName": () => "Test Building"
	});
	AddMock(id, IID_Obstruction, {
		"CheckFoundation": () => "success"
	});
	return id;
}

function MakeRestrictions(id, territory)
{
	return ConstructComponent(id, "BuildRestrictions", {
		"PlacementType": "land",
		"Territory": territory,
		"Category": "Structure"
	});
}

const P1_LAND = 1;
const P2_LAND = 2;
const UNCLAIMED = 3;
MockEntity(P1_LAND, 96, 230);
MockEntity(P2_LAND, 400, 300);
MockEntity(UNCLAIMED, 900, 900);

const sovereign = MakeRestrictions(P1_LAND, "sovereign");
const legacyOwn = MakeRestrictions(P2_LAND, "own");
const legacyNeutral = MakeRestrictions(UNCLAIMED, "neutral");
const legacyEnemy = MakeRestrictions(P1_LAND, "enemy");

// ---------------------------------------------------------------
// The sovereign token.
// ---------------------------------------------------------------

// 1. Sovereign own / territory 0 -> allowed (normal peacetime home land).
TS_ASSERT(sovereign.CheckPlacement().success);

// 2. Sovereign own / territory own -> allowed.
g_Territory["96,230"] = 1;
TS_ASSERT(sovereign.CheckPlacement().success);

// 5. Sovereign own / hostile territory -> rejected.
g_Territory["96,230"] = 2;
TS_ASSERT(!sovereign.CheckPlacement().success);
g_Territory["96,230"] = 3;
TS_ASSERT(!sovereign.CheckPlacement().success);
g_Territory["96,230"] = 0;

// A different builder: player 2 in player 1 land is rejected for the same
// entity owner. IsInSovereignLand is checked directly with each player id.
TS_ASSERT(sovereign.IsInSovereignLand(1));
TS_ASSERT(!sovereign.IsInSovereignLand(2));
TS_ASSERT(!sovereign.IsInSovereignLand(0));

// 3. Foreign sovereignty / territory 0 -> rejected.
const inAdome = MakeRestrictions(P2_LAND, "sovereign");
AddMock(P2_LAND, IID_Ownership, {
	"GetOwner": () => 1
});
TS_ASSERT(!inAdome.CheckPlacement().success);
// The Adoméan builder in the same spot is allowed.
AddMock(P2_LAND, IID_Player, {
	"IsAI": () => true
});
let adomeRestrictions = inAdome;
TS_ASSERT(adomeRestrictions.IsInSovereignLand(1) === false);
TS_ASSERT(adomeRestrictions.IsInSovereignLand(2) === true);
// Restoring owner for later legacy checks.
AddMock(P2_LAND, IID_Ownership, {
	"GetOwner": () => 1
});

// 4. Unclaimed sovereignty / territory 0 -> rejected.
AddMock(UNCLAIMED, IID_Ownership, {
	"GetOwner": () => 1
});
const unclaimed = MakeRestrictions(UNCLAIMED, "sovereign");
TS_ASSERT(!unclaimed.CheckPlacement().success);
TS_ASSERT(!unclaimed.IsInSovereignLand(1));
TS_ASSERT(!unclaimed.IsInSovereignLand(0));

// 6. Foreign sovereignty / own territory -> rejected: player 1 holds explicit
// territory inside player 2 sovereignty; the sovereign token still fails.
g_Territory["400,300"] = 1;
AddMock(P2_LAND, IID_Ownership, {
	"GetOwner": () => 2
});
const occupiedAdome = MakeRestrictions(P2_LAND, "sovereign");
TS_ASSERT(!occupiedAdome.CheckPlacement().success);
g_Territory["400,300"] = 0;
AddMock(P2_LAND, IID_Ownership, {
	"GetOwner": () => 1
});

// 7. Gaia can never satisfy sovereign.
TS_ASSERT(!sovereign.IsInSovereignLand(0));
TS_ASSERT(!unclaimed.IsInSovereignLand(0));

// 10. No-sovereignty map: without the Sovereignty interface the token fails
// rather than treating territory 0 as homeland.
DeleteMock(SYSTEM_ENTITY, IID_SovereigntyManager);
const noSovereignty = sovereign;
TS_ASSERT(!noSovereignty.IsInSovereignLand(1));

// ---------------------------------------------------------------
// Legacy tokens unchanged.
// ---------------------------------------------------------------

// "own" on territory 0 fails exactly as upstream (0 is neutral there).
TS_ASSERT(!legacyOwn.CheckPlacement().success);
// "own" on explicit own territory passes.
g_Territory["400,300"] = 1;
TS_ASSERT(legacyOwn.CheckPlacement().success);
g_Territory["400,300"] = 0;

// "neutral" on territory 0 passes.
TS_ASSERT(legacyNeutral.CheckPlacement().success);

// "enemy" on own territory fails; on enemy territory passes.
TS_ASSERT(!legacyEnemy.CheckPlacement().success);
g_Territory["96,230"] = 2;
TS_ASSERT(legacyEnemy.CheckPlacement().success);
g_Territory["96,230"] = 0;

// Restore the sovereignty interface for any later suites in this process.
AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, {
	"GetOwner": (x, z) =>
	{
		const i = Math.floor(x / 8);
		if (i < 0)
			return INVALID_PLAYER;
		if (i < 32)
			return 1;
		if (i < 64)
			return 2;
		return INVALID_PLAYER;
	}
});
