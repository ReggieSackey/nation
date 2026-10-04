Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("interfaces/ForeignMilitaryPresence.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("interfaces/BorderUltimatumManager.js");
Engine.LoadComponentScript("BorderUltimatumManager.js");
Engine.LoadComponentScript("interfaces/BorderCrisisManager.js");
Engine.LoadComponentScript("BorderCrisisManager.js");
Engine.LoadComponentScript("interfaces/BorderUltimatumEscalation.js");
Engine.LoadComponentScript("BorderUltimatumEscalation.js");

const g_DiplomacyCalls = [];
QueryPlayerIDInterface = function(player, iid)
{
	g_DiplomacyCalls.push([player, iid]);
	return {
		"SetEnemy": () => g_DiplomacyCalls.push("SetEnemy"),
		"SetDiplomacy": () => g_DiplomacyCalls.push("SetDiplomacy"),
		"SetNeutral": () => g_DiplomacyCalls.push("SetNeutral"),
		"SetAlly": () => g_DiplomacyCalls.push("SetAlly")
	};
};

let g_Presence = {};
const g_Escalated = [];

Engine.BroadcastMessage = function(type, message)
{
	if (type === MT_BorderUltimatumIssued)
	{
		const cmpEscalation = Engine.QueryInterface(SYSTEM_ENTITY, IID_BorderUltimatumEscalation);
		if (cmpEscalation)
			cmpEscalation.OnGlobalBorderUltimatumIssued(message);
	}
	else if (type === MT_BorderCrisisEscalated)
		g_Escalated.push(message);
};

function startWorld(presence)
{
	ResetState();
	g_Presence = presence;
	g_Escalated.length = 0;
	AddMock(SYSTEM_ENTITY, IID_ForeignMilitaryPresence, {
		"HasForeignMilitaryPresence": (foreignPlayer, hostPlayer) =>
			!!g_Presence[foreignPlayer + ":" + hostPlayer]
	});
	return {
		"cmpTimer": ConstructComponent(SYSTEM_ENTITY, "Timer"),
		"cmpUltimatums": ConstructComponent(SYSTEM_ENTITY, "BorderUltimatumManager"),
		"cmpCrises": ConstructComponent(SYSTEM_ENTITY, "BorderCrisisManager"),
		"cmpEscalation": ConstructComponent(SYSTEM_ENTITY, "BorderUltimatumEscalation")
	};
}

function issueUltimatum(world, offender, defender)
{
	world.cmpUltimatums.IssueUltimatum(offender, defender);
}

function scheduledDelay(cmpTimer)
{
	let delay;
	cmpTimer.timers.forEach(timer =>
	{
		delay = timer.time - cmpTimer.GetTime();
	});
	return delay;
}

function advance(cmpTimer, seconds)
{
	cmpTimer.OnUpdate({ "turnLength": seconds });
}

// Case 1 and 2: one ultimatum schedules one timer. A duplicate notification does not.
let world = startWorld({ "1:2": true });
issueUltimatum(world, 1, 2);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);
TS_ASSERT_EQUALS(scheduledDelay(world.cmpTimer), world.cmpEscalation.GracePeriod);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(1, 2), true);

world.cmpEscalation.OnGlobalBorderUltimatumIssued({ "issuer": 2, "recipient": 1 });
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(1, 2), true);

// Case 3: withdrawal before the ultimatum deadline. No crisis. The ultimatum stays recorded.
g_Presence["1:2"] = false;
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(world.cmpCrises.HasEscalatedCrisis(1, 2), false);
TS_ASSERT_EQUALS(g_Escalated.length, 0);
TS_ASSERT_EQUALS(world.cmpUltimatums.HasActiveUltimatum(1, 2), true);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(1, 2), false);

// Case 4: forces remain through the deadline.
world = startWorld({ "1:2": true });
issueUltimatum(world, 1, 2);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(world.cmpCrises.HasEscalatedCrisis(1, 2), true);
TS_ASSERT_EQUALS(g_Escalated.length, 1);
TS_ASSERT_EQUALS(g_Escalated[0].offender, 1);
TS_ASSERT_EQUALS(g_Escalated[0].defender, 2);
const crisisCopy = world.cmpCrises.GetCrisis(1, 2);
crisisCopy.active = false;
TS_ASSERT_EQUALS(world.cmpCrises.HasEscalatedCrisis(1, 2), true);
TS_ASSERT_EQUALS(world.cmpUltimatums.HasActiveUltimatum(1, 2), true);

// Case 5: a second callback does not open another crisis.
world.cmpEscalation.DeadlineReached({ "offender": 1, "defender": 2 });
TS_ASSERT_EQUALS(g_Escalated.length, 1);
TS_ASSERT_EQUALS(world.cmpCrises.HasEscalatedCrisis(1, 2), true);

// Case 7: withdrawal after escalation leaves the crisis recorded.
g_Presence["1:2"] = false;
TS_ASSERT_EQUALS(world.cmpCrises.HasEscalatedCrisis(1, 2), true);
TS_ASSERT_EQUALS(world.cmpUltimatums.HasActiveUltimatum(1, 2), true);

// Case 6: the reverse ultimatum has its own timer and its own crisis.
world = startWorld({ "1:2": true, "2:1": true });
issueUltimatum(world, 1, 2);
issueUltimatum(world, 2, 1);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 2);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(1, 2), true);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(2, 1), true);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(world.cmpCrises.HasEscalatedCrisis(1, 2), true);
TS_ASSERT_EQUALS(world.cmpCrises.HasEscalatedCrisis(2, 1), true);
TS_ASSERT_EQUALS(g_Escalated.length, 2);
TS_ASSERT_EQUALS(g_Escalated[0].offender, 1);
TS_ASSERT_EQUALS(g_Escalated[0].defender, 2);
TS_ASSERT_EQUALS(g_Escalated[1].offender, 2);
TS_ASSERT_EQUALS(g_Escalated[1].defender, 1);

// Diplomacy is not consulted.
TS_ASSERT_EQUALS(g_DiplomacyCalls.length, 0);

// Serialization: six seconds remain, then the restored timer fires once.
world = startWorld({ "1:2": true });
issueUltimatum(world, 1, 2);
advance(world.cmpTimer, 4);
TS_ASSERT_EQUALS(world.cmpCrises.HasEscalatedCrisis(1, 2), false);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(1, 2), true);

world.cmpTimer = SerializationCycle(world.cmpTimer);
world.cmpUltimatums = SerializationCycle(world.cmpUltimatums);
world.cmpCrises = SerializationCycle(world.cmpCrises);
world.cmpEscalation = SerializationCycle(world.cmpEscalation);

TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(1, 2), true);
world.cmpEscalation.OnGlobalBorderUltimatumIssued({ "issuer": 2, "recipient": 1 });
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);

advance(world.cmpTimer, 6);
TS_ASSERT_EQUALS(world.cmpCrises.HasEscalatedCrisis(1, 2), true);
TS_ASSERT_EQUALS(g_Escalated.length, 1);
TS_ASSERT_EQUALS(g_Escalated[0].offender, 1);
TS_ASSERT_EQUALS(g_Escalated[0].defender, 2);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(1, 2), false);
TS_ASSERT_EQUALS(g_DiplomacyCalls.length, 0);
