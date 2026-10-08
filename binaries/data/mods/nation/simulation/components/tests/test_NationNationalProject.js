Engine.LoadComponentScript("interfaces/GovernmentFinance.js");
Engine.LoadComponentScript("interfaces/NationSettlementManager.js");
Engine.LoadComponentScript("interfaces/TechnologyManager.js");

let phaseReady = false;
let people = 33000;
let treasury = 1500000;
let foundations = 0;
let constructionSucceeds = true;
global.QueryPlayerIDInterface = (player, iid) =>
	iid === IID_TechnologyManager ? { "CanProduce": () => phaseReady } : null;
AddMock(SYSTEM_ENTITY, IID_GovernmentFinance, {
	"CanAfford": () => treasury >= 1500000,
	"Spend": () =>
	{
		if (treasury < 1500000)
			return false;
		treasury -= 1500000;
		return true;
	},
	"AddFunds": (player, amount) => { treasury += amount; }
});
AddMock(SYSTEM_ENTITY, IID_NationSettlementManager, {
	"GetTotalPopulation": () => people
});
global.TryConstructBuilding = () =>
{
	++foundations;
	return constructionSucceeds ? 99 : false;
};
global.g_Commands = { "construct": () => "ordinary" };

Engine.LoadComponentScript("NationNationalProject.js");

const project = {
	"template": "structures/nation/national_project",
	"entities": [7]
};
const data = { "cmpPlayer": {}, "controlAllUnits": false };

TS_ASSERT_EQUALS(g_Commands.construct(1, project, data), false);
TS_ASSERT_EQUALS(treasury, 1500000);
phaseReady = true;
people = 32999;
TS_ASSERT_EQUALS(g_Commands.construct(1, project, data), false);
people = 33000;
treasury = 1499999;
TS_ASSERT_EQUALS(g_Commands.construct(1, project, data), false);

treasury = 1500000;
constructionSucceeds = false;
TS_ASSERT_EQUALS(g_Commands.construct(1, project, data), false);
TS_ASSERT_EQUALS(treasury, 1500000);
TS_ASSERT_EQUALS(foundations, 1);
constructionSucceeds = true;
TS_ASSERT_EQUALS(g_Commands.construct(1, project, data), 99);
TS_ASSERT_EQUALS(treasury, 0);
TS_ASSERT_EQUALS(foundations, 2);
TS_ASSERT_EQUALS(g_Commands.construct(2, project, data), false);
TS_ASSERT_EQUALS(g_Commands.construct(1, { "template": "structures/nation/farm" }, data), "ordinary");
