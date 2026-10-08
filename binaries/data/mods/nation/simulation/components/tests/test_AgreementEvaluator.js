Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("interfaces/GovernmentFinance.js");
Engine.LoadComponentScript("interfaces/DiplomaticAccess.js");
Engine.LoadComponentScript("interfaces/TradeAccess.js");
Engine.LoadComponentScript("interfaces/TechnologyManager.js");
Engine.LoadComponentScript("interfaces/Diplomacy.js");
Engine.LoadComponentScript("interfaces/PopulationFoodConsumption.js");
Engine.LoadComponentScript("interfaces/AgreementManager.js");
Engine.LoadComponentScript("interfaces/AgreementEvaluator.js");
Engine.LoadComponentScript("interfaces/AgreementAI.js");
Engine.RegisterInterface("Ownership");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("GovernmentFinance.js");
Engine.LoadComponentScript("DiplomaticAccess.js");
Engine.LoadComponentScript("TradeAccess.js");
Engine.LoadComponentScript("AgreementManager.js");
Engine.LoadComponentScript("AgreementEvaluator.js");
Engine.LoadComponentScript("AgreementAI.js");

const g_Codes = ["food", "wood", "stone", "metal"];
global.Resources = {
	"GetCodes": () => g_Codes.slice(),
	"GetResource": code => ({ "name": code })
};

const g_Players = {};
const g_Food = {};
let g_Factories = [];

global.QueryPlayerIDInterface = function(id, iid)
{
	const player = g_Players[id];
	if (!player)
		return null;
	if (iid === IID_TechnologyManager)
		return player.tech;
	if (iid === IID_Diplomacy)
		return player.diplomacy;
	return player;
};

AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 3
});
AddMock(SYSTEM_ENTITY, IID_PopulationFoodConsumption, {
	"GetFoodStatus": id => g_Food[id] || null
});

Engine.GetEntitiesWithInterface = function(iid)
{
	return [];
};

function makePlayer()
{
	const stock = {
		"food": 0,
		"wood": 0,
		"stone": 0,
		"metal": 0
	};
	const tech = {
		"researched": {},
		"IsTechnologyResearched": name => !!tech.researched[name]
	};
	const diplomacy = {
		"enemy": {},
		"IsEnemy": other => !!diplomacy.enemy[other]
	};
	return {
		"stock": stock,
		"tech": tech,
		"diplomacy": diplomacy,
		"isAI": false,
		"IsAI": function()
		{
			return this.isAI;
		},
		"GetResourceCounts": () => stock,
		"SetResourceCounts": resources =>
		{
			for (const type in resources)
				stock[type] = resources[type];
		},
		"TrySubtractResources": amounts =>
		{
			for (const type in amounts)
				if (stock[type] === undefined || stock[type] < amounts[type])
					return false;
			for (const type in amounts)
				stock[type] -= amounts[type];
			return true;
		},
		"AddResource": (type, amount) =>
		{
			stock[type] += amount;
		}
	};
}

g_Players[1] = makePlayer();
g_Players[2] = makePlayer();

const cmpTimer = ConstructComponent(SYSTEM_ENTITY, "Timer");
const cmpFinance = ConstructComponent(SYSTEM_ENTITY, "GovernmentFinance");
const cmpAccess = ConstructComponent(SYSTEM_ENTITY, "DiplomaticAccess");
const cmpTrade = ConstructComponent(SYSTEM_ENTITY, "TradeAccess");
const cmpAgreements = ConstructComponent(SYSTEM_ENTITY, "AgreementManager");
const cmpEvaluator = ConstructComponent(SYSTEM_ENTITY, "AgreementEvaluator");
const cmpAI = ConstructComponent(SYSTEM_ENTITY, "AgreementAI");
cmpAI.responders = [2];

function treasury(player, amount)
{
	const current = cmpFinance.GetTreasury(player);
	if (current > amount)
		cmpFinance.Spend(player, current - amount);
	else if (amount > current)
		cmpFinance.AddFunds(player, amount - current);
}

function foodStatus(player, required, shortageBps)
{
	g_Food[player] = {
		"required": required,
		"shortageBps": shortageBps,
		"fulfillmentBps": 10000 - shortageBps
	};
}

function proposal(offer, request)
{
	return {
		"proposer": 1,
		"recipient": 2,
		"offer": offer,
		"request": request
	};
}

function resource(provider, beneficiary, code, amount)
{
	return {
		"type": "resource",
		"resource": code,
		"amount": amount,
		"provider": provider,
		"beneficiary": beneficiary
	};
}

foodStatus(2, 40, 0);
g_Players[2].stock.food = 4000;
const surplusFood = cmpEvaluator.EvaluateItem(resource(1, 2, "food", 500), 2).utility;
g_Players[2].stock.food = 40;
foodStatus(2, 40, 8000);
const shortageFood = cmpEvaluator.EvaluateItem(resource(1, 2, "food", 500), 2).utility;
TS_ASSERT(shortageFood > surplusFood * 5);

g_Players[2].stock.food = 80;
foodStatus(2, 40, 10000);
const giveShortage = cmpEvaluator.EvaluateItem(resource(2, 1, "food", 60), 2).utility;
g_Players[2].stock.food = 4000;
foodStatus(2, 40, 0);
const giveSurplus = cmpEvaluator.EvaluateItem(resource(2, 1, "food", 60), 2).utility;
TS_ASSERT(giveShortage < 0);
TS_ASSERT(giveSurplus < 0);
TS_ASSERT(giveShortage < giveSurplus * 5);

treasury(2, 100000);
const poorCash = cmpEvaluator.EvaluateItem({
	"type": "cash",
	"amount": 500000,
	"provider": 1,
	"beneficiary": 2
}, 2).utility;
treasury(2, 20000000);
const richCash = cmpEvaluator.EvaluateItem({
	"type": "cash",
	"amount": 500000,
	"provider": 1,
	"beneficiary": 2
}, 2).utility;
TS_ASSERT(poorCash > richCash * 5);

g_Factories = [];
g_Players[2].stock.metal = 2000;
const surplusMetal = cmpEvaluator.EvaluateItem(resource(1, 2, "metal", 100), 2).utility;
g_Players[2].stock.metal = 0;
const shortMetal = cmpEvaluator.EvaluateItem(resource(1, 2, "metal", 100), 2).utility;
TS_ASSERT(shortMetal > surplusMetal * 5);
g_Factories = [];

cmpAccess.GrantMilitaryAccess(2, 1);
const repeatMilitary = cmpEvaluator.EvaluateItem({
	"type": "military_access",
	"provider": 1,
	"beneficiary": 2
}, 2);
TS_ASSERT_EQUALS(repeatMilitary.utility, 0);
cmpAccess.grants = [];
cmpTrade.GrantTrade(1, 2);
const repeatTrade = cmpEvaluator.EvaluateItem({
	"type": "trade_access",
	"provider": 2,
	"beneficiary": 1
}, 1);
TS_ASSERT_EQUALS(repeatTrade.utility, 0);
cmpTrade.grants = [];

g_Players[1].diplomacy.enemy[2] = true;
g_Players[2].diplomacy.enemy[1] = true;
treasury(1, 5000000);
treasury(2, 2000000);
g_Players[1].stock.food = 1000;
g_Players[2].stock.food = 1000;
g_Players[2].stock.metal = 400;
const hostile = cmpEvaluator.EvaluateProposalData(proposal([
	{ "type": "cash", "amount": 50000, "provider": 1, "beneficiary": 2 }
], [
	{ "type": "military_access", "provider": 2, "beneficiary": 1 }
]), 2);
TS_ASSERT_EQUALS(hostile.hardReject, true);
TS_ASSERT_EQUALS(hostile.decision, "reject");
const hostileId = cmpAgreements.Propose(1, 2, [
	{ "type": "cash", "amount": 50000 }
], [
	{ "type": "military_access" }
]);
TS_ASSERT(hostileId > 0);
TS_ASSERT_EQUALS(cmpAgreements.Find(hostileId).status, "pending");
cmpTimer.OnUpdate({ "turnLength": 1 });
TS_ASSERT_EQUALS(cmpAgreements.Find(hostileId).status, "rejected");
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 5000000);
TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(1, 2), false);
g_Players[1].diplomacy.enemy = {};
g_Players[2].diplomacy.enemy = {};

foodStatus(2, 40, 0);
g_Players[1].stock.food = 1000;
g_Players[1].stock.metal = 0;
g_Players[2].stock.food = 2000;
g_Players[2].stock.metal = 400;
g_Players[2].tech.researched = {};
treasury(1, 5000000);
treasury(2, 2000000);
const fair = cmpEvaluator.EvaluateProposalData(proposal([
	resource(1, 2, "food", 200),
	{ "type": "cash", "amount": 300000, "provider": 1, "beneficiary": 2 }
], [
	resource(2, 1, "metal", 50)
]), 2);
TS_ASSERT_EQUALS(fair.decision, "accept");
TS_ASSERT(fair.items.length >= 3);
const fairId = cmpAgreements.Propose(1, 2, [
	{ "type": "resource", "resource": "food", "amount": 200 },
	{ "type": "cash", "amount": 300000 }
], [
	{ "type": "resource", "resource": "metal", "amount": 50 }
]);
cmpTimer.OnUpdate({ "turnLength": 1 });
TS_ASSERT_EQUALS(cmpAgreements.Find(fairId).status, "accepted");
TS_ASSERT_EQUALS(g_Players[1].stock.food, 800);
TS_ASSERT_EQUALS(g_Players[2].stock.food, 2200);
TS_ASSERT_EQUALS(g_Players[2].stock.metal, 350);
TS_ASSERT_EQUALS(g_Players[1].stock.metal, 50);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 4700000);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), 2300000);
TS_ASSERT_EQUALS(cmpAgreements.Accept(2, fairId), false);
TS_ASSERT_EQUALS(g_Players[1].stock.food, 800);

g_Players[1].stock.metal = 0;
g_Players[2].stock.metal = 400;
treasury(1, 5000000);
treasury(2, 2000000);
const moderate = cmpEvaluator.EvaluateProposalData(proposal([
	{ "type": "cash", "amount": 10000, "provider": 1, "beneficiary": 2 }
], [
	resource(2, 1, "metal", 300)
]), 2);
TS_ASSERT_EQUALS(moderate.decision, "counter");
const moderateId = cmpAgreements.Propose(1, 2, [
	{ "type": "cash", "amount": 10000 }
], [
	{ "type": "resource", "resource": "metal", "amount": 300 }
]);
const metalBefore = g_Players[2].stock.metal;
const treasuryBefore = cmpFinance.GetTreasury(1);
cmpTimer.OnUpdate({ "turnLength": 1 });
TS_ASSERT_EQUALS(cmpAgreements.Find(moderateId).status, "countered");
TS_ASSERT_EQUALS(g_Players[2].stock.metal, metalBefore);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), treasuryBefore);
const counter = cmpAgreements.GetProposals().filter(item => item.parentProposal === moderateId)[0];
TS_ASSERT(counter);
TS_ASSERT_EQUALS(counter.proposer, 2);
TS_ASSERT_EQUALS(counter.recipient, 1);
TS_ASSERT_EQUALS(counter.status, "pending");
const counterScore = cmpEvaluator.EvaluateProposal(counter.id, 2);
TS_ASSERT(counterScore.totalUtility >= cmpEvaluator.AcceptAt);
TS_ASSERT_EQUALS(cmpAgreements.Accept(1, counter.id), true);
TS_ASSERT_EQUALS(cmpAgreements.Find(counter.id).status, "accepted");
TS_ASSERT_EQUALS(g_Players[2].stock.metal, 100);
TS_ASSERT(cmpFinance.GetTreasury(1) < treasuryBefore);
TS_ASSERT_EQUALS(cmpAgreements.Accept(1, counter.id), false);
TS_ASSERT_EQUALS(g_Players[2].stock.metal, 100);

const savedFood = g_Players[1].stock.food;
const waitingId = cmpAgreements.Propose(1, 2, [
	{ "type": "resource", "resource": "food", "amount": 50 }
], []);
TS_ASSERT_EQUALS(cmpAgreements.Find(waitingId).status, "pending");
TS_ASSERT_EQUALS(g_Players[1].stock.food, savedFood);
const restored = SerializationCycle(cmpAI);
TS_ASSERT_EQUALS(restored.answered[waitingId], undefined);
cmpTimer.OnUpdate({ "turnLength": 1 });
TS_ASSERT_EQUALS(cmpAgreements.Find(waitingId).status, "accepted");
const foodAfter = g_Players[1].stock.food;
restored.Respond(waitingId);
TS_ASSERT_EQUALS(g_Players[1].stock.food, foodAfter);
TS_ASSERT_EQUALS(cmpAgreements.Accept(2, waitingId), false);

const same = cmpEvaluator.EvaluateProposalData(proposal([
	resource(1, 2, "wood", 40)
], []), 2);
const again = cmpEvaluator.EvaluateProposalData(proposal([
	resource(1, 2, "wood", 40)
], []), 2);
TS_ASSERT_EQUALS(same.totalUtility, again.totalUtility);
TS_ASSERT_EQUALS(same.decision, again.decision);
