Engine.LoadComponentScript("interfaces/AdomeStrategy.js");
Engine.LoadComponentScript("interfaces/RebellionManager.js");
Engine.RegisterInterface("Diplomacy");
Engine.RegisterInterface("Builder");
Engine.RegisterInterface("CommandQueue");
Engine.RegisterInterface("GuiInterface");
Engine.RegisterInterface("Health");
Engine.RegisterInterface("Identity");
Engine.RegisterInterface("NationSettlement");
Engine.RegisterInterface("MilitaryOccupation");
Engine.RegisterInterface("Ownership");
Engine.RegisterInterface("Position");
Engine.RegisterInterface("Timer");
Engine.RegisterInterface("TechnologyManager");
Engine.LoadComponentScript("AdomeStrategy.js");

let g_Entities = [];
let g_OwnStrength = 0;
let g_OpponentStrength = 0;
let g_Rebellions = 0;
let g_EnemyCalls = 0;
let g_Notifications = 0;
let g_Intervals = [];
let g_Commands = [];
let g_Enemy = { 1: false, 2: false };

Engine.GetEntitiesWithInterface = iid =>
	iid === IID_Identity ? g_Entities.slice() :
	iid === IID_NationSettlement ? [30, 31, 32, 34] :
	iid === IID_Builder ? [400] : [];

global.QueryPlayerIDInterface = function(player, iid)
{
	if (iid === IID_TechnologyManager && player === 2)
		return {
			"CanProduce": template => template === "structures/nation/foreign_administration"
		};
	if (iid !== IID_Diplomacy || (player !== 1 && player !== 2))
		return null;
	const other = player === 1 ? 2 : 1;
	return {
		"IsEnemy": id => id === other && g_Enemy[player],
		"SetEnemy": id => {
			TS_ASSERT_EQUALS(id, other);
			g_Enemy[player] = true;
			++g_EnemyCalls;
		}
	};
};

function addMilitary(firstId, owner, count)
{
	for (let i = 0; i < count; ++i)
	{
		const id = firstId + i;
		g_Entities.push(id);
		AddMock(id, IID_Identity, { "HasClass": cls => cls === "Soldier" });
		AddMock(id, IID_Ownership, { "GetOwner": () => owner });
		AddMock(id, IID_Health, { "GetHitpoints": () => 100 });
	}
}

function resetMilitary(own, opponent)
{
	g_Entities = [];
	g_OwnStrength = own;
	g_OpponentStrength = opponent;
	addMilitary(100, 2, own);
	addMilitary(200, 1, opponent);
}

function addSettlement(id, sovereign, capital, x, z)
{
	AddMock(id, IID_NationSettlement, {
		"GetSovereignOwner": () => sovereign,
		"GetIsCapital": () => capital
	});
	AddMock(id, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": x, "y": z })
	});
}

function start()
{
	ResetState();
	g_Rebellions = 0;
	g_EnemyCalls = 0;
	g_Notifications = 0;
	g_Intervals = [];
	g_Commands = [];
	g_Enemy = { 1: false, 2: false };
	AddMock(SYSTEM_ENTITY, IID_Timer, {
		"SetInterval": (entity, iid, method, first, repeat) => {
			g_Intervals.push({ "entity": entity, "iid": iid, "method": method, "first": first, "repeat": repeat });
			return 7;
		}
	});
	AddMock(SYSTEM_ENTITY, IID_RebellionManager, {
		"GetActiveCount": player => player === 1 ? g_Rebellions : 0
	});
	AddMock(SYSTEM_ENTITY, IID_GuiInterface, {
		"PushNotification": note => {
			TS_ASSERT_EQUALS(note.message, "Adomé has launched an invasion.");
			++g_Notifications;
		}
	});
	AddMock(SYSTEM_ENTITY, IID_CommandQueue, {
		"PushLocalCommand": (player, command) => g_Commands.push({ "player": player, "command": command })
	});
	addSettlement(30, 1, true, 100, 100);
	addSettlement(31, 1, false, 700, 500);
	addSettlement(32, 1, false, 900, 800);
	addSettlement(34, 2, true, 1200, 800);
	resetMilitary(0, 0);
	const strategy = ConstructComponent(SYSTEM_ENTITY, "AdomeStrategy");
	strategy.enabled = true;
	strategy.player = 2;
	strategy.opponent = 1;
	return strategy;
}

let strategy = start();
TS_ASSERT_EQUALS(strategy.IsInvasionEligible(9, 1, false), false);
TS_ASSERT_EQUALS(strategy.IsInvasionEligible(15, 10, false), true);
TS_ASSERT_EQUALS(strategy.IsInvasionEligible(14, 10, false), false);
TS_ASSERT_EQUALS(strategy.IsInvasionEligible(12, 10, true), true);
TS_ASSERT_EQUALS(strategy.IsInvasionEligible(10, 20, true), false);

TS_ASSERT_EQUALS(strategy.SelectTarget(), 32);
TS_ASSERT(strategy.SelectTarget() !== 34);

resetMilitary(12, 10);
strategy.elapsed = strategy.EarliestWarTime - strategy.EvaluationInterval;
strategy.Evaluate();
TS_ASSERT_EQUALS(strategy.mode, "preparing");
TS_ASSERT_EQUALS(strategy.declaredWar, false);
TS_ASSERT_EQUALS(g_EnemyCalls, 0);

g_Rebellions = 1;
strategy.Evaluate();
TS_ASSERT_EQUALS(strategy.declaredWar, true);
TS_ASSERT_EQUALS(strategy.mode, "war");
TS_ASSERT_EQUALS(g_Enemy[1], true);
TS_ASSERT_EQUALS(g_Enemy[2], true);
TS_ASSERT_EQUALS(g_EnemyCalls, 2);
TS_ASSERT_EQUALS(g_Notifications, 1);
strategy.Evaluate();
TS_ASSERT_EQUALS(g_EnemyCalls, 2);
TS_ASSERT_EQUALS(g_Notifications, 1);

const saved = strategy.Serialize();
const restored = ConstructComponent(SYSTEM_ENTITY, "AdomeStrategy");
restored.Deserialize(saved);
restored.OnDeserialized();
TS_ASSERT_EQUALS(restored.mode, "war");
TS_ASSERT_EQUALS(restored.target, 32);
TS_ASSERT_EQUALS(restored.declaredWar, true);
TS_ASSERT_EQUALS(g_Intervals.length, 1);
restored.Evaluate();
TS_ASSERT_EQUALS(g_EnemyCalls, 2);

strategy = start();
strategy.Start();
strategy.Start();
TS_ASSERT_EQUALS(g_Intervals.length, 1);
TS_ASSERT_EQUALS(g_Intervals[0].first, strategy.EvaluationInterval);
TS_ASSERT_EQUALS(g_Intervals[0].repeat, strategy.EvaluationInterval);
TS_ASSERT_EQUALS(strategy.evaluations, 0);
resetMilitary(15, 10);
strategy.elapsed = strategy.EarliestWarTime - strategy.EvaluationInterval;
strategy.Evaluate();
TS_ASSERT_EQUALS(strategy.evaluations, 1);
TS_ASSERT_EQUALS(strategy.declaredWar, true);

strategy = start();
resetMilitary(10, 10);
strategy.elapsed = strategy.EarliestWarTime - strategy.EvaluationInterval;
strategy.Evaluate();
TS_ASSERT_EQUALS(strategy.declaredWar, false);
TS_ASSERT_EQUALS(strategy.mode, "preparing");

strategy = start();
strategy.declaredWar = true;
strategy.mode = "war";
strategy.target = 32;
AddMock(SYSTEM_ENTITY, IID_MilitaryOccupation, {
	"IsOccupiedBy": (settlement, player) => settlement === 32 && player === 2
});
AddMock(400, IID_Builder, {
	"GetEntitiesList": () => ["structures/nation/foreign_administration"]
});
AddMock(400, IID_Ownership, { "GetOwner": () => 2 });
AddMock(400, IID_Health, { "GetHitpoints": () => 100 });
TS_ASSERT_EQUALS(strategy.TryEstablishAdministration(), true);
TS_ASSERT_EQUALS(strategy.administrationOrdered, true);
TS_ASSERT_EQUALS(strategy.administrationSettlement, 32);
TS_ASSERT_EQUALS(g_Commands.length, 1);
TS_ASSERT_EQUALS(g_Commands[0].player, 2);
TS_ASSERT_EQUALS(g_Commands[0].command.entities[0], 400);
TS_ASSERT_EQUALS(g_Commands[0].command.template, "structures/nation/foreign_administration");
TS_ASSERT_EQUALS(strategy.TryEstablishAdministration(), false);
TS_ASSERT_EQUALS(g_Commands.length, 1);
