Engine.RegisterInterface("Timer");
Engine.RegisterInterface("PopulationFoodConsumption");
Engine.RegisterInterface("GovernmentFinance");
Engine.RegisterInterface("NationSettlementManager");
Engine.RegisterInterface("NationSettlement");
Engine.RegisterInterface("RebellionManager");
Engine.RegisterInterface("SettlementDiscontent");
Engine.RegisterInterface("DebtLedger");
Engine.RegisterInterface("ForeignActorManager");
Engine.RegisterInterface("Health");
Engine.RegisterInterface("Identity");
Engine.RegisterInterface("GuiInterface");
Engine.RegisterInterface("NationScenarioController");
Engine.RegisterInterface("RangeManager");
Engine.RegisterInterface("InfrastructureLink");
Engine.LoadComponentScript("NationScenarioController.js");

const g = {
	"time": 0,
	"food": 1800,
	"population": 33500,
	"required": 335,
	"consumed": 335,
	"unmet": 0,
	"shortageBps": 0,
	"interval": 10000,
	"treasury": 2000000,
	"revenue": 335,
	"capitalHp": 2400,
	"debts": [],
	"notes": [],
	"settlements": [
		{ "id": 30, "name": "Esika", "population": 18000, "integration": 90, "discontent": 0, "rebellion": false, "owner": 1, "isCapital": true, "x": 90, "z": 420 },
		{ "id": 31, "name": "Bontuku", "population": 5000, "integration": 35, "discontent": 0, "rebellion": false, "owner": 1, "isCapital": false, "x": 70, "z": 470 },
		{ "id": 32, "name": "Sefira", "population": 3500, "integration": 20, "discontent": 0, "rebellion": false, "owner": 1, "isCapital": false, "x": 80, "z": 280 },
		{ "id": 33, "name": "Anomara", "population": 7000, "integration": 55, "discontent": 0, "rebellion": false, "owner": 1, "isCapital": false, "x": 210, "z": 300 }
	],
	"links": [
		{ "id": 40, "name": "Bontuku Road", "condition": 42, "owner": 1, "x": 80, "z": 445, "inWorld": true },
		{ "id": 41, "name": "Western Road", "condition": 100, "owner": 1, "x": 120, "z": 300, "inWorld": true },
		{ "id": 42, "name": "Border Road", "condition": 20, "owner": 2, "x": 300, "z": 300, "inWorld": true },
		{ "id": 43, "name": "", "condition": 10, "owner": 1, "x": 10, "z": 10, "inWorld": true }
	]
};

function row(id)
{
	for (let i = 0; i < g.settlements.length; ++i)
		if (g.settlements[i].id === id)
			return g.settlements[i];
	return null;
}

global.QueryPlayerIDInterface = function(id, iid)
{
	if (iid === IID_Identity)
		return { "GetName": () => "Nation" };
	if (id === 1)
		return { "GetResourceCounts": () => ({ "food": g.food }) };
	return null;
};

const config = {
	"id": "food_crisis",
	"player": 1,
	"capitalEntity": 10,
	"minVictoryTime": 720000,
	"stableDuration": 120000,
	"discontentVictoryMax": 60,
	"reserveIntervals": 3,
	"collapseRebellions": 2,
	"collapseRebellionDuration": 180000,
	"collapseShortageBps": 8000,
	"collapseTreasuryDuration": 120000,
	"discontentBands": [50, 70, 80]
};

function installWorld()
{
	AddMock(SYSTEM_ENTITY, IID_Timer, {
		"GetTime": () => g.time,
		"SetInterval": () => 1
	});
	AddMock(SYSTEM_ENTITY, IID_PopulationFoodConsumption, {
		"GetFoodStatus": () => ({
			"population": g.population,
			"required": g.required,
			"consumed": g.consumed,
			"unmet": g.unmet,
			"shortageBps": g.shortageBps,
			"interval": g.interval,
			"fulfillmentBps": 10000 - g.shortageBps,
			"cumulativeUnmet": 0
		})
	});
	AddMock(SYSTEM_ENTITY, IID_GovernmentFinance, {
		"GetTreasury": () => g.treasury,
		"GetRevenuePerTick": () => g.revenue
	});
	AddMock(SYSTEM_ENTITY, IID_NationSettlementManager, {
		"GetSettlementsForSovereign": () => g.settlements.map(settlement => settlement.id)
	});
	AddMock(SYSTEM_ENTITY, IID_RebellionManager, {
		"GetStatus": ent => ({ "active": !!(row(ent) && row(ent).rebellion) })
	});
	AddMock(SYSTEM_ENTITY, IID_SettlementDiscontent, {
		"FoodPressure": bps => Math.round(bps * 10 / 10000),
		"IntegrationPenalty": integration => Math.floor((100 - integration) / 20)
	});
	AddMock(SYSTEM_ENTITY, IID_DebtLedger, {
		"GetDebts": () => g.debts
	});
	AddMock(SYSTEM_ENTITY, IID_GuiInterface, {
		"PushNotification": note => g.notes.push(note.message)
	});
	AddMock(10, IID_Health, {
		"GetHitpoints": () => g.capitalHp
	});
	AddMock(SYSTEM_ENTITY, IID_RangeManager, {
		"GetEntitiesByPlayer": () => g.links.map(item => item.id)
	});
	for (let i = 0; i < g.settlements.length; ++i)
	{
		const id = g.settlements[i].id;
		AddMock(id, IID_NationSettlement, {
			"GetName": () => row(id).name,
			"GetPopulation": () => row(id).population,
			"GetStateIntegration": () => row(id).integration,
			"GetDiscontent": () => row(id).discontent,
			"GetIsCapital": () => row(id).isCapital
		});
		AddMock(id, IID_Ownership, {
			"GetOwner": () => row(id).owner
		});
		AddMock(id, IID_Position, {
			"IsInWorld": () => true,
			"GetPosition2D": () => ({ "x": row(id).x, "y": row(id).z })
		});
	}
	for (let i = 0; i < g.links.length; ++i)
	{
		const id = g.links[i].id;
		AddMock(id, IID_InfrastructureLink, {
			"GetCondition": () => linkRow(id).condition
		});
		AddMock(id, IID_Ownership, {
			"GetOwner": () => linkRow(id).owner
		});
		AddMock(id, IID_Position, {
			"IsInWorld": () => linkRow(id).inWorld,
			"GetPosition2D": () => ({ "x": linkRow(id).x, "y": linkRow(id).z })
		});
		AddMock(id, IID_Identity, {
			"template": { "SpecificName": g.links[i].name }
		});
	}
}

function linkRow(id)
{
	for (let i = 0; i < g.links.length; ++i)
		if (g.links[i].id === id)
			return g.links[i];
	return null;
}

function fresh()
{
	g.time = 10000;
	g.food = 1800;
	g.unmet = 0;
	g.shortageBps = 0;
	g.consumed = 335;
	g.treasury = 2000000;
	g.capitalHp = 2400;
	g.debts = [];
	g.notes = [];
	for (let i = 0; i < g.settlements.length; ++i)
	{
		g.settlements[i].discontent = 0;
		g.settlements[i].rebellion = false;
		g.settlements[i].owner = 1;
	}
	g.links[0].condition = 42;
	g.links[1].condition = 100;
	g.links[2].condition = 20;
	g.links[3].condition = 10;
	installWorld();
	const cmp = ConstructComponent(SYSTEM_ENTITY, "NationScenarioController");
	TS_ASSERT_EQUALS(cmp.ReadConfig(config), true);
	return cmp;
}

let cmp = fresh();
let view = cmp.GetView();
TS_ASSERT_EQUALS(view.population, 33500);
TS_ASSERT_EQUALS(view.food, 1800);
TS_ASSERT_EQUALS(view.required, 335);
TS_ASSERT_EQUALS(view.unmet, 0);
TS_ASSERT_EQUALS(view.treasury, 2000000);
TS_ASSERT_EQUALS(view.settlements[2].name, "Sefira");
TS_ASSERT_EQUALS(view.settlements[2].integration, 20);
TS_ASSERT_EQUALS(view.settlements[2].discontent, 0);
TS_ASSERT_EQUALS(view.settlements[2].rebellion, false);
TS_ASSERT_EQUALS(view.activeRebellions, 0);
TS_ASSERT_EQUALS(view.debt, 0);
TS_ASSERT_EQUALS(view.settlements[2].vulnerability, 4);

g.debts = [{
	"status": "active",
	"debtor": 1,
	"creditor": { "type": "foreign_actor", "id": "ussr" },
	"principalOutstanding": 5000000
}];
AddMock(SYSTEM_ENTITY, IID_ForeignActorManager, {
	"Get": () => ({ "name": "Soviet Union" })
});
view = cmp.GetView();
TS_ASSERT_EQUALS(view.debt, 5000000);
TS_ASSERT_EQUALS(view.debtCreditor, "Soviet Union");
g.debts = [];

row(32).discontent = 49;
cmp.Observe();
TS_ASSERT_EQUALS(g.notes.length, 0);
row(32).discontent = 50;
cmp.Observe();
TS_ASSERT_EQUALS(g.notes.length, 1);
TS_ASSERT_EQUALS(g.notes[0], "Sefira is restless.");
row(32).discontent = 51;
cmp.Observe();
TS_ASSERT_EQUALS(g.notes.length, 1);
row(32).discontent = 70;
cmp.Observe();
TS_ASSERT_EQUALS(g.notes.length, 2);
TS_ASSERT_EQUALS(g.notes[1], "Sefira is volatile.");

cmp = SerializationCycle(cmp);
const noted = g.notes.length;
row(32).discontent = 72;
cmp.Observe();
TS_ASSERT_EQUALS(g.notes.length, noted);
row(32).discontent = 80;
cmp.Observe();
TS_ASSERT_EQUALS(g.notes[g.notes.length - 1], "Sefira is at risk of rebellion.");

function hold(cmpScenario)
{
	g.time = 720000;
	g.food = 1200;
	g.unmet = 0;
	g.shortageBps = 0;
	g.treasury = 400000;
	g.capitalHp = 2400;
	for (let i = 0; i < g.settlements.length; ++i)
	{
		g.settlements[i].discontent = 40;
		g.settlements[i].rebellion = false;
	}
	cmpScenario.Observe();
}

cmp = fresh();
hold(cmp);
TS_ASSERT_EQUALS(cmp.outcome, "");
g.time = 839000;
cmp.Observe();
TS_ASSERT_EQUALS(cmp.outcome, "");
g.unmet = 40;
g.shortageBps = 1000;
g.food = 200;
cmp.Observe();
TS_ASSERT_EQUALS(cmp.stableSince, -1);
TS_ASSERT_EQUALS(cmp.outcome, "");
g.unmet = 0;
g.shortageBps = 0;
g.food = 1200;
g.time = 900000;
cmp.Observe();
TS_ASSERT_EQUALS(cmp.outcome, "");
g.time = 1020000;
cmp.Observe();
TS_ASSERT_EQUALS(cmp.outcome, "victory");
TS_ASSERT_EQUALS(cmp.summary.food, 1200);
TS_ASSERT_EQUALS(cmp.summary.treasury, 400000);
TS_ASSERT_EQUALS(cmp.summary.debt, 0);
const victoryNotes = g.notes.length;
cmp.Observe();
TS_ASSERT_EQUALS(g.notes.length, victoryNotes);
TS_ASSERT_EQUALS(cmp.GetView().summary.outcome, "victory");

cmp = fresh();
g.debts = [{
	"status": "active",
	"debtor": 1,
	"creditor": { "type": "foreign_actor", "id": "ussr" },
	"principalOutstanding": 5000000
}];
AddMock(SYSTEM_ENTITY, IID_ForeignActorManager, {
	"Get": () => ({ "name": "Soviet Union" })
});
hold(cmp);
g.time = 840000;
cmp.Observe();
TS_ASSERT_EQUALS(cmp.outcome, "victory");
TS_ASSERT_EQUALS(cmp.summary.debt, 5000000);
TS_ASSERT_EQUALS(cmp.summary.debtCreditor, "Soviet Union");

cmp = fresh();
g.treasury = 0;
g.shortageBps = 8000;
g.unmet = 268;
cmp.Observe();
TS_ASSERT_EQUALS(cmp.outcome, "");
g.time = 10000 + 119000;
cmp.Observe();
TS_ASSERT_EQUALS(cmp.outcome, "");
g.time = 10000 + 120000;
cmp.Observe();
TS_ASSERT_EQUALS(cmp.outcome, "loss");
TS_ASSERT_EQUALS(cmp.outcomeReason, "The treasury is empty and the food shortage has not lifted.");
const lossNotes = g.notes.length;
cmp.Observe();
TS_ASSERT_EQUALS(g.notes.length, lossNotes);

cmp = fresh();
row(32).rebellion = true;
row(31).rebellion = true;
cmp.Observe();
TS_ASSERT_EQUALS(cmp.outcome, "");
	TS_ASSERT(g.notes.indexOf("Rebels have appeared near Sefira.") !== -1);
	TS_ASSERT(g.notes.indexOf("Rebels have appeared near Bontuku.") !== -1);
g.time = 10000 + 180000;
cmp.Observe();
TS_ASSERT_EQUALS(cmp.outcome, "loss");
TS_ASSERT_EQUALS(cmp.outcomeReason, "Armed rebellion has spread through the country.");

cmp = fresh();
g.capitalHp = 0;
cmp.Observe();
TS_ASSERT_EQUALS(cmp.outcome, "");
g.capitalHp = 2400;
cmp.Observe();
g.capitalHp = 0;
cmp.Observe();
TS_ASSERT_EQUALS(cmp.outcome, "loss");
TS_ASSERT_EQUALS(cmp.outcomeReason, "The capital has fallen.");

cmp = fresh();
cmp.Observe();
g.food = 1400;
cmp.Observe();
TS_ASSERT_EQUALS(g.notes.indexOf("Food reserves are falling."), -1);
g.food = 1300;
cmp.Observe();
TS_ASSERT(g.notes.indexOf("Food reserves are falling.") !== -1);
g.unmet = 200;
g.shortageBps = 6000;
cmp.Observe();
TS_ASSERT(g.notes.indexOf("Food shortage. 200 food unmet.") !== -1);
cmp.Observe();
const shortageCount = g.notes.filter(note => note.indexOf("Food shortage") === 0).length;
TS_ASSERT_EQUALS(shortageCount, 1);
g.unmet = 0;
g.shortageBps = 0;
cmp.Observe();
g.unmet = 80;
cmp.Observe();
TS_ASSERT_EQUALS(g.notes.filter(note => note.indexOf("Food shortage") === 0).length, 2);

Engine.RegisterInterface("Player");
Engine.LoadComponentScript("interfaces/Player.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/TradeAccess.js");
Engine.LoadComponentScript("interfaces/FoodImportManager.js");
Engine.LoadComponentScript("interfaces/InfrastructureLink.js");
Engine.LoadComponentScript("interfaces/InfrastructureInvestment.js");
Engine.LoadHelperScript("Player.js");
var g_Commands = {};
Engine.LoadComponentScript("FoodImportManager.js");
Engine.LoadComponentScript("InfrastructureLink.js");
Engine.LoadComponentScript("InfrastructureInvestment.js");
Engine.LoadComponentScript("TradeAccess.js");
Engine.LoadComponentScript("GovernmentFinance.js");

ResetState();
g.notes = [];
const g_Stock = { "food": 200 };
AddMock(1, IID_Player, {
	"GetResourceCounts": () => g_Stock,
	"AddResource": (type, amount) =>
	{
		g_Stock[type] += amount;
	}
});
AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 3,
	"GetPlayerByID": id => id === 1 || id === 2 ? id : null
});
const cmpFinance = ConstructComponent(SYSTEM_ENTITY, "GovernmentFinance");
cmpFinance.ReadAccounts([{ "player": 1, "treasury": 2000000 }]);
const cmpTrade = ConstructComponent(SYSTEM_ENTITY, "TradeAccess");
cmpTrade.ReadGrants([{ "from": 1, "to": 2, "trade": true }]);
const cmpImport = ConstructComponent(SYSTEM_ENTITY, "FoodImportManager");
TS_ASSERT_EQUALS(cmpImport.ReadOffers([{
	"id": "neighbor-food-import",
	"buyer": 1,
	"seller": 2,
	"resource": "food",
	"amount": 1000,
	"cost": 500000
}]), true);
const quote = cmpImport.GetQuote(1);
TS_ASSERT_EQUALS(quote.available, true);
TS_ASSERT_EQUALS(quote.amount, 1000);
TS_ASSERT_EQUALS(quote.cost, 500000);
TS_ASSERT_EQUALS(g_Commands["nation-purchase-import"](1, { "offer": "neighbor-food-import" }), undefined);
TS_ASSERT_EQUALS(g_Stock.food, 1200);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 1500000);
TS_ASSERT_EQUALS(g_Commands["nation-purchase-import"](1, { "offer": "missing" }), undefined);
TS_ASSERT_EQUALS(g_Stock.food, 1200);

Engine.RegisterInterface("SettlementConnectivity");
const cmpLink = ConstructComponent(40, "InfrastructureLink", {
	"From": "30",
	"To": "31",
	"Condition": "42"
});
AddMock(40, IID_Ownership, { "GetOwner": () => 1 });
const cmpInvestment = ConstructComponent(SYSTEM_ENTITY, "InfrastructureInvestment");
let repair = cmpInvestment.GetRepairQuote(1, 40);
TS_ASSERT_EQUALS(repair.condition, 42);
TS_ASSERT_EQUALS(repair.cost, 580000);
TS_ASSERT_EQUALS(repair.authorized, true);
TS_ASSERT_EQUALS(repair.canAfford, true);
TS_ASSERT_EQUALS(g_Commands["nation-repair-infrastructure"](1, { "entity": 40 }), undefined);
TS_ASSERT_EQUALS(cmpLink.GetCondition(), 100);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 920000);
repair = cmpInvestment.GetRepairQuote(1, 40);
TS_ASSERT_EQUALS(repair.repairable, false);

ConstructComponent(42, "InfrastructureLink", { "From": "31", "To": "33", "Condition": "50" });
AddMock(42, IID_Ownership, { "GetOwner": () => 1 });
cmpFinance.Spend(1, 920000);
TS_ASSERT_EQUALS(cmpInvestment.GetRepairQuote(1, 42).canAfford, false);
TS_ASSERT_EQUALS(cmpInvestment.Repair(1, 42), false);
TS_ASSERT_EQUALS(Engine.QueryInterface(42, IID_InfrastructureLink).GetCondition(), 50);

AddMock(41, IID_Ownership, { "GetOwner": () => 2 });
ConstructComponent(41, "InfrastructureLink", { "From": "30", "To": "32", "Condition": "40" });
TS_ASSERT_EQUALS(cmpInvestment.GetRepairQuote(1, 41).authorized, false);
TS_ASSERT_EQUALS(cmpInvestment.Repair(1, 41), false);

cmpFinance.AddFunds(1, 500000);
cmpTrade.ReadGrants([]);
TS_ASSERT_EQUALS(cmpImport.GetQuote(1).tradeAllowed, false);
TS_ASSERT_EQUALS(cmpImport.Purchase(1, "neighbor-food-import"), false);
TS_ASSERT_EQUALS(g_Stock.food, 1200);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 500000);

Engine.RegisterInterface("DiplomaticAccess");
Engine.LoadComponentScript("interfaces/ForeignActorManager.js");
Engine.LoadComponentScript("interfaces/DebtLedger.js");
Engine.LoadComponentScript("interfaces/AgreementManager.js");
Engine.LoadComponentScript("ForeignActorManager.js");
Engine.LoadComponentScript("DebtLedger.js");
global.Resources = {
	"GetCodes": () => ["food", "wood", "stone", "metal", "construction_materials"],
	"GetResource": () => ({ "name": "Food" })
};
Engine.LoadComponentScript("AgreementManager.js");
AddMock(SYSTEM_ENTITY, IID_Timer, {
	"GetTime": () => 0,
	"SetTimeout": () => 1,
	"SetInterval": () => 1
});
const cmpActors = ConstructComponent(SYSTEM_ENTITY, "ForeignActorManager");
cmpActors.ReadActors([{
	"id": "ussr",
	"name": "Soviet Union",
	"type": "foreign_power",
	"treasury": 100000000,
	"responds": true
}]);
const cmpLedger = ConstructComponent(SYSTEM_ENTITY, "DebtLedger");
const cmpAgreements = ConstructComponent(SYSTEM_ENTITY, "AgreementManager");
const ussr = { "type": "foreign_actor", "id": "ussr" };
const loanId = cmpAgreements.Propose(1, ussr, [], [{
	"type": "loan",
	"principal": 2000000,
	"interestRateBps": 400,
	"installments": 5,
	"graceIntervals": 1
}]);
TS_ASSERT(loanId > 0);
TS_ASSERT_EQUALS(cmpAgreements.Accept(ussr, loanId), true);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 2500000);
TS_ASSERT_EQUALS(cmpLedger.GetDebts().length, 1);
TS_ASSERT_EQUALS(cmpLedger.GetDebts()[0].principalOutstanding, 2000000);
cmpTrade.ReadGrants([{ "from": 1, "to": 2, "trade": true }]);
TS_ASSERT_EQUALS(cmpImport.Purchase(1, "neighbor-food-import"), true);
TS_ASSERT_EQUALS(g_Stock.food, 2200);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 2000000);
TS_ASSERT_EQUALS(cmpLedger.GetDebts()[0].principalOutstanding, 2000000);

cmp = fresh();
view = cmp.GetView();
TS_ASSERT_EQUALS(view.settlements[0].name, "Esika");
TS_ASSERT_EQUALS(view.settlements[0].isCapital, true);
TS_ASSERT_EQUALS(view.settlements[0].mood, "Calm");
TS_ASSERT_EQUALS(view.settlements[0].position.x, 90);
TS_ASSERT_EQUALS(view.settlements[0].position.z, 420);
TS_ASSERT_EQUALS(view.settlements[0].owner, 1);
TS_ASSERT_EQUALS(cmp.Mood(24), "Calm");
TS_ASSERT_EQUALS(cmp.Mood(25), "Uneasy");
TS_ASSERT_EQUALS(cmp.Mood(49), "Uneasy");
TS_ASSERT_EQUALS(cmp.Mood(50), "Restive");
TS_ASSERT_EQUALS(cmp.Mood(69), "Restive");
TS_ASSERT_EQUALS(cmp.Mood(70), "Volatile");
TS_ASSERT_EQUALS(cmp.Mood(79), "Volatile");
TS_ASSERT_EQUALS(cmp.Mood(80), "Rebellion risk");
row(32).discontent = 49;
view = cmp.GetView();
TS_ASSERT_EQUALS(view.settlements[2].discontent, 49);
TS_ASSERT_EQUALS(view.settlements[2].mood, "Uneasy");
row(32).discontent = 50;
view = cmp.GetView();
TS_ASSERT_EQUALS(view.settlements[2].mood, "Restive");
row(32).discontent = 70;
view = cmp.GetView();
TS_ASSERT_EQUALS(view.settlements[2].mood, "Volatile");
row(32).discontent = 80;
view = cmp.GetView();
TS_ASSERT_EQUALS(view.settlements[2].mood, "Rebellion risk");
row(32).discontent = 72;
const foodBefore = g.food;
const treasuryBefore = g.treasury;
const outcomeBefore = cmp.outcome;
view = cmp.GetView();
TS_ASSERT_EQUALS(g.food, foodBefore);
TS_ASSERT_EQUALS(g.treasury, treasuryBefore);
TS_ASSERT_EQUALS(row(32).discontent, 72);
TS_ASSERT_EQUALS(cmp.outcome, outcomeBefore);
TS_ASSERT_EQUALS(view.settlements[2].discontent, 72);
TS_ASSERT_EQUALS(view.settlements[2].mood, "Volatile");
TS_ASSERT_EQUALS(view.criticalInfrastructure.length, 1);
TS_ASSERT_EQUALS(view.criticalInfrastructure[0].id, 40);
TS_ASSERT_EQUALS(view.criticalInfrastructure[0].name, "Bontuku Road");
TS_ASSERT_EQUALS(view.criticalInfrastructure[0].condition, 42);
TS_ASSERT_EQUALS(view.criticalInfrastructure[0].position.z, 445);
g.links[0].condition = 100;
view = cmp.GetView();
TS_ASSERT_EQUALS(view.criticalInfrastructure.length, 0);
g.links[0].condition = 42;
row(32).owner = 2;
view = cmp.GetView();
TS_ASSERT_EQUALS(view.settlements[2].owner, 2);
TS_ASSERT_EQUALS(view.criticalInfrastructure[0].owner, 1);
cmp = SerializationCycle(cmp);
view = cmp.GetView();
TS_ASSERT_EQUALS(view.settlements[2].discontent, 72);
TS_ASSERT_EQUALS(view.settlements[2].mood, "Volatile");
TS_ASSERT_EQUALS(view.criticalInfrastructure[0].name, "Bontuku Road");
TS_ASSERT_EQUALS(view.criticalInfrastructure[0].condition, 42);
TS_ASSERT_EQUALS(cmp.labels, undefined);

eval(fs.readFileSync("/Users/reg/Documents/GitHub/nation/binaries/data/mods/nation/gui/session/top_panel/NationCrisisHud.js", "utf8"));
TS_ASSERT_EQUALS(nationCrisisMood(49), "Uneasy");
TS_ASSERT_EQUALS(nationCrisisMood(50), "Restive");
TS_ASSERT_EQUALS(nationCrisisMood(70), "Volatile");
TS_ASSERT_EQUALS(nationCrisisMood(80), "Rebellion risk");
const caption = nationCrisisSettlementCaption(view.settlements[2]);
TS_ASSERT_EQUALS(caption, "SEFIRA\n72 · VOLATILE");
TS_ASSERT_EQUALS(nationCrisisSettlementCaption(view.settlements[0]), "ESIKA\n0 · CALM");
TS_ASSERT_EQUALS(nationCrisisRoadCaption(view.criticalInfrastructure[0]), "BONTUKU ROAD\n42%");
const visible = nationCrisisForViewer(view.settlements, 1);
TS_ASSERT_EQUALS(visible.length, 3);
TS_ASSERT_EQUALS(visible[0].id, 30);
const ordered = nationCrisisOrderedSettlements(view.settlements);
TS_ASSERT_EQUALS(ordered[0].id, 32);
TS_ASSERT_EQUALS(ordered[0].name, "Sefira");
const items = nationCrisisMapItems(view, 1);
TS_ASSERT_EQUALS(items.length, 4);
TS_ASSERT_EQUALS(items[3].caption, "BONTUKU ROAD\n42%");
const none = nationCrisisNewRebellions(null, view.settlements);
TS_ASSERT_EQUALS(none.started.length, 0);
row(32).rebellion = true;
view = cmp.GetView();
const started = nationCrisisNewRebellions(none.known, view.settlements);
TS_ASSERT_EQUALS(started.started.length, 1);
TS_ASSERT_EQUALS(started.started[0], 32);
const projected = nationCrisisProject(
	(sx, sy) => ({ "x": sx * 2 + 10, "z": sy * 3 + 20 }),
	210,
	320,
	null,
	800,
	600);
TS_ASSERT(projected);
TS_ASSERT(Math.abs(projected.x - 100) < 1);
TS_ASSERT(Math.abs(projected.y - 100) < 1);
TS_ASSERT_EQUALS(nationCrisisProject(
	() => ({ "x": 0, "z": 0 }),
	500,
	500,
	null,
	800,
	600), null);
