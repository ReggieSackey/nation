Engine.RegisterInterface("Diplomacy");
Engine.LoadComponentScript("interfaces/TradeAccess.js");
Engine.LoadComponentScript("interfaces/DiplomaticAccess.js");
Engine.LoadComponentScript("TradeAccess.js");
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

var cmpTrade = ConstructComponent(SYSTEM_ENTITY, "TradeAccess");
var cmpMilitary = ConstructComponent(SYSTEM_ENTITY, "DiplomaticAccess");

TS_ASSERT_EQUALS(cmpTrade.CanTrade(1, 2), false);

global.InitAttributes = {
	"settings": {
		"TradeAccess": [
			{ "from": 1, "to": 2, "trade": true }
		],
		"MilitaryAccess": [
			{ "from": 1, "to": 2, "military": true },
			{ "from": 2, "to": 1, "military": true }
		]
	}
};
cmpTrade.OnInitGame();
cmpMilitary.OnInitGame();
TS_ASSERT_EQUALS(cmpTrade.CanTrade(1, 2), true);
TS_ASSERT_EQUALS(cmpTrade.CanTrade(2, 1), false);
TS_ASSERT_EQUALS(cmpMilitary.HasMilitaryAccess(1, 2), true);
TS_ASSERT_EQUALS(cmpMilitary.HasMilitaryAccess(2, 1), true);
// Military access does not grant trade, and the reverse grant is not implied.
TS_ASSERT_EQUALS(cmpTrade.CanTrade(2, 1), false);

g_Stance = "ally";
TS_ASSERT_EQUALS(cmpTrade.CanTrade(2, 1), false);
g_Stance = "enemy";
TS_ASSERT_EQUALS(cmpTrade.CanTrade(1, 2), true);

const cmpRestored = SerializationCycle(cmpTrade);
TS_ASSERT_EQUALS(cmpRestored.CanTrade(1, 2), true);
TS_ASSERT_EQUALS(cmpRestored.CanTrade(2, 1), false);

const reportError = error;
error = () => {};
TS_ASSERT_EQUALS(cmpTrade.ReadGrants("not-an-array"), false);
TS_ASSERT_EQUALS(cmpTrade.CanTrade(1, 2), false);
error = reportError;

cmpTrade.ReadGrants([{ "from": 1, "to": 2, "trade": false }]);
TS_ASSERT_EQUALS(cmpTrade.CanTrade(1, 2), false);
TS_ASSERT_EQUALS(cmpMilitary.HasMilitaryAccess(1, 2), true);
