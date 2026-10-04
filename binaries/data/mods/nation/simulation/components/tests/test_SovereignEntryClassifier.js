Engine.LoadComponentScript("interfaces/DiplomaticAccess.js");
Engine.LoadComponentScript("interfaces/SovereignEntryClassifier.js");
Engine.LoadComponentScript("SovereignEntryClassifier.js");

let g_Military = false;
let g_Stance = "enemy";

AddMock(SYSTEM_ENTITY, IID_DiplomaticAccess, {
	"HasMilitaryAccess": (fromPlayer, toPlayer) => g_Military && fromPlayer === 1 && toPlayer === 2
});
AddMock(SYSTEM_ENTITY, IID_Diplomacy, {
	"IsAlly": () => g_Stance === "ally",
	"IsNeutral": () => g_Stance === "neutral",
	"IsEnemy": () => g_Stance === "enemy"
});

const UNIT = 13;
let g_Owner = 1;
AddMock(UNIT, IID_Ownership, {
	"GetOwner": () => g_Owner
});

const g_Classified = [];
Engine.PostMessage = function(entity, type, message)
{
	if (type === MT_SovereignEntryClassified)
		g_Classified.push(message);
};

var cmpClassifier = ConstructComponent(SYSTEM_ENTITY, "SovereignEntryClassifier");

function cross(from, to)
{
	cmpClassifier.OnGlobalSovereignBorderCrossed({
		"entity": UNIT,
		"from": from,
		"to": to
	});
}

g_Military = false;
g_Stance = "ally";
g_Owner = 1;
cross(1, 2);
TS_ASSERT_EQUALS(g_Classified.length, 1);
TS_ASSERT_EQUALS(g_Classified[0].entity, UNIT);
TS_ASSERT_EQUALS(g_Classified[0].entityOwner, 1);
TS_ASSERT_EQUALS(g_Classified[0].from, 1);
TS_ASSERT_EQUALS(g_Classified[0].to, 2);
TS_ASSERT_EQUALS(g_Classified[0].authorized, false);

g_Military = true;
cross(1, 2);
TS_ASSERT_EQUALS(g_Classified.length, 2);
TS_ASSERT_EQUALS(g_Classified[1].authorized, true);
TS_ASSERT_EQUALS(g_Classified[1].entityOwner, 1);

g_Military = false;
g_Owner = 2;
cross(2, 1);
TS_ASSERT_EQUALS(g_Classified.length, 3);
TS_ASSERT_EQUALS(g_Classified[2].entityOwner, 2);
TS_ASSERT_EQUALS(g_Classified[2].from, 2);
TS_ASSERT_EQUALS(g_Classified[2].to, 1);
TS_ASSERT_EQUALS(g_Classified[2].authorized, false);

g_Owner = 2;
cross(-1, 2);
TS_ASSERT_EQUALS(g_Classified.length, 4);
TS_ASSERT_EQUALS(g_Classified[3].authorized, true);
TS_ASSERT_EQUALS(g_Classified[3].entityOwner, 2);
TS_ASSERT_EQUALS(g_Classified[3].to, 2);

g_Owner = 1;
cross(1, INVALID_PLAYER);
TS_ASSERT_EQUALS(g_Classified.length, 4);

cross(INVALID_PLAYER, 2);
TS_ASSERT_EQUALS(g_Classified.length, 5);
TS_ASSERT_EQUALS(g_Classified[4].from, INVALID_PLAYER);
TS_ASSERT_EQUALS(g_Classified[4].to, 2);
TS_ASSERT_EQUALS(g_Classified[4].entityOwner, 1);
TS_ASSERT_EQUALS(g_Classified[4].authorized, false);
