Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/GovernmentFinance.js");
Engine.LoadComponentScript("interfaces/DiplomaticAccess.js");
Engine.LoadComponentScript("interfaces/TradeAccess.js");
Engine.LoadComponentScript("interfaces/ForeignActorManager.js");
Engine.LoadComponentScript("interfaces/DebtLedger.js");
Engine.LoadComponentScript("interfaces/AgreementManager.js");
Engine.LoadComponentScript("interfaces/AgreementEvaluator.js");
Engine.LoadComponentScript("interfaces/AgreementAI.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("GovernmentFinance.js");
Engine.LoadComponentScript("DiplomaticAccess.js");
Engine.LoadComponentScript("TradeAccess.js");
Engine.LoadComponentScript("ForeignActorManager.js");
Engine.LoadComponentScript("DebtLedger.js");
Engine.LoadComponentScript("AgreementEvaluator.js");
Engine.LoadComponentScript("AgreementAI.js");

const g_Codes = ["food", "wood", "stone", "metal", "construction_materials"];
global.Resources = {
	"GetCodes": () => g_Codes.slice(),
	"GetResource": code => ({ "name": code })
};

const g_Players = {};
global.QueryPlayerIDInterface = function(id)
{
	return g_Players[id] || null;
};

AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 3
});

function makePlayer()
{
	const stock = {
		"food": 1000,
		"wood": 500,
		"stone": 400,
		"metal": 200,
		"construction_materials": 0
	};
	return {
		"stock": stock,
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
		},
		"IsAI": () => false
	};
}

g_Players[1] = makePlayer();
g_Players[2] = makePlayer();

global.g_Commands = {};
Engine.LoadComponentScript("AgreementManager.js");

const cmpTimer = ConstructComponent(SYSTEM_ENTITY, "Timer");
const cmpFinance = ConstructComponent(SYSTEM_ENTITY, "GovernmentFinance");
const cmpActors = ConstructComponent(SYSTEM_ENTITY, "ForeignActorManager");
const cmpLedger = ConstructComponent(SYSTEM_ENTITY, "DebtLedger");
const cmpAgreements = ConstructComponent(SYSTEM_ENTITY, "AgreementManager");
const cmpEvaluator = ConstructComponent(SYSTEM_ENTITY, "AgreementEvaluator");
const cmpAI = ConstructComponent(SYSTEM_ENTITY, "AgreementAI");

const ussr = { "type": "foreign_actor", "id": "ussr" };

cmpActors.ReadActors([
	{
		"id": "ussr",
		"name": "Soviet Union",
		"type": "foreign_power",
		"treasury": 100000000,
		"responds": true
	}
]);
TS_ASSERT_EQUALS(cmpActors.Get("ussr").name, "Soviet Union");
TS_ASSERT_EQUALS(cmpActors.GetTreasury("ussr"), 100000000);
TS_ASSERT_EQUALS(cmpActors.CanAfford("ussr", 100000001), false);

function treasury(player, amount)
{
	const current = cmpFinance.GetTreasury(player);
	if (current > amount)
		cmpFinance.Spend(player, current - amount);
	else if (amount > current)
		cmpFinance.AddFunds(player, amount - current);
}

function setActorTreasury(amount)
{
	const current = cmpActors.GetTreasury("ussr");
	if (current > amount)
		cmpActors.Spend("ussr", current - amount);
	else if (amount > current)
		cmpActors.AddFunds("ussr", amount - current);
}

treasury(1, 10000000);
treasury(2, 5000000);

TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [{ "type": "cash", "amount": 1000 }], []), 1);
TS_ASSERT_EQUALS(cmpAgreements.Accept(2, 1), true);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 9999000);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), 5001000);
treasury(1, 10000000);
treasury(2, 5000000);

TS_ASSERT_EQUALS(cmpAgreements.Propose(1, ussr, [
	{ "type": "resource", "resource": "food", "amount": 10 }
], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, ussr, [{ "type": "military_access" }], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, ussr, [{ "type": "trade_access" }], []), 0);
TS_ASSERT_EQUALS(g_Players[1].stock.food, 1000);
TS_ASSERT_EQUALS(cmpActors.GetTreasury("ussr"), 100000000);

const toActor = cmpAgreements.Propose(1, ussr, [{ "type": "cash", "amount": 50000 }], []);
TS_ASSERT_EQUALS(cmpAgreements.Accept(ussr, toActor), true);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 9950000);
TS_ASSERT_EQUALS(cmpActors.GetTreasury("ussr"), 100050000);
setActorTreasury(100000000);
treasury(1, 10000000);

const fromActor = cmpAgreements.Propose(1, ussr, [], [{ "type": "cash", "amount": 50000 }]);
TS_ASSERT_EQUALS(cmpAgreements.Accept(ussr, fromActor), true);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 10050000);
TS_ASSERT_EQUALS(cmpActors.GetTreasury("ussr"), 99950000);
setActorTreasury(100000000);
treasury(1, 10000000);

const playerLoan = cmpAgreements.Propose(1, 2, [{
	"type": "loan",
	"principal": 1000000,
	"interestRateBps": 400,
	"installments": 5,
	"graceIntervals": 0
}], []);
TS_ASSERT_EQUALS(cmpAgreements.Accept(2, playerLoan), true);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 9000000);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), 6000000);
const playerDebt = cmpLedger.GetDebts()[0];
TS_ASSERT_EQUALS(playerDebt.id, 1);
TS_ASSERT_EQUALS(playerDebt.creditor, 1);
TS_ASSERT_EQUALS(playerDebt.debtor, 2);
TS_ASSERT_EQUALS(playerDebt.principalOutstanding, 1000000);

setActorTreasury(1000);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, ussr, [], [{
	"type": "loan",
	"principal": 5000000,
	"interestRateBps": 400,
	"installments": 5,
	"graceIntervals": 1
}]), 0);
TS_ASSERT_EQUALS(cmpLedger.GetDebts().length, 1);
setActorTreasury(100000000);

const atomicId = cmpAgreements.Propose(1, ussr, [
	{ "type": "cash", "amount": 100000 }
], [{
	"type": "loan",
	"principal": 1000000,
	"interestRateBps": 400,
	"installments": 5,
	"graceIntervals": 0
}]);
TS_ASSERT(atomicId > 0);
treasury(1, 1000);
TS_ASSERT_EQUALS(cmpAgreements.Accept(ussr, atomicId), false);
TS_ASSERT_EQUALS(cmpAgreements.Find(atomicId).status, "invalidated");
TS_ASSERT_EQUALS(cmpActors.GetTreasury("ussr"), 100000000);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 1000);
TS_ASSERT_EQUALS(cmpLedger.GetDebts().length, 1);
treasury(1, 10000000);

function loanItem(principal, rate, installments, grace)
{
	return {
		"type": "loan",
		"principal": principal,
		"interestRateBps": rate,
		"installments": installments,
		"graceIntervals": grace
	};
}

const worked = cmpLedger.Find(cmpLedger.Create(1, 2, {
	"principal": 1000000,
	"interestRateBps": 400,
	"installments": 5,
	"graceIntervals": 0
}));
treasury(2, 1200000);
const creditorBefore = cmpFinance.GetTreasury(1);
cmpLedger.ApplyInterval(worked);
TS_ASSERT_EQUALS(worked.principalOutstanding, 800000);
TS_ASSERT_EQUALS(worked.interestPaid, 40000);
TS_ASSERT_EQUALS(worked.paymentsMade, 1);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), 960000);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), creditorBefore + 240000);
cmpLedger.ApplyInterval(worked);
TS_ASSERT_EQUALS(worked.principalOutstanding, 600000);
TS_ASSERT_EQUALS(worked.interestPaid, 72000);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), 728000);
cmpLedger.ApplyInterval(worked);
cmpLedger.ApplyInterval(worked);
cmpLedger.ApplyInterval(worked);
TS_ASSERT_EQUALS(worked.principalOutstanding, 0);
TS_ASSERT_EQUALS(worked.interestPaid, 120000);
TS_ASSERT_EQUALS(worked.status, "repaid");
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), 80000);

const graceDebt = cmpLedger.Find(cmpLedger.Create(ussr, 1, {
	"principal": 1000000,
	"interestRateBps": 400,
	"installments": 5,
	"graceIntervals": 1
}));
const nationBeforeGrace = cmpFinance.GetTreasury(1);
const actorBeforeGrace = cmpActors.GetTreasury("ussr");
cmpLedger.ApplyInterval(graceDebt);
TS_ASSERT_EQUALS(graceDebt.graceRemaining, 0);
TS_ASSERT_EQUALS(graceDebt.interestDue, 40000);
TS_ASSERT_EQUALS(graceDebt.paymentsMade, 0);
TS_ASSERT_EQUALS(graceDebt.principalOutstanding, 1000000);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), nationBeforeGrace);
TS_ASSERT_EQUALS(cmpActors.GetTreasury("ussr"), actorBeforeGrace);
cmpLedger.ApplyInterval(graceDebt);
TS_ASSERT_EQUALS(graceDebt.paymentsMade, 1);
TS_ASSERT_EQUALS(graceDebt.principalOutstanding, 800000);
TS_ASSERT_EQUALS(graceDebt.interestPaid, 80000);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), nationBeforeGrace - 280000);
TS_ASSERT_EQUALS(cmpActors.GetTreasury("ussr"), actorBeforeGrace + 280000);

const odd = cmpLedger.Find(cmpLedger.Create(1, 2, {
	"principal": 1000001,
	"interestRateBps": 0,
	"installments": 5,
	"graceIntervals": 0
}));
treasury(2, 1000001);
cmpLedger.ApplyInterval(odd);
TS_ASSERT_EQUALS(odd.principalOutstanding, 800001);
cmpLedger.ApplyInterval(odd);
cmpLedger.ApplyInterval(odd);
cmpLedger.ApplyInterval(odd);
TS_ASSERT_EQUALS(odd.principalOutstanding, 200001);
cmpLedger.ApplyInterval(odd);
TS_ASSERT_EQUALS(odd.principalOutstanding, 0);
TS_ASSERT_EQUALS(odd.status, "repaid");

const missed = cmpLedger.Find(cmpLedger.Create(ussr, 1, {
	"principal": 1000000,
	"interestRateBps": 400,
	"installments": 5,
	"graceIntervals": 0
}));
treasury(1, 0);
const missedActor = cmpActors.GetTreasury("ussr");
cmpLedger.ApplyInterval(missed);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 0);
TS_ASSERT_EQUALS(cmpActors.GetTreasury("ussr"), missedActor);
TS_ASSERT_EQUALS(missed.missedPayments, 1);
TS_ASSERT_EQUALS(missed.status, "active");
TS_ASSERT_EQUALS(missed.principalOutstanding, 1000000);
TS_ASSERT_EQUALS(missed.principalDue, 200000);
TS_ASSERT_EQUALS(missed.interestDue, 40000);

treasury(1, 10000000);
const heavy = cmpLedger.Burden(1);
const borrowerCheap = cmpEvaluator.EvaluateItem(Object.assign(loanItem(5000000, 400, 5, 0), {
	"provider": ussr,
	"beneficiary": 1
}), 1).utility;
const borrowerCostly = cmpEvaluator.EvaluateItem(Object.assign(loanItem(5000000, 2000, 5, 0), {
	"provider": ussr,
	"beneficiary": 1
}), 1).utility;
TS_ASSERT(borrowerCheap > borrowerCostly);
const borrowerRich = cmpEvaluator.LoanUtility(loanItem(5000000, 400, 5, 0), 20000000, 0, true);
const borrowerPoor = cmpEvaluator.LoanUtility(loanItem(5000000, 400, 5, 0), 100000, 0, true);
TS_ASSERT(borrowerPoor > borrowerRich);
const graceShort = cmpEvaluator.LoanUtility(loanItem(1000000, 400, 5, 0), 2000000, 0, true);
const graceLong = cmpEvaluator.LoanUtility(loanItem(1000000, 400, 5, 2), 2000000, 0, true);
TS_ASSERT(graceLong > graceShort);
const burdened = cmpEvaluator.LoanUtility(loanItem(1000000, 400, 5, 0), 2000000, heavy, true);
const unburdened = cmpEvaluator.LoanUtility(loanItem(1000000, 400, 5, 0), 2000000, 0, true);
TS_ASSERT(unburdened > burdened);

const lenderLow = cmpEvaluator.LoanUtility(loanItem(5000000, 400, 5, 0), 100000000, 0, false);
const lenderHigh = cmpEvaluator.LoanUtility(loanItem(5000000, 2000, 5, 0), 100000000, 0, false);
TS_ASSERT(lenderHigh > lenderLow);
const lenderSoon = cmpEvaluator.LoanUtility(loanItem(5000000, 400, 5, 0), 8000000, 0, false);
const lenderLate = cmpEvaluator.LoanUtility(loanItem(5000000, 400, 5, 2), 8000000, 0, false);
TS_ASSERT(lenderSoon > lenderLate);

const forgiveDebt = cmpLedger.Find(cmpLedger.Create(ussr, 1, {
	"principal": 5000000,
	"interestRateBps": 400,
	"installments": 5,
	"graceIntervals": 0
}));
const forgiveItem = {
	"type": "debt_forgiveness",
	"debtId": forgiveDebt.id,
	"amount": 1500000,
	"provider": ussr,
	"beneficiary": 1
};
const debtorRelief = cmpEvaluator.EvaluateItem(forgiveItem, 1).utility;
const creditorCost = cmpEvaluator.EvaluateItem(forgiveItem, ussr).utility;
TS_ASSERT(debtorRelief > 0);
TS_ASSERT_EQUALS(creditorCost, -debtorRelief);
const smallerRelief = cmpEvaluator.EvaluateItem(Object.assign({}, forgiveItem, { "amount": 500000 }), 1).utility;
TS_ASSERT(debtorRelief > smallerRelief);

const actorBeforeForgive = cmpActors.GetTreasury("ussr");
const nationBeforeForgive = cmpFinance.GetTreasury(1);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, ussr, [], [{
	"type": "debt_forgiveness",
	"debtId": forgiveDebt.id,
	"amount": 6000000
}]), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(2, ussr, [{
	"type": "debt_forgiveness",
	"debtId": forgiveDebt.id,
	"amount": 100000
}], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [], [{
	"type": "debt_forgiveness",
	"debtId": forgiveDebt.id,
	"amount": 100000
}]), 0);
const forgiveId = cmpAgreements.Propose(1, ussr, [], [{
	"type": "debt_forgiveness",
	"debtId": forgiveDebt.id,
	"amount": 1500000
}]);
TS_ASSERT_EQUALS(cmpAgreements.Accept(ussr, forgiveId), true);
TS_ASSERT_EQUALS(forgiveDebt.principalOutstanding, 3500000);
TS_ASSERT_EQUALS(cmpActors.GetTreasury("ussr"), actorBeforeForgive);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), nationBeforeForgive);

const nationCash = cmpFinance.GetTreasury(1);
const actorCash = cmpActors.GetTreasury("ussr");
const composed = cmpAgreements.Propose(1, ussr, [
	{ "type": "cash", "amount": 100000 }
], [{
	"type": "debt_forgiveness",
	"debtId": forgiveDebt.id,
	"amount": 500000
}]);
treasury(1, 0);
TS_ASSERT_EQUALS(cmpAgreements.Accept(ussr, composed), false);
TS_ASSERT_EQUALS(forgiveDebt.principalOutstanding, 3500000);
TS_ASSERT_EQUALS(cmpActors.GetTreasury("ussr"), actorCash);
treasury(1, nationCash);
const composedAgain = cmpAgreements.Propose(1, ussr, [
	{ "type": "cash", "amount": 100000 }
], [{
	"type": "debt_forgiveness",
	"debtId": forgiveDebt.id,
	"amount": 500000
}]);
TS_ASSERT_EQUALS(cmpAgreements.Accept(ussr, composedAgain), true);
TS_ASSERT_EQUALS(forgiveDebt.principalOutstanding, 3000000);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), nationCash - 100000);
TS_ASSERT_EQUALS(cmpActors.GetTreasury("ussr"), actorCash + 100000);

const acceptedLoan = cmpAgreements.Propose(1, ussr, [], [
	loanItem(5000000, 2000, 5, 0)
]);
const beforeNation = cmpFinance.GetTreasury(1);
const beforeActor = cmpActors.GetTreasury("ussr");
const beforeCount = cmpLedger.GetDebts().length;
cmpTimer.OnUpdate({ "turnLength": 1 });
const accepted = cmpAgreements.Find(acceptedLoan);
TS_ASSERT_EQUALS(accepted.status, "accepted");
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), beforeNation + 5000000);
TS_ASSERT_EQUALS(cmpActors.GetTreasury("ussr"), beforeActor - 5000000);
TS_ASSERT_EQUALS(cmpLedger.GetDebts().length, beforeCount + 1);
const created = cmpLedger.GetDebts()[cmpLedger.GetDebts().length - 1];
TS_ASSERT_EQUALS(created.principalOutstanding, 5000000);
TS_ASSERT(NationSameParticipant(created.creditor, ussr));
TS_ASSERT_EQUALS(created.debtor, 1);
cmpAI.Respond(acceptedLoan);
TS_ASSERT_EQUALS(cmpLedger.GetDebts().length, beforeCount + 1);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), beforeNation + 5000000);

treasury(1, 10000000);
setActorTreasury(100000000);
const countered = cmpAgreements.Propose(1, ussr, [], [
	loanItem(5000000, 400, 5, 1)
]);
const moderate = cmpEvaluator.EvaluateProposal(countered, ussr);
TS_ASSERT_EQUALS(moderate.decision, "counter");
const debtsBeforeCounter = cmpLedger.GetDebts().length;
cmpTimer.OnUpdate({ "turnLength": 1 });
TS_ASSERT_EQUALS(cmpAgreements.Find(countered).status, "countered");
TS_ASSERT_EQUALS(cmpLedger.GetDebts().length, debtsBeforeCounter);
TS_ASSERT_EQUALS(cmpActors.GetTreasury("ussr"), 100000000);
const counter = cmpAgreements.GetProposals().filter(item => item.parentProposal === countered)[0];
TS_ASSERT(counter);
TS_ASSERT(NationSameParticipant(counter.proposer, ussr));
TS_ASSERT_EQUALS(counter.recipient, 1);
const counterScore = cmpEvaluator.EvaluateProposal(counter.id, ussr);
TS_ASSERT(counterScore.totalUtility >= cmpEvaluator.AcceptAt);

const serialDebt = cmpLedger.Find(cmpLedger.Create(ussr, 1, {
	"principal": 1000000,
	"interestRateBps": 400,
	"installments": 5,
	"graceIntervals": 0
}));
treasury(1, 0);
const serialActor = cmpActors.GetTreasury("ussr");
const serialSequence = serialDebt.sequence;
const restoredLedger = SerializationCycle(cmpLedger);
const restoredActors = SerializationCycle(cmpActors);
restoredLedger.ServiceDebt({ "id": serialDebt.id, "sequence": serialSequence });
const afterMiss = restoredLedger.Find(serialDebt.id);
TS_ASSERT_EQUALS(afterMiss.missedPayments, 1);
TS_ASSERT_EQUALS(afterMiss.principalOutstanding, 1000000);
TS_ASSERT_EQUALS(restoredActors.GetTreasury("ussr"), serialActor);
restoredLedger.ServiceDebt({ "id": serialDebt.id, "sequence": serialSequence });
TS_ASSERT_EQUALS(restoredLedger.Find(serialDebt.id).missedPayments, 1);
TS_ASSERT_EQUALS(restoredActors.GetTreasury("ussr"), serialActor);

const waiting = cmpAgreements.Propose(1, ussr, [], [
	loanItem(5000000, 2000, 5, 0)
]);
const restoredAI = SerializationCycle(cmpAI);
TS_ASSERT_EQUALS(restoredAI.answered[waiting], undefined);
const actorAtWait = cmpActors.GetTreasury("ussr");
const debtsAtWait = cmpLedger.GetDebts().length;
cmpTimer.OnUpdate({ "turnLength": 1 });
TS_ASSERT_EQUALS(cmpAgreements.Find(waiting).status, "accepted");
restoredAI.Respond(waiting);
TS_ASSERT_EQUALS(cmpLedger.GetDebts().length, debtsAtWait + 1);
TS_ASSERT_EQUALS(cmpActors.GetTreasury("ussr"), actorAtWait - 5000000);
cmpAgreements.Accept(ussr, waiting);
TS_ASSERT_EQUALS(cmpActors.GetTreasury("ussr"), actorAtWait - 5000000);
