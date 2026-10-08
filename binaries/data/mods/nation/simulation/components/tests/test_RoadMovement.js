// Road corridor geometry, movement modifiers, infrastructure score, gathering
// modifier, and discontent relief for Milestone 2.

Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/NationSettlement.js");
Engine.LoadComponentScript("Sovereignty.js");
Engine.LoadComponentScript("NationSettlement.js");
Engine.LoadComponentScript("interfaces/RoadMovement.js");
Engine.LoadComponentScript("RoadMovement.js");
Engine.LoadComponentScript("interfaces/InfrastructureEffects.js");
Engine.LoadComponentScript("InfrastructureEffects.js");
Engine.LoadComponentScript("InfrastructureLink.js");
Engine.LoadComponentScript("SettlementDiscontent.js");

const g_Modifiers = [];
AddMock(SYSTEM_ENTITY, IID_ModifiersManager, {
	"AddModifier": (prop, id, modif, ent) => { g_Modifiers.push({ prop, id, modif, ent }); },
	"RemoveAllModifiers": (id, ent) => {
		for (let i = g_Modifiers.length - 1; i >= 0; --i)
			if (g_Modifiers[i].id === id && g_Modifiers[i].ent === ent)
				g_Modifiers.splice(i, 1);
	},
	"HasAnyModifier": (id, ent) => g_Modifiers.some(m => m.id === id && m.ent === ent)
});

AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 3,
	"GetPlayerByID": (id) => id + 100
});

AddMock(SYSTEM_ENTITY, IID_Timer, {
	"SetInterval": () => 1
});

const g_RouteConditions = {};
AddMock(SYSTEM_ENTITY, IID_TransportEfficiency, {
	"GetRouteCondition": (ent) => g_RouteConditions[ent] || 0
});

const road = ConstructComponent(SYSTEM_ENTITY, "RoadMovement");
const effects = ConstructComponent(SYSTEM_ENTITY, "InfrastructureEffects");
const discontent = ConstructComponent(SYSTEM_ENTITY, "SettlementDiscontent");

// ------------------------------------------------------------------
// Corridor geometry.
// ------------------------------------------------------------------

function Link(ax, az, bx, bz, condition, width = 10, bonus = 0.25)
{
	return { "ent": 1, ax, az, bx, bz, width, bonus, condition };
}

// 1. Outside the corridor.
TS_ASSERT_EQUALS(road.GetMultiplierAt(0, 500, [Link(0, 0, 100, 0, 100)]), 1);
// 2. Inside a 100-condition corridor.
TS_ASSERT_EQUALS(road.GetMultiplierAt(50, 2, [Link(0, 0, 100, 0, 100)]), 1.25);
// 3. Inside a 50-condition corridor.
TS_ASSERT_EQUALS(road.GetMultiplierAt(50, 2, [Link(0, 0, 100, 0, 50)]), 1.125);
// 4. Condition 0 gives no bonus.
TS_ASSERT_EQUALS(road.GetMultiplierAt(50, 2, [Link(0, 0, 100, 0, 0)]), 1);
// 8. Overlapping corridors: strongest wins, never stacked.
TS_ASSERT_EQUALS(road.GetMultiplierAt(
	50, 2, [Link(0, 0, 100, 0, 50), Link(0, 5, 100, 5, 100)]), 1.25);
TS_ASSERT_EQUALS(road.GetMultiplierAt(
	50, 2, [Link(0, 0, 100, 0, 100), Link(0, 5, 100, 5, 50)]), 1.25);
// 9. Rotated / arbitrary geometry: a diagonal segment.
const sqrt2over2 = Math.SQRT2 / 2;
TS_ASSERT_EQUALS(road.GetMultiplierAt(
	50 + 40 * sqrt2over2, 40 * sqrt2over2 + 1,
	[Link(50 - 40 * sqrt2over2, -40 * sqrt2over2, 50 + 40 * sqrt2over2, 40 * sqrt2over2, 100)]), 1.25);
// 10. Endpoint order does not matter.
TS_ASSERT_EQUALS(road.GetMultiplierAt(
	50, 2,
	[Link(100, 0, 0, 0, 100)]), 1.25);
// 11. A non-movement link (no width/bonus) gives nothing.
TS_ASSERT_EQUALS(road.GetMultiplierAt(50, 2, [Link(0, 0, 100, 0, 100, 0, 0)]), 1);
// 5. Missing links entirely.
TS_ASSERT_EQUALS(road.GetMultiplierAt(50, 2, []), 1);

// ------------------------------------------------------------------
// Modifier lifecycle: entering and leaving a corridor.
// ------------------------------------------------------------------

const g_Unit = 500;
function SetUnitPos(x, z)
{
	AddMock(g_Unit, IID_UnitMotion, {});
	AddMock(g_Unit, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": x, "y": z })
	});
}

const g_RoadEntities = [];
Engine.GetEntitiesWithInterface = (iid) =>
{
	if (iid === IID_UnitMotion)
		return [g_Unit];
	if (iid === IID_InfrastructureLink)
		return g_RoadEntities;
	return [];
};

function AddRoadLink(ent, ax, az, bx, bz, condition)
{
	AddMock(ent, IID_InfrastructureLink, {
		"IsUsable": () => true,
		"GetFrom": () => 30,
		"GetTo": () => 31,
		"GetMovementWidth": () => 10,
		"GetMovementSpeedBonus": () => 0.25,
		"GetCondition": () => condition
	});
	AddMock(30, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": ax, "y": az })
	});
	AddMock(31, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": bx, "y": bz })
	});
	g_RoadEntities.push(ent);
}

// 6. Entering the corridor gains the modifier.
SetUnitPos(500, 500);
AddRoadLink(40, 450, 450, 550, 550, 100);
road.UpdateAll();
TS_ASSERT_EQUALS(g_Modifiers.length, 1);
TS_ASSERT_EQUALS(g_Modifiers[0].prop, "UnitMotion/WalkSpeed");
TS_ASSERT_EQUALS(g_Modifiers[0].modif.multiply, 1.25);

// A second update with no change does not duplicate.
road.UpdateAll();
TS_ASSERT_EQUALS(g_Modifiers.length, 1);

// 7. Leaving the corridor removes the modifier.
SetUnitPos(700, 700);
road.UpdateAll();
TS_ASSERT_EQUALS(g_Modifiers.length, 0);

// Re-entering on a damaged road scales with condition.
SetUnitPos(500, 500);
DeleteMock(40, IID_InfrastructureLink);
g_RoadEntities.length = 0;
AddRoadLink(41, 450, 450, 550, 550, 50);
road.UpdateAll();
TS_ASSERT_EQUALS(g_Modifiers.length, 1);
TS_ASSERT_EQUALS(g_Modifiers[0].modif.multiply, 1.125);

// 12. A unit that leaves the world keeps no stale modifier.
AddMock(g_Unit, IID_Position, {
	"IsInWorld": () => false
});
road.UpdateAll();
TS_ASSERT_EQUALS(g_Modifiers.length, 0);
SetUnitPos(500, 500);
road.UpdateAll();
TS_ASSERT_EQUALS(g_Modifiers.length, 1);
// Reinitialization (Deserialize path) clears state and rebuilds cleanly.
road.Deserialize();
road.UpdateAll();
TS_ASSERT_EQUALS(g_Modifiers.length, 1);
TS_ASSERT_EQUALS(g_Modifiers[0].modif.multiply, 1.125);

// ------------------------------------------------------------------
// Infrastructure score and gathering modifier.
// ------------------------------------------------------------------

// Two non-capital settlements: populations 12000 (condition 0) and 8000 (condition 50).
// Score = (12000*0 + 8000*50) / 20000 = 20 -> multiplier 1.02.
const g_SettlementEnts = [60, 61];
AddMock(SYSTEM_ENTITY, IID_NationSettlementManager, {
	"GetSettlementsForSovereign": (playerId) => playerId === 1 ? g_SettlementEnts : []
});
function SettlementMock(ent, population, isCapital)
{
	AddMock(ent, IID_NationSettlement, {
		"GetPopulation": () => population,
		"GetIsCapital": () => isCapital,
		"GetStateIntegration": () => 50,
		"GetDiscontent": () => 0,
		"ChangeDiscontent": () => 0
	});
}
SettlementMock(60, 12000, false);
SettlementMock(61, 8000, false);
g_RouteConditions[60] = 0;
g_RouteConditions[61] = 50;

// 17. A disconnected settlement contributes condition 0.
// 18. Weighting uses demographic population.
TS_ASSERT_EQUALS(effects.GetInfrastructureScore(1), 20);

// 14. Score 0 -> 1.0.
TS_ASSERT_EQUALS(effects.GatherMultiplierForScore(0), 1);
TS_ASSERT_EQUALS(effects.GatherMultiplierForScore(effects.GetInfrastructureScore(2)), 1);
// 15. Score 50 -> 1.05.
TS_ASSERT_EQUALS(effects.GatherMultiplierForScore(50), 1.05);
// 16. Score 100 -> 1.10.
TS_ASSERT_EQUALS(effects.GatherMultiplierForScore(100), 1.10);

// 19/20. The player modifier applies, with the NationWorker restriction, and
// refreshes when the route changes.
g_Modifiers.length = 0;
effects.playerMultiplier = [];
effects.RefreshAll();
TS_ASSERT_EQUALS(g_Modifiers.length, 1);
TS_ASSERT_EQUALS(g_Modifiers[0].prop, "ResourceGatherer/BaseSpeed");
TS_ASSERT_UNEVAL_EQUALS(g_Modifiers[0].modif.affects, ["NationWorker"]);
TS_ASSERT_EQUALS(g_Modifiers[0].modif.multiply, 1.02);
TS_ASSERT_EQUALS(g_Modifiers[0].ent, 101);

// Repair the first settlement's road: score becomes (12000*50+8000*50)/20000 = 50 -> 1.05.
g_RouteConditions[60] = 50;
effects.RefreshAll();
TS_ASSERT_EQUALS(g_Modifiers.length, 1);
TS_ASSERT_EQUALS(g_Modifiers[0].modif.multiply, 1.05);

// ------------------------------------------------------------------
// Discontent relief.
// ------------------------------------------------------------------

// 21-25. Relief steps by condition.
g_RouteConditions[60] = 0;
TS_ASSERT_EQUALS(effects.GetDiscontentRelief(60), 0);
g_RouteConditions[60] = 25;
TS_ASSERT_EQUALS(effects.GetDiscontentRelief(60), 1);
g_RouteConditions[60] = 50;
TS_ASSERT_EQUALS(effects.GetDiscontentRelief(60), 2);
g_RouteConditions[60] = 75;
TS_ASSERT_EQUALS(effects.GetDiscontentRelief(60), 3);
g_RouteConditions[60] = 100;
TS_ASSERT_EQUALS(effects.GetDiscontentRelief(60), 4);
// The capital is always fully relieved.
SettlementMock(62, 1000, true);
TS_ASSERT_EQUALS(effects.GetDiscontentRelief(62), 4);

// 26. Relief never makes positive pressure negative.
g_RouteConditions[60] = 100;
// pressure at 10000 bps = 2, integration 50 -> penalty 1, relief 4 -> 0.
TS_ASSERT_EQUALS(discontent.DiscontentDelta(60, 10000, 50), 0);
// Tiny shortage rounds to zero and relief cannot make pressure negative.
TS_ASSERT_EQUALS(discontent.DiscontentDelta(60, 1000, 50), 0);
// 27. No-shortage recovery is unchanged.
TS_ASSERT_EQUALS(discontent.DiscontentDelta(60, 0, 50), -3);

// Broken roads give no relief: condition 0.
g_RouteConditions[60] = 0;
TS_ASSERT_EQUALS(discontent.DiscontentDelta(60, 10000, 50), 3);
