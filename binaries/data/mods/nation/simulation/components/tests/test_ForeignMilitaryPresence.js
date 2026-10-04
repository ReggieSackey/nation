Engine.LoadComponentScript("interfaces/ForeignMilitaryPresence.js");
Engine.LoadComponentScript("interfaces/BorderWarningManager.js");
Engine.LoadComponentScript("ForeignMilitaryPresence.js");
Engine.LoadComponentScript("BorderWarningManager.js");

const g_Owners = {};
const g_Started = [];
const g_Ended = [];
Engine.BroadcastMessage = function(type, message)
{
	if (type === MT_ForeignMilitaryPresenceStarted)
		g_Started.push(message);
	else if (type === MT_ForeignMilitaryPresenceEnded)
		g_Ended.push(message);
};

AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
	"GetSovereignOwner": pos => pos.x <= 256 ? 1 : pos.x <= 512 ? 2 : 3
});

function own(entity, owner)
{
	g_Owners[entity] = owner;
	AddMock(entity, IID_UnitMotion, {});
	AddMock(entity, IID_Ownership, {
		"GetOwner": () => g_Owners[entity]
	});
}

var cmpPresence = ConstructComponent(SYSTEM_ENTITY, "ForeignMilitaryPresence");
var cmpWarnings = ConstructComponent(SYSTEM_ENTITY, "BorderWarningManager");

function cross(entity, owner, from, to)
{
	own(entity, owner);
	cmpPresence.OnGlobalSovereignBorderCrossed({
		"entity": entity,
		"from": from,
		"to": to
	});
}

TS_ASSERT_EQUALS(cmpPresence.HasForeignMilitaryPresence(1, 2), false);
TS_ASSERT_EQUALS(cmpPresence.GetForeignMilitaryPresenceCount(1, 2), 0);

cross(13, 1, 1, 2);
TS_ASSERT_EQUALS(cmpPresence.HasForeignMilitaryPresence(1, 2), true);
TS_ASSERT_EQUALS(cmpPresence.GetForeignMilitaryPresenceCount(1, 2), 1);
TS_ASSERT_EQUALS(g_Started.length, 1);
TS_ASSERT_EQUALS(g_Started[0].foreignPlayer, 1);
TS_ASSERT_EQUALS(g_Started[0].hostPlayer, 2);

cross(14, 1, 1, 2);
TS_ASSERT_EQUALS(cmpPresence.GetForeignMilitaryPresenceCount(1, 2), 2);
TS_ASSERT_EQUALS(g_Started.length, 1);
TS_ASSERT_EQUALS(cmpPresence.GetForeignMilitaryEntities(1, 2).length, 2);

// Movement inside Player 2 does not add the unit again.
cross(13, 1, 2, 2);
TS_ASSERT_EQUALS(cmpPresence.GetForeignMilitaryPresenceCount(1, 2), 2);
TS_ASSERT_EQUALS(g_Started.length, 1);
TS_ASSERT_EQUALS(g_Ended.length, 0);

const cmpRestored = SerializationCycle(cmpPresence);
TS_ASSERT_EQUALS(cmpRestored.HasForeignMilitaryPresence(1, 2), true);
TS_ASSERT_EQUALS(cmpRestored.GetForeignMilitaryPresenceCount(1, 2), 2);
cmpPresence = cmpRestored;

cross(14, 1, 2, 1);
TS_ASSERT_EQUALS(cmpPresence.GetForeignMilitaryPresenceCount(1, 2), 1);
TS_ASSERT_EQUALS(cmpPresence.HasForeignMilitaryPresence(1, 2), true);
TS_ASSERT_EQUALS(g_Ended.length, 0);

cross(13, 1, 2, 1);
TS_ASSERT_EQUALS(cmpPresence.HasForeignMilitaryPresence(1, 2), false);
TS_ASSERT_EQUALS(cmpPresence.GetForeignMilitaryPresenceCount(1, 2), 0);
TS_ASSERT_EQUALS(g_Ended.length, 1);
TS_ASSERT_EQUALS(g_Ended[0].foreignPlayer, 1);
TS_ASSERT_EQUALS(g_Ended[0].hostPlayer, 2);

cross(13, 1, 1, 2);
cross(14, 1, 1, 2);
cmpPresence.OnGlobalDestroy({ "entity": 14 });
TS_ASSERT_EQUALS(cmpPresence.GetForeignMilitaryPresenceCount(1, 2), 1);
TS_ASSERT_EQUALS(g_Ended.length, 1);
cmpPresence.OnGlobalDestroy({ "entity": 13 });
TS_ASSERT_EQUALS(cmpPresence.HasForeignMilitaryPresence(1, 2), false);
TS_ASSERT_EQUALS(g_Ended.length, 2);

// Leaving into unclaimed land, then into a third sovereign, is still one pair at a time.
cross(13, 1, 1, 2);
cross(13, 1, 2, INVALID_PLAYER);
TS_ASSERT_EQUALS(cmpPresence.HasForeignMilitaryPresence(1, 2), false);
cross(13, 1, INVALID_PLAYER, 3);
TS_ASSERT_EQUALS(cmpPresence.HasForeignMilitaryPresence(1, 3), true);
TS_ASSERT_EQUALS(cmpPresence.HasForeignMilitaryPresence(1, 2), false);

// Authorized entry is the same geographical fact. No incident is required.
cross(15, 1, 1, 2);
TS_ASSERT_EQUALS(cmpPresence.HasForeignMilitaryPresence(1, 2), true);
TS_ASSERT_EQUALS(cmpWarnings.HasActiveWarning(1, 2), false);

// Ownership passing to the host removes foreign presence.
own(16, 1);
AddMock(16, IID_Position, {
	"IsInWorld": () => true,
	"GetPosition2D": () => ({ "x": 400, "y": 200 })
});
cross(16, 1, 1, 2);
const beforeHostChange = cmpPresence.GetForeignMilitaryPresenceCount(1, 2);
cmpPresence.OnGlobalOwnershipChanged({ "entity": 16, "from": 1, "to": 2 });
TS_ASSERT_EQUALS(cmpPresence.GetForeignMilitaryPresenceCount(1, 2), beforeHostChange - 1);
TS_ASSERT_EQUALS(cmpPresence.HasForeignMilitaryPresence(2, 2), false);

// Clear remaining units so the compliance pair starts empty.
cmpPresence.OnGlobalDestroy({ "entity": 13 });
cmpPresence.OnGlobalDestroy({ "entity": 15 });
TS_ASSERT_EQUALS(cmpPresence.GetForeignMilitaryPresenceCount(1, 2), 0);

cmpWarnings.OnGlobalBorderIncidentStarted({
	"offender": 1,
	"defender": 2,
	"entity": 13
});
cross(13, 1, 1, 2);
TS_ASSERT_EQUALS(cmpWarnings.HasActiveWarning(1, 2), true);
TS_ASSERT_EQUALS(cmpWarnings.IsWarningCompliedWith(1, 2), false);

cross(13, 1, 2, 1);
TS_ASSERT_EQUALS(cmpPresence.HasForeignMilitaryPresence(1, 2), false);
TS_ASSERT_EQUALS(cmpWarnings.IsWarningCompliedWith(1, 2), true);
TS_ASSERT_EQUALS(cmpWarnings.HasActiveWarning(1, 2), true);
TS_ASSERT_EQUALS(cmpWarnings.IsWarningCompliedWith(2, 1), false);
