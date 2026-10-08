Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("interfaces/EndGameManager.js");
Engine.LoadComponentScript("interfaces/NationEndgame.js");
Engine.RegisterInterface("Identity");
Engine.RegisterInterface("Ownership");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("NationEndgame.js");

let humans = [20];
let playerState = "active";
let defeated = 0;
let won = 0;
global.QueryPlayerIDInterface = id => id === 1 ? {
	"IsActive": () => playerState === "active",
	"Defeat": () => { ++defeated; playerState = "defeated"; },
	"Win": () => { ++won; playerState = "won"; }
} : null;

AddMock(SYSTEM_ENTITY, IID_Timer, {
	"SetInterval": () => 1
});
AddMock(SYSTEM_ENTITY, IID_EndGameManager, {
	"MarkPlayersAsWon": () => { ++won; playerState = "won"; }
});
AddMock(20, IID_Identity, { "HasClass": cls => cls === "Human" });
AddMock(20, IID_Ownership, { "GetOwner": () => 1 });
AddMock(30, IID_Identity, { "HasClass": cls => cls === "NationNationalProject" });
AddMock(30, IID_Ownership, { "GetOwner": () => 1 });
Engine.GetEntitiesWithInterface = iid => iid === IID_Identity ? humans.slice() : [];

const endgame = ConstructComponent(SYSTEM_ENTITY, "NationEndgame");
endgame.player = 1;
endgame.palace = 10;

endgame.ObserveHumans();
TS_ASSERT_EQUALS(defeated, 0);
endgame.OnGlobalOwnershipChanged({ "entity": 10, "from": 1, "to": 2 });
TS_ASSERT_EQUALS(defeated, 1);

const destroyed = ConstructComponent(SYSTEM_ENTITY, "NationEndgame");
destroyed.player = 1;
destroyed.palace = 10;
playerState = "active";
destroyed.OnGlobalDestroy({ "entity": 10 });
TS_ASSERT_EQUALS(defeated, 2);

const victory = ConstructComponent(SYSTEM_ENTITY, "NationEndgame");
victory.player = 1;
playerState = "active";
victory.OnGlobalConstructionFinished({ "newentity": 30 });
TS_ASSERT_EQUALS(won, 1);

const eliminated = ConstructComponent(SYSTEM_ENTITY, "NationEndgame");
eliminated.player = 1;
playerState = "active";
humans = [];
eliminated.ObserveHumans();
TS_ASSERT_EQUALS(defeated, 3);
