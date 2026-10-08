Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/GovernmentFinance.js");
Engine.LoadComponentScript("interfaces/DiplomaticAccess.js");
Engine.LoadComponentScript("interfaces/TradeAccess.js");
Engine.LoadComponentScript("interfaces/AgreementManager.js");
Engine.LoadComponentScript("interfaces/TradeContractManager.js");
Engine.LoadComponentScript("GovernmentFinance.js");
Engine.LoadComponentScript("DiplomaticAccess.js");
Engine.LoadComponentScript("TradeAccess.js");

const g_Codes = ["food", "wood", "stone", "metal"];
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
		"food": 0,
		"wood": 0,
		"stone": 0,
		"metal": 0
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
		}
	};
}

g_Players[1] = makePlayer();
g_Players[2] = makePlayer();

global.g_Commands = {};
Engine.LoadComponentScript("AgreementManager.js");

const cmpFinance = ConstructComponent(SYSTEM_ENTITY, "GovernmentFinance");
const cmpAccess = ConstructComponent(SYSTEM_ENTITY, "DiplomaticAccess");
const cmpTrade = ConstructComponent(SYSTEM_ENTITY, "TradeAccess");
const cmpAgreements = ConstructComponent(SYSTEM_ENTITY, "AgreementManager");

function stock(player, counts)
{
	g_Players[player].SetResourceCounts(counts);
}

function treasury(player, amount)
{
	const current = cmpFinance.GetTreasury(player);
	if (current > amount)
		cmpFinance.Spend(player, current - amount);
	else if (amount > current)
		cmpFinance.AddFunds(player, amount - current);
}

function resetBalances()
{
	stock(1, {
		"food": 1000,
		"wood": 500,
		"stone": 400,
		"metal": 200
	});
	stock(2, {
		"food": 100,
		"wood": 50,
		"stone": 40,
		"metal": 600
	});
	treasury(1, 1000000);
	treasury(2, 200000);
	cmpAccess.grants = [];
	cmpTrade.grants = [];
}

function unchanged()
{
	TS_ASSERT_EQUALS(g_Players[1].stock.food, 1000);
	TS_ASSERT_EQUALS(g_Players[1].stock.wood, 500);
	TS_ASSERT_EQUALS(g_Players[1].stock.stone, 400);
	TS_ASSERT_EQUALS(g_Players[1].stock.metal, 200);
	TS_ASSERT_EQUALS(g_Players[2].stock.food, 100);
	TS_ASSERT_EQUALS(g_Players[2].stock.wood, 50);
	TS_ASSERT_EQUALS(g_Players[2].stock.stone, 40);
	TS_ASSERT_EQUALS(g_Players[2].stock.metal, 600);
	TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 1000000);
	TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), 200000);
	TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(2, 1), false);
	TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(1, 2), false);
	TS_ASSERT_EQUALS(cmpTrade.CanTrade(1, 2), false);
	TS_ASSERT_EQUALS(cmpTrade.CanTrade(2, 1), false);
}

resetBalances();

TS_ASSERT_EQUALS(cmpAgreements.Propose(0, 2, [{ "type": "cash", "amount": 1 }], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 9, [{ "type": "cash", "amount": 1 }], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 1, [{ "type": "cash", "amount": 1 }], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [{ "type": "loan", "amount": 1 }], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [{ "type": "resource", "resource": "spice", "amount": 1 }], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [{ "type": "resource", "resource": "food", "amount": 0 }], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [{ "type": "resource", "resource": "food", "amount": -5 }], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [{ "type": "cash", "amount": NaN }], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [{ "type": "cash", "amount": Infinity }], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [{ "type": "resource", "resource": "metal", "amount": 300 }], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.GetProposals().length, 0);
unchanged();

const codes = ["food", "wood", "stone", "metal"];
for (let i = 0; i < codes.length; ++i)
{
	resetBalances();
	const code = codes[i];
	g_Players[1].stock[code] = 1000;
	g_Players[2].stock[code] = 100;
	const id = cmpAgreements.Propose(1, 2, [{ "type": "resource", "resource": code, "amount": 250 }], []);
	TS_ASSERT(id > 0);
	TS_ASSERT_EQUALS(g_Players[1].stock[code], 1000);
	TS_ASSERT_EQUALS(cmpAgreements.Accept(2, id), true);
	TS_ASSERT_EQUALS(g_Players[1].stock[code], 750);
	TS_ASSERT_EQUALS(g_Players[2].stock[code], 350);
	TS_ASSERT_EQUALS(cmpAgreements.Accept(2, id), false);
	TS_ASSERT_EQUALS(g_Players[1].stock[code], 750);
}

resetBalances();
const cashId = cmpAgreements.Propose(1, 2, [{ "type": "cash", "amount": 300000 }], []);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 1000000);
TS_ASSERT_EQUALS(cmpAgreements.Accept(2, cashId), true);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 700000);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), 500000);

resetBalances();
const composed = {
	"offer": [
		{ "type": "resource", "resource": "food", "amount": 500 },
		{ "type": "resource", "resource": "wood", "amount": 100 },
		{ "type": "cash", "amount": 250000 },
		{ "type": "military_access" }
	],
	"request": [
		{ "type": "resource", "resource": "metal", "amount": 300 },
		{ "type": "trade_access" }
	]
};
const composedId = cmpAgreements.Propose(1, 2, composed.offer, composed.request);
TS_ASSERT(composedId > 0);
unchanged();
const pending = cmpAgreements.GetProposals().find(proposal => proposal.id === composedId);
TS_ASSERT_EQUALS(pending.status, "pending");
TS_ASSERT_EQUALS(pending.offer.length, 4);
TS_ASSERT_EQUALS(pending.request[0].provider, 2);
TS_ASSERT_EQUALS(pending.request[0].beneficiary, 1);
TS_ASSERT_EQUALS(pending.offer[3].type, "military_access");
TS_ASSERT_EQUALS(pending.offer[3].provider, 1);
TS_ASSERT_EQUALS(pending.offer[3].beneficiary, 2);

TS_ASSERT_EQUALS(cmpAgreements.Accept(1, composedId), false);
unchanged();
TS_ASSERT_EQUALS(cmpAgreements.Accept(2, composedId), true);
TS_ASSERT_EQUALS(g_Players[1].stock.food, 500);
TS_ASSERT_EQUALS(g_Players[1].stock.wood, 400);
TS_ASSERT_EQUALS(g_Players[1].stock.metal, 500);
TS_ASSERT_EQUALS(g_Players[2].stock.food, 600);
TS_ASSERT_EQUALS(g_Players[2].stock.wood, 150);
TS_ASSERT_EQUALS(g_Players[2].stock.metal, 300);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 750000);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), 450000);
TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(2, 1), true);
TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(1, 2), false);
TS_ASSERT_EQUALS(cmpTrade.CanTrade(1, 2), true);
TS_ASSERT_EQUALS(cmpTrade.CanTrade(2, 1), false);
TS_ASSERT_EQUALS(cmpAgreements.Accept(2, composedId), false);
TS_ASSERT_EQUALS(g_Players[1].stock.food, 500);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 750000);

resetBalances();
const failingId = cmpAgreements.Propose(1, 2, composed.offer, composed.request);
g_Players[2].stock.metal = 100;
TS_ASSERT_EQUALS(cmpAgreements.Accept(2, failingId), false);
TS_ASSERT_EQUALS(cmpAgreements.Find(failingId).status, "invalidated");
TS_ASSERT_EQUALS(g_Players[1].stock.food, 1000);
TS_ASSERT_EQUALS(g_Players[1].stock.wood, 500);
TS_ASSERT_EQUALS(g_Players[2].stock.food, 100);
TS_ASSERT_EQUALS(g_Players[2].stock.wood, 50);
TS_ASSERT_EQUALS(g_Players[2].stock.metal, 100);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 1000000);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), 200000);
TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(2, 1), false);
TS_ASSERT_EQUALS(cmpTrade.CanTrade(1, 2), false);
TS_ASSERT_EQUALS(cmpAgreements.Accept(2, failingId), false);
TS_ASSERT_EQUALS(g_Players[1].stock.food, 1000);

resetBalances();
const foodId = cmpAgreements.Propose(1, 2, [{ "type": "resource", "resource": "food", "amount": 500 }], []);
TS_ASSERT_EQUALS(g_Players[1].stock.food, 1000);
g_Players[1].stock.food = 300;
TS_ASSERT_EQUALS(cmpAgreements.Accept(2, foodId), false);
TS_ASSERT_EQUALS(cmpAgreements.Find(foodId).status, "invalidated");
TS_ASSERT_EQUALS(g_Players[1].stock.food, 300);
TS_ASSERT_EQUALS(g_Players[2].stock.food, 100);

resetBalances();
g_Players[1].stock.food = 300;
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [
	{ "type": "resource", "resource": "food", "amount": 200 },
	{ "type": "resource", "resource": "food", "amount": 200 }
], []), 0);
g_Players[1].stock.food = 1000;
const mergedId = cmpAgreements.Propose(1, 2, [
	{ "type": "resource", "resource": "food", "amount": 100 },
	{ "type": "resource", "resource": "food", "amount": 200 }
], []);
TS_ASSERT_EQUALS(cmpAgreements.Find(mergedId).offer[0].amount, 300);
g_Players[1].stock.food = 250;
TS_ASSERT_EQUALS(cmpAgreements.Accept(2, mergedId), false);
TS_ASSERT_EQUALS(g_Players[1].stock.food, 250);
TS_ASSERT_EQUALS(g_Players[2].stock.food, 100);

resetBalances();
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [
	{ "type": "cash", "amount": 600000 },
	{ "type": "cash", "amount": 500000 }
], []), 0);
const cashMerged = cmpAgreements.Propose(1, 2, [
	{ "type": "cash", "amount": 100000 },
	{ "type": "cash", "amount": 200000 }
], []);
TS_ASSERT_EQUALS(cmpAgreements.Find(cashMerged).offer[0].amount, 300000);
g_Players[1].stock.food = 1000;
cmpFinance.Spend(1, 800000);
TS_ASSERT_EQUALS(cmpAgreements.Accept(2, cashMerged), false);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 200000);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), 200000);

resetBalances();
cmpAccess.GrantMilitaryAccess(2, 1);
cmpTrade.GrantTrade(1, 2);
TS_ASSERT_EQUALS(cmpAccess.grants.length, 1);
TS_ASSERT_EQUALS(cmpTrade.grants.length, 1);
const againId = cmpAgreements.Propose(1, 2, [{ "type": "military_access" }], [{ "type": "trade_access" }]);
TS_ASSERT_EQUALS(cmpAgreements.Accept(2, againId), true);
TS_ASSERT_EQUALS(cmpAccess.grants.length, 1);
TS_ASSERT_EQUALS(cmpTrade.grants.length, 1);
TS_ASSERT_EQUALS(cmpAccess.HasMilitaryAccess(2, 1), true);
TS_ASSERT_EQUALS(cmpTrade.CanTrade(1, 2), true);

resetBalances();
const rejectId = cmpAgreements.Propose(1, 2, [{ "type": "cash", "amount": 1 }], []);
TS_ASSERT_EQUALS(cmpAgreements.Reject(1, rejectId), true);
TS_ASSERT_EQUALS(cmpAgreements.Accept(2, rejectId), false);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 1000000);

resetBalances();
const commandId = g_Commands["nation-propose-agreement"](1, {
	"recipient": 2,
	"offer": [{ "type": "resource", "resource": "stone", "amount": 100 }],
	"request": []
});
TS_ASSERT_EQUALS(commandId, undefined);
const stored = cmpAgreements.GetProposals()[cmpAgreements.GetProposals().length - 1];
TS_ASSERT_EQUALS(stored.status, "pending");
TS_ASSERT_EQUALS(g_Players[1].stock.stone, 400);
g_Commands["nation-accept-agreement"](2, { "id": stored.id });
TS_ASSERT_EQUALS(g_Players[1].stock.stone, 300);
TS_ASSERT_EQUALS(g_Players[2].stock.stone, 140);
g_Commands["nation-accept-agreement"](2, { "id": stored.id });
TS_ASSERT_EQUALS(g_Players[1].stock.stone, 300);

resetBalances();
const serialId = cmpAgreements.Propose(1, 2, [{ "type": "resource", "resource": "wood", "amount": 100 }], []);
const saved = cmpAgreements.Find(serialId);
const restored = SerializationCycle(cmpAgreements);
TS_ASSERT_EQUALS(restored.Find(serialId).id, serialId);
TS_ASSERT_EQUALS(restored.Find(serialId).status, "pending");
TS_ASSERT_EQUALS(restored.Find(serialId).offer[0].resource, "wood");
TS_ASSERT_EQUALS(restored.Find(serialId).offer[0].amount, 100);
TS_ASSERT_EQUALS(g_Players[1].stock.wood, 500);
TS_ASSERT_EQUALS(restored.Accept(2, serialId), true);
TS_ASSERT_EQUALS(g_Players[1].stock.wood, 400);
TS_ASSERT_EQUALS(g_Players[2].stock.wood, 150);
const accepted = SerializationCycle(restored);
TS_ASSERT_EQUALS(accepted.Find(serialId).status, "accepted");
TS_ASSERT_EQUALS(accepted.Accept(2, serialId), false);
TS_ASSERT_EQUALS(g_Players[1].stock.wood, 400);
TS_ASSERT_EQUALS(saved.status, "accepted");

const createdSales = [];
AddMock(SYSTEM_ENTITY, IID_TradeContractManager, {
	KnownResource: code => ["food", "wood", "stone", "metal"].indexOf(code) !== -1,
	Create: (proposalId, sale) =>
	{
		createdSales.push({ proposalId, sale });
		return createdSales.length;
	},
	Drop: () => {}
});
for (const code of ["food", "wood", "stone", "metal"])
{
	const sale = cmpAgreements.Normalize(1, 2, [{
		type: "resource_sale", resource: code, quantity: 150, totalPrice: 300
	}], []);
	TS_ASSERT(sale);
	TS_ASSERT_EQUALS(sale.offer[0].resource, code);
	TS_ASSERT_EQUALS(sale.offer[0].quantity, 150);
}
for (const code of ["food", "wood", "stone", "metal"])
{
	resetBalances();
	const sellerBefore = g_Players[1].stock[code];
	const buyerBefore = g_Players[2].stock[code];
	const sellerTreasury = cmpFinance.GetTreasury(1);
	const buyerTreasury = cmpFinance.GetTreasury(2);
	const id = cmpAgreements.Propose(1, 2, [{
		type: "resource_sale", resource: code, quantity: 150, totalPrice: 300
	}], []);
	TS_ASSERT(id > 0);
	TS_ASSERT_EQUALS(cmpAgreements.Accept(2, id), true);
	TS_ASSERT_EQUALS(createdSales[createdSales.length - 1].proposalId, id);
	TS_ASSERT_EQUALS(createdSales[createdSales.length - 1].sale.resource, code);
	TS_ASSERT_EQUALS(g_Players[1].stock[code], sellerBefore);
	TS_ASSERT_EQUALS(g_Players[2].stock[code], buyerBefore);
	TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), sellerTreasury);
	TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), buyerTreasury);
}
TS_ASSERT_EQUALS(cmpAgreements.Normalize(1, 2, [{
	type: "commodity_sale", commodity: "cocoa", quantity: 150, totalPrice: 300
}], []), null);
