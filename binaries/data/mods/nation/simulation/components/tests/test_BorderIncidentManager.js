Engine.LoadComponentScript("interfaces/BorderIncidentManager.js");
Engine.LoadComponentScript("BorderIncidentManager.js");

let g_Stance = "neutral";
AddMock(SYSTEM_ENTITY, IID_Diplomacy, {
	"IsNeutral": () => g_Stance === "neutral",
	"IsEnemy": () => g_Stance === "enemy",
	"SetDiplomacy": () => { g_Stance = "changed"; }
});

const g_Started = [];
Engine.BroadcastMessage = function(type, message)
{
	if (type === MT_BorderIncidentStarted)
		g_Started.push(message);
};

var cmpIncidents = ConstructComponent(SYSTEM_ENTITY, "BorderIncidentManager");

function entry(entity, entityOwner, from, to, authorized)
{
	cmpIncidents.OnGlobalSovereignEntryClassified({
		"entity": entity,
		"entityOwner": entityOwner,
		"from": from,
		"to": to,
		"authorized": authorized
	});
}

entry(13, 1, 1, 2, false);
TS_ASSERT_EQUALS(cmpIncidents.HasActiveIncident(1, 2), true);
TS_ASSERT_EQUALS(cmpIncidents.HasActiveIncident(2, 1), false);
const first = cmpIncidents.GetIncident(1, 2);
TS_ASSERT_EQUALS(first.offender, 1);
TS_ASSERT_EQUALS(first.defender, 2);
TS_ASSERT_EQUALS(first.active, true);
TS_ASSERT_EQUALS(first.incursions, 1);
TS_ASSERT_EQUALS(g_Started.length, 1);
TS_ASSERT_EQUALS(g_Started[0].offender, 1);
TS_ASSERT_EQUALS(g_Started[0].defender, 2);
TS_ASSERT_EQUALS(g_Started[0].entity, 13);
first.incursions = 99;
TS_ASSERT_EQUALS(cmpIncidents.GetIncident(1, 2).incursions, 1);

entry(12, 1, 1, 2, false);
TS_ASSERT_EQUALS(cmpIncidents.GetIncident(1, 2).incursions, 2);
TS_ASSERT_EQUALS(g_Started.length, 1);
TS_ASSERT_EQUALS(cmpIncidents.GetActiveIncidents().length, 1);

entry(13, 1, 1, 2, true);
TS_ASSERT_EQUALS(cmpIncidents.GetIncident(1, 2).incursions, 2);
TS_ASSERT_EQUALS(g_Started.length, 1);

entry(21, 2, 2, 1, false);
TS_ASSERT_EQUALS(cmpIncidents.HasActiveIncident(2, 1), true);
TS_ASSERT_EQUALS(cmpIncidents.GetIncident(2, 1).offender, 2);
TS_ASSERT_EQUALS(cmpIncidents.GetIncident(2, 1).defender, 1);
TS_ASSERT_EQUALS(cmpIncidents.GetIncident(2, 1).incursions, 1);
TS_ASSERT_EQUALS(cmpIncidents.GetIncident(1, 2).incursions, 2);
TS_ASSERT_EQUALS(g_Started.length, 2);
TS_ASSERT_EQUALS(g_Started[1].entity, 21);

entry(13, 1, 1, INVALID_PLAYER, false);
TS_ASSERT_EQUALS(cmpIncidents.GetActiveIncidents().length, 2);
TS_ASSERT_EQUALS(g_Started.length, 2);

entry(13, 1, 2, 1, false);
TS_ASSERT_EQUALS(cmpIncidents.GetIncident(1, 1), null);
TS_ASSERT_EQUALS(cmpIncidents.HasActiveIncident(1, 1), false);
TS_ASSERT_EQUALS(g_Started.length, 2);

entry(13, 1, INVALID_PLAYER, 1, true);
TS_ASSERT_EQUALS(cmpIncidents.GetIncident(1, 2).incursions, 2);

TS_ASSERT_EQUALS(g_Stance, "neutral");

const cmpRestored = SerializationCycle(cmpIncidents);
TS_ASSERT_EQUALS(cmpRestored.HasActiveIncident(1, 2), true);
TS_ASSERT_EQUALS(cmpRestored.GetIncident(1, 2).incursions, 2);
TS_ASSERT_EQUALS(cmpRestored.GetIncident(1, 2).offender, 1);
TS_ASSERT_EQUALS(cmpRestored.GetIncident(1, 2).defender, 2);
TS_ASSERT_EQUALS(cmpRestored.HasActiveIncident(2, 1), true);
TS_ASSERT_EQUALS(cmpRestored.GetIncident(2, 1).incursions, 1);
TS_ASSERT_EQUALS(g_Stance, "neutral");
