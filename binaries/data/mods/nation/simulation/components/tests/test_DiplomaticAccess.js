Engine.LoadComponentScript("interfaces/DiplomaticAccess.js");
Engine.LoadComponentScript("DiplomaticAccess.js");

AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 3
});

let g_Stance = "neutral";
AddMock(SYSTEM_ENTITY, IID_Diplomacy, {
	"IsAlly": () => g_Stance === "ally",
	"IsNeutral": () => g_Stance === "neutral",
	"IsEnemy": () => g_Stance === "enemy"
});

var cmpAccess = ConstructComponent(SYSTEM_ENTITY, "DiplomaticAccess");

TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(1, 2), false);

global.InitAttributes = {
	"settings": {
		"MilitaryAccess": [
			{ "from": 1, "to": 2, "military": false },
			{ "from": 2, "to": 1, "military": false }
		]
	}
};
cmpAccess.OnInitGame();
TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(1, 2), false);
TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(2, 1), false);
// A neutral stance does not grant military access.
TS_ASSERT_EQUALS(g_Stance, "neutral");
TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(1, 2), false);

g_Stance = "ally";
TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(1, 2), false);
g_Stance = "enemy";
TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(1, 2), false);

global.InitAttributes.settings.MilitaryAccess = [
	{ "from": 1, "to": 2, "military": true }
];
cmpAccess.OnInitGame();
TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(1, 2), true);
TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(2, 1), false);
TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(1, 1), false);

const cmpRestored = SerializationCycle(cmpAccess);
TS_ASSERT_EQUALS(cmpRestored.HasMilitaryAccess(1, 2), true);
TS_ASSERT_EQUALS(cmpRestored.HasMilitaryAccess(2, 1), false);

cmpAccess.ReadGrants("not-an-array");
TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(1, 2), false);
cmpAccess.ReadGrants([{ "from": 1, "to": 2, "military": "yes" }]);
TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(1, 2), false);
cmpAccess.ReadGrants([{ "from": 1, "to": 9, "military": true }]);
TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(1, 2), false);
