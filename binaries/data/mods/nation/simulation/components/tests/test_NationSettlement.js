Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("interfaces/NationSettlement.js");
Engine.LoadComponentScript("NationSettlement.js");
Engine.LoadComponentScript("interfaces/NationSettlementManager.js");
Engine.LoadComponentScript("NationSettlementManager.js");

const g_Errors = [];
error = function(message)
{
	g_Errors.push(String(message));
};

const g_Positions = {};
const g_Owners = {};

AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
	"GetSovereignOwner": pos => pos.x <= 256 ? 1 : pos.x <= 512 ? 2 : INVALID_PLAYER
});

function place(entity, x, z, owner)
{
	g_Positions[entity] = { "x": x, "y": z };
	g_Owners[entity] = owner;
	AddMock(entity, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => g_Positions[entity]
	});
	AddMock(entity, IID_Ownership, {
		"GetOwner": () => g_Owners[entity]
	});
}

function settlement(entity, name, population, integration, x, z, owner, isCapital)
{
	place(entity, x, z, owner);
	return ConstructComponent(entity, "NationSettlement", {
		"Name": name,
		"Population": population,
		"StateIntegration": integration,
		"IsCapital": isCapital ? "true" : "false"
	});
}

const capital = settlement(1, "Capital", "18000", "90", 100, 420, 1, true);
TS_ASSERT_EQUALS(capital.GetName(), "Capital");
TS_ASSERT_EQUALS(capital.GetPopulation(), 18000);
TS_ASSERT_EQUALS(capital.GetStateIntegration(), 90);
TS_ASSERT_EQUALS(capital.GetIsCapital(), true);
TS_ASSERT_EQUALS(capital.GetSovereignOwner(), 1);
TS_ASSERT_EQUALS(capital.GetDiscontent(), 0);
TS_ASSERT_EQUALS(capital.ChangeDiscontent(10), 10);
TS_ASSERT_EQUALS(capital.SetDiscontent(150), 100);
TS_ASSERT_EQUALS(capital.ChangeDiscontent(-1000), 0);
TS_ASSERT_EQUALS(capital.SetDiscontent(42), 42);

const restored = SerializationCycle(capital);
TS_ASSERT_EQUALS(restored.GetName(), "Capital");
TS_ASSERT_EQUALS(restored.GetPopulation(), 18000);
TS_ASSERT_EQUALS(restored.GetStateIntegration(), 90);
TS_ASSERT_EQUALS(restored.GetIsCapital(), true);
TS_ASSERT_EQUALS(restored.GetDiscontent(), 42);

g_Errors.length = 0;
const negative = settlement(11, "Bad", "-300", "10", 10, 10, 1);
TS_ASSERT_EQUALS(negative.GetPopulation(), 0);
TS_ASSERT_EQUALS(negative.GetName(), "");
TS_ASSERT(g_Errors.length > 0);

g_Errors.length = 0;
const low = settlement(12, "Bad", "10", "-1", 10, 10, 1);
TS_ASSERT_EQUALS(low.GetStateIntegration(), 0);
TS_ASSERT(g_Errors.length > 0);

g_Errors.length = 0;
const high = settlement(13, "Bad", "10", "170", 10, 10, 1);
TS_ASSERT_EQUALS(high.GetStateIntegration(), 0);
TS_ASSERT(g_Errors.length > 0);

g_Errors.length = 0;
const blank = settlement(14, "   ", "10", "10", 10, 10, 1);
TS_ASSERT_EQUALS(blank.GetName(), "");
TS_ASSERT(g_Errors.length > 0);

const edges = settlement(15, "Edge", "0", "100", 10, 10, 1, false);
TS_ASSERT_EQUALS(edges.GetPopulation(), 0);
TS_ASSERT_EQUALS(edges.GetStateIntegration(), 100);
TS_ASSERT_EQUALS(edges.ChangeStateIntegration(1), 100);
TS_ASSERT_EQUALS(edges.ChangeStateIntegration(-1), 99);
TS_ASSERT_EQUALS(edges.ChangeStateIntegration(-1000), 0);

g_Errors.length = 0;
const flagged = ConstructComponent(16, "NationSettlement", {
	"Name": "Bad",
	"Population": "10",
	"StateIntegration": "10",
	"IsCapital": "nope"
});
TS_ASSERT_EQUALS(flagged.GetName(), "");
TS_ASSERT(g_Errors.length > 0);

settlement(2, "Northern Village", "5000", "35", 80, 470, 1);
settlement(3, "Western Village", "3500", "20", 40, 220, 1);
settlement(4, "Southern Village", "7000", "55", 180, 60, 1);
// Engine owner is Player 1. The land is Player 2.
settlement(5, "Eastern Village", "4000", "40", 400, 400, 1);

Engine.GetEntitiesWithInterface = function(iid)
{
	if (iid !== IID_NationSettlement)
		return [];
	return [1, 2, 3, 4, 5];
};

const cmpManager = ConstructComponent(SYSTEM_ENTITY, "NationSettlementManager");
const nationIds = cmpManager.GetSettlementsForSovereign(1);
TS_ASSERT_EQUALS(nationIds.length, 4);
TS_ASSERT_EQUALS(nationIds.indexOf(5), -1);
TS_ASSERT_EQUALS(cmpManager.GetSettlementsForSovereign(2).length, 1);
TS_ASSERT_EQUALS(cmpManager.GetSettlementsForSovereign(2)[0], 5);
TS_ASSERT_EQUALS(Engine.QueryInterface(5, IID_NationSettlement).GetSovereignOwner(), 2);

nationIds.push(99);
TS_ASSERT_EQUALS(cmpManager.GetSettlementsForSovereign(1).length, 4);

TS_ASSERT_EQUALS(cmpManager.GetTotalPopulation(1), 33500);
const weighted = (18000 * 90 + 5000 * 35 + 3500 * 20 + 7000 * 55) / 33500;
TS_ASSERT_EQUALS(cmpManager.GetPopulationWeightedIntegration(1), weighted);
TS_ASSERT_EQUALS(cmpManager.GetTotalPopulation(2), 4000);
TS_ASSERT_EQUALS(cmpManager.GetPopulationWeightedIntegration(2), 40);

TS_ASSERT_EQUALS(cmpManager.GetTotalPopulation(9), 0);
TS_ASSERT_EQUALS(cmpManager.GetPopulationWeightedIntegration(9), null);
TS_ASSERT_EQUALS(cmpManager.GetSettlementsForSovereign(9).length, 0);
