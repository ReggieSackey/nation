Engine.LoadComponentScript("interfaces/BorderWarningManager.js");
Engine.LoadComponentScript("BorderWarningManager.js");

let g_Stance = "neutral";
AddMock(SYSTEM_ENTITY, IID_Diplomacy, {
	"IsNeutral": () => g_Stance === "neutral",
	"IsAlly": () => g_Stance === "ally",
	"IsEnemy": () => g_Stance === "enemy",
	"SetDiplomacy": () => { g_Stance = "changed"; },
	"SetEnemy": () => { g_Stance = "changed"; }
});

const g_Issued = [];
Engine.BroadcastMessage = function(type, message)
{
	if (type === MT_BorderWarningIssued)
		g_Issued.push(message);
};

var cmpWarnings = ConstructComponent(SYSTEM_ENTITY, "BorderWarningManager");

TS_ASSERT_EQUALS(cmpWarnings.HasActiveWarning(1, 2), false);
TS_ASSERT_EQUALS(cmpWarnings.GetWarning(1, 2), null);

function incidentStarted(offender, defender, entity)
{
	cmpWarnings.OnGlobalBorderIncidentStarted({
		"offender": offender,
		"defender": defender,
		"entity": entity
	});
}

incidentStarted(1, 2, 13);
TS_ASSERT_EQUALS(cmpWarnings.HasActiveWarning(1, 2), true);
TS_ASSERT_EQUALS(cmpWarnings.HasActiveWarning(2, 1), false);
const first = cmpWarnings.GetWarning(1, 2);
TS_ASSERT_EQUALS(first.offender, 1);
TS_ASSERT_EQUALS(first.defender, 2);
TS_ASSERT_EQUALS(first.active, true);
TS_ASSERT_EQUALS(g_Issued.length, 1);
TS_ASSERT_EQUALS(g_Issued[0].issuer, 2);
TS_ASSERT_EQUALS(g_Issued[0].recipient, 1);
first.active = false;
TS_ASSERT_EQUALS(cmpWarnings.GetWarning(1, 2).active, true);

incidentStarted(1, 2, 12);
TS_ASSERT_EQUALS(g_Issued.length, 1);
TS_ASSERT_EQUALS(cmpWarnings.HasActiveWarning(1, 2), true);

incidentStarted(2, 1, 21);
TS_ASSERT_EQUALS(cmpWarnings.HasActiveWarning(2, 1), true);
TS_ASSERT_EQUALS(cmpWarnings.GetWarning(2, 1).offender, 2);
TS_ASSERT_EQUALS(cmpWarnings.GetWarning(2, 1).defender, 1);
TS_ASSERT_EQUALS(g_Issued.length, 2);
TS_ASSERT_EQUALS(g_Issued[1].issuer, 1);
TS_ASSERT_EQUALS(g_Issued[1].recipient, 2);

TS_ASSERT_EQUALS(g_Stance, "neutral");

const cmpRestored = SerializationCycle(cmpWarnings);
TS_ASSERT_EQUALS(cmpRestored.HasActiveWarning(1, 2), true);
TS_ASSERT_EQUALS(cmpRestored.GetWarning(1, 2).offender, 1);
TS_ASSERT_EQUALS(cmpRestored.GetWarning(1, 2).defender, 2);
TS_ASSERT_EQUALS(cmpRestored.GetWarning(1, 2).active, true);
TS_ASSERT_EQUALS(cmpRestored.HasActiveWarning(2, 1), true);
TS_ASSERT_EQUALS(g_Stance, "neutral");
