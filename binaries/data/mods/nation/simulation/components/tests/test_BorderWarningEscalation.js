Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("interfaces/ForeignMilitaryPresence.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("interfaces/BorderWarningManager.js");
Engine.LoadComponentScript("BorderWarningManager.js");
Engine.LoadComponentScript("interfaces/BorderUltimatumManager.js");
Engine.LoadComponentScript("BorderUltimatumManager.js");
Engine.LoadComponentScript("interfaces/BorderWarningEscalation.js");
Engine.LoadComponentScript("BorderWarningEscalation.js");

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
const g_Issued = [];
const g_Warnings = [];

Engine.BroadcastMessage = function(type, message)
{
	if (type === MT_BorderWarningIssued)
	{
		g_Warnings.push(message);
		const cmpEscalation = Engine.QueryInterface(SYSTEM_ENTITY, IID_BorderWarningEscalation);
		if (cmpEscalation)
			cmpEscalation.OnGlobalBorderWarningIssued(message);
	}
	else if (type === MT_BorderUltimatumIssued)
		g_Issued.push(message);
};

function startWorld(presence)
{
	ResetState();
	g_Presence = presence;
	g_Issued.length = 0;
	g_Warnings.length = 0;
	AddMock(SYSTEM_ENTITY, IID_ForeignMilitaryPresence, {
		"HasForeignMilitaryPresence": (foreignPlayer, hostPlayer) =>
			!!g_Presence[foreignPlayer + ":" + hostPlayer]
	});
	return {
		"cmpTimer": ConstructComponent(SYSTEM_ENTITY, "Timer"),
		"cmpWarnings": ConstructComponent(SYSTEM_ENTITY, "BorderWarningManager"),
		"cmpUltimatums": ConstructComponent(SYSTEM_ENTITY, "BorderUltimatumManager"),
		"cmpEscalation": ConstructComponent(SYSTEM_ENTITY, "BorderWarningEscalation")
	};
}

function issueWarning(world, offender, defender)
{
	world.cmpWarnings.OnGlobalBorderIncidentStarted({
		"offender": offender,
		"defender": defender,
		"entity": 13
	});
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

// Case 1 and 2: one warning schedules one timer. A duplicate warning does not.
let world = startWorld({ "1:2": true });
issueWarning(world, 1, 2);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);
TS_ASSERT_EQUALS(scheduledDelay(world.cmpTimer), world.cmpEscalation.GracePeriod);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(1, 2), true);

world.cmpEscalation.OnGlobalBorderWarningIssued({ "issuer": 2, "recipient": 1 });
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(1, 2), true);

// An incursion while the cycle is still open does not issue another warning.
world.cmpWarnings.OnGlobalBorderIncursionContinued({
	"offender": 1,
	"defender": 2,
	"entity": 12
});
TS_ASSERT_EQUALS(g_Warnings.length, 1);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);

// Case 3: withdrawal before the deadline closes the warning cycle and does not escalate.
g_Presence["1:2"] = false;
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(world.cmpUltimatums.HasActiveUltimatum(1, 2), false);
TS_ASSERT_EQUALS(g_Issued.length, 0);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(1, 2), false);
TS_ASSERT_EQUALS(world.cmpWarnings.HasActiveWarning(1, 2), false);
TS_ASSERT_EQUALS(world.cmpWarnings.GetWarning(1, 2).active, false);
TS_ASSERT_EQUALS(world.cmpWarnings.IsWarningCompliedWith(1, 2), false);

// A continued incursion while that cycle was still open would not have issued again.
// After it closed, one later incursion opens a new cycle. Another does not.
world.cmpWarnings = SerializationCycle(world.cmpWarnings);
world.cmpEscalation = SerializationCycle(world.cmpEscalation);
world.cmpTimer = SerializationCycle(world.cmpTimer);
TS_ASSERT_EQUALS(world.cmpWarnings.GetWarning(1, 2).active, false);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 0);

g_Presence["1:2"] = true;
world.cmpWarnings.OnGlobalBorderIncursionContinued({
	"offender": 1,
	"defender": 2,
	"entity": 13
});
TS_ASSERT_EQUALS(world.cmpWarnings.HasActiveWarning(1, 2), true);
TS_ASSERT_EQUALS(g_Warnings.length, 2);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(1, 2), true);

world.cmpWarnings.OnGlobalBorderIncursionContinued({
	"offender": 1,
	"defender": 2,
	"entity": 14
});
TS_ASSERT_EQUALS(g_Warnings.length, 2);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);

// Case 4: troops still inside when the deadline expires.
world = startWorld({ "1:2": true });
issueWarning(world, 1, 2);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(world.cmpWarnings.IsWarningCompliedWith(1, 2), false);
TS_ASSERT_EQUALS(world.cmpUltimatums.HasActiveUltimatum(1, 2), true);
TS_ASSERT_EQUALS(g_Issued.length, 1);
TS_ASSERT_EQUALS(g_Issued[0].issuer, 2);
TS_ASSERT_EQUALS(g_Issued[0].recipient, 1);
const ultimatumCopy = world.cmpUltimatums.GetUltimatum(1, 2);
ultimatumCopy.active = false;
TS_ASSERT_EQUALS(world.cmpUltimatums.HasActiveUltimatum(1, 2), true);

// Case 5: a second callback does not open another ultimatum.
world.cmpEscalation.DeadlineReached({ "offender": 1, "defender": 2 });
TS_ASSERT_EQUALS(g_Issued.length, 1);
TS_ASSERT_EQUALS(world.cmpUltimatums.HasActiveUltimatum(1, 2), true);

// Withdrawal after the ultimatum leaves the ultimatum recorded.
g_Presence["1:2"] = false;
TS_ASSERT_EQUALS(world.cmpWarnings.IsWarningCompliedWith(1, 2), true);
TS_ASSERT_EQUALS(world.cmpUltimatums.HasActiveUltimatum(1, 2), true);
TS_ASSERT_EQUALS(world.cmpWarnings.HasActiveWarning(1, 2), true);

// Case 6: the reverse pair has its own timer and its own ultimatum.
world = startWorld({ "1:2": true, "2:1": true });
issueWarning(world, 1, 2);
issueWarning(world, 2, 1);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 2);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(1, 2), true);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(2, 1), true);
advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(world.cmpUltimatums.HasActiveUltimatum(1, 2), true);
TS_ASSERT_EQUALS(world.cmpUltimatums.HasActiveUltimatum(2, 1), true);
TS_ASSERT_EQUALS(g_Issued.length, 2);
TS_ASSERT_EQUALS(g_Issued[0].issuer, 2);
TS_ASSERT_EQUALS(g_Issued[0].recipient, 1);
TS_ASSERT_EQUALS(g_Issued[1].issuer, 1);
TS_ASSERT_EQUALS(g_Issued[1].recipient, 2);

// Case 7: none of this calls Diplomacy.
TS_ASSERT_EQUALS(g_DiplomacyCalls.length, 0);

// Serialization: a pending deadline survives save/load and still fires once.
world = startWorld({ "1:2": true });
issueWarning(world, 1, 2);
advance(world.cmpTimer, 4);
TS_ASSERT_EQUALS(world.cmpUltimatums.HasActiveUltimatum(1, 2), false);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(1, 2), true);

world.cmpTimer = SerializationCycle(world.cmpTimer);
world.cmpWarnings = SerializationCycle(world.cmpWarnings);
world.cmpUltimatums = SerializationCycle(world.cmpUltimatums);
world.cmpEscalation = SerializationCycle(world.cmpEscalation);

TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(1, 2), true);
world.cmpEscalation.OnGlobalBorderWarningIssued({ "issuer": 2, "recipient": 1 });
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 1);

advance(world.cmpTimer, 6);
TS_ASSERT_EQUALS(world.cmpUltimatums.HasActiveUltimatum(1, 2), true);
TS_ASSERT_EQUALS(g_Issued.length, 1);
TS_ASSERT_EQUALS(g_Issued[0].issuer, 2);
TS_ASSERT_EQUALS(g_Issued[0].recipient, 1);
TS_ASSERT_EQUALS(world.cmpEscalation.HasPendingDeadline(1, 2), false);
TS_ASSERT_EQUALS(g_DiplomacyCalls.length, 0);
