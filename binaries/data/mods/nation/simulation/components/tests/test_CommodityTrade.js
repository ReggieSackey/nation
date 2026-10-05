Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/GovernmentFinance.js");
Engine.LoadComponentScript("interfaces/DiplomaticAccess.js");
Engine.LoadComponentScript("interfaces/TradeAccess.js");
Engine.LoadComponentScript("interfaces/CommodityProducer.js");
Engine.LoadComponentScript("interfaces/CommodityInventory.js");
Engine.LoadComponentScript("interfaces/CommodityExportManager.js");
Engine.LoadComponentScript("interfaces/TransportEfficiency.js");
Engine.LoadComponentScript("interfaces/SettlementConnectivity.js");
Engine.LoadComponentScript("interfaces/TradeContractManager.js");
Engine.LoadComponentScript("interfaces/AgreementManager.js");
Engine.LoadComponentScript("interfaces/AgreementEvaluator.js");
Engine.LoadComponentScript("interfaces/AgreementAI.js");
Engine.LoadComponentScript("interfaces/ForeignActorManager.js");
Engine.LoadComponentScript("interfaces/Market.js");
Engine.LoadComponentScript("interfaces/Health.js");
Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.RegisterInterface("Ownership");
Engine.RegisterInterface("Position");
Engine.LoadComponentScript("GovernmentFinance.js");
Engine.LoadComponentScript("TradeAccess.js");
Engine.LoadComponentScript("CommodityProducer.js");
Engine.LoadComponentScript("CommodityInventory.js");
Engine.LoadComponentScript("CommodityExportManager.js");
Engine.LoadComponentScript("TransportEfficiency.js");
Engine.LoadComponentScript("TradeContractManager.js");
Engine.LoadComponentScript("ForeignActorManager.js");
Engine.LoadComponentScript("AgreementManager.js");
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

let g_Hop = 100;
AddMock(SYSTEM_ENTITY, IID_SettlementConnectivity, {
	"GetPathToCapital": () => [33, 30],
	"GetHopCondition": () => g_Hop
});
AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
	"GetSovereignOwner": pos => pos.x <= 256 ? 1 : 2
});

const g_Producers = [33];
const g_Markets = [80, 81];
Engine.GetEntitiesWithInterface = function(iid)
{
	if (iid === IID_CommodityProducer)
		return g_Producers.slice();
	if (iid === IID_Market)
		return g_Markets.slice();
	return [];
};

function makePlayer()
{
	const stock = {
		"food": 0,
		"wood": 0,
		"stone": 0,
		"metal": 0,
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
		"TrySubtractResources": () => true,
		"AddResource": () => {}
	};
}

g_Players[1] = makePlayer();
g_Players[2] = makePlayer();

AddMock(33, IID_Position, {
	"IsInWorld": () => true,
	"GetPosition2D": () => ({ "x": 100, "y": 100 })
});
AddMock(80, IID_Market, {});
AddMock(80, IID_Ownership, { "GetOwner": () => 1 });
AddMock(81, IID_Market, {});
AddMock(81, IID_Ownership, { "GetOwner": () => 2 });

let g_TraderHp = 100;
let g_BuyerHp = 100;
AddMock(82, IID_Health, { "GetHitpoints": () => g_TraderHp });
AddMock(81, IID_Health, { "GetHitpoints": () => g_BuyerHp });

const cmpTimer = ConstructComponent(SYSTEM_ENTITY, "Timer");
const cmpFinance = ConstructComponent(SYSTEM_ENTITY, "GovernmentFinance");
const cmpTrade = ConstructComponent(SYSTEM_ENTITY, "TradeAccess");
let cmpInventory = ConstructComponent(SYSTEM_ENTITY, "CommodityInventory");
const cmpTransport = ConstructComponent(SYSTEM_ENTITY, "TransportEfficiency");
let cmpContracts = ConstructComponent(SYSTEM_ENTITY, "TradeContractManager");
const cmpExport = ConstructComponent(SYSTEM_ENTITY, "CommodityExportManager");
const cmpActors = ConstructComponent(SYSTEM_ENTITY, "ForeignActorManager");
const cmpAgreements = ConstructComponent(SYSTEM_ENTITY, "AgreementManager");
const cmpEvaluator = ConstructComponent(SYSTEM_ENTITY, "AgreementEvaluator");
const cmpAI = ConstructComponent(SYSTEM_ENTITY, "AgreementAI");
let producer = ConstructComponent(33, "CommodityProducer", {
	"Commodity": "cocoa",
	"ProductionPerTick": "100",
	"Stock": "0"
});

cmpActors.ReadActors([{
	"id": "ussr",
	"name": "Soviet Union",
	"type": "foreign_power",
	"treasury": 100000000,
	"responds": true
}]);
cmpAI.responders = [2];

function treasury(player, amount)
{
	const current = cmpFinance.GetTreasury(player);
	if (current > amount)
		cmpFinance.Spend(player, current - amount);
	else if (amount > current)
		cmpFinance.AddFunds(player, amount - current);
}

function resetGoods()
{
	producer.stock = 0;
	cmpInventory.held = {};
	g_Hop = 100;
	g_TraderHp = 100;
	g_BuyerHp = 100;
	g_Markets.length = 0;
	g_Markets.push(80, 81);
	cmpTrade.grants = [];
	cmpTrade.GrantTrade(2, 1);
	cmpContracts.LotSize = 100;
	treasury(1, 10000000);
	treasury(2, 5000000);
}

function sale(quantity, price)
{
	return {
		"type": "commodity_sale",
		"commodity": "cocoa",
		"quantity": quantity,
		"totalPrice": price
	};
}

function acceptSale(quantity, price, withAccess)
{
	resetGoods();
	const offer = [sale(quantity, price)];
	if (withAccess)
	{
		cmpTrade.grants = [];
		offer.push({ "type": "trade_access" });
	}
	const id = cmpAgreements.Propose(1, 2, offer, []);
	TS_ASSERT(id > 0);
	TS_ASSERT(cmpAgreements.Accept(2, id));
	const contracts = cmpContracts.GetContracts();
	return contracts[contracts.length - 1];
}

resetGoods();

// Validation.
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [sale(500, 1000000)], []), cmpAgreements.GetProposals().length > 0 ? cmpAgreements.GetProposals()[cmpAgreements.GetProposals().length - 1].id : 0);
const validId = cmpAgreements.GetProposals()[cmpAgreements.GetProposals().length - 1].id;
TS_ASSERT(validId > 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [{
	"type": "commodity_sale",
	"commodity": "coffee",
	"quantity": 10,
	"totalPrice": 10
}], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [sale(0, 10)], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [sale(-5, 10)], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [sale(10, 0)], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, 2, [sale(10, -5)], []), 0);
TS_ASSERT_EQUALS(cmpAgreements.Propose(1, { "type": "foreign_actor", "id": "ussr" }, [sale(10, 10)], []), 0);

const beforeContracts = cmpContracts.GetContracts().length;
const cocoaBefore = cmpInventory.GetStock(1, "cocoa");
const treasuryBefore = cmpFinance.GetTreasury(1);
TS_ASSERT(cmpAgreements.Accept(2, validId));
TS_ASSERT_EQUALS(cmpContracts.GetContracts().length, beforeContracts + 1);
TS_ASSERT_EQUALS(cmpInventory.GetStock(1, "cocoa"), cocoaBefore);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), treasuryBefore);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), 5000000);
const first = cmpContracts.GetContracts()[beforeContracts];
const second = acceptSale(200, 400000);
TS_ASSERT_EQUALS(second.id, first.id + 1);

// Delivery of one lot.
const contract = acceptSale(500, 1000000);
producer.stock = 500;
TS_ASSERT(cmpContracts.Assign(1, contract.id, 82, 80, 81));
const delivered = cmpContracts.TryDeliver(contract.id);
TS_ASSERT_EQUALS(delivered.delivered, 100);
TS_ASSERT_EQUALS(delivered.paid, 200000);
TS_ASSERT_EQUALS(producer.GetStock(), 400);
TS_ASSERT_EQUALS(cmpInventory.GetStock(2, "cocoa"), 100);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), 4800000);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 10200000);
TS_ASSERT_EQUALS(cmpContracts.Find(contract.id).quantityDelivered, 100);
TS_ASSERT_EQUALS(cmpContracts.Find(contract.id).status, "active");

// Partial supply.
const partial = acceptSale(500, 1000000);
producer.stock = 40;
cmpContracts.Assign(1, partial.id, 82, 80, 81);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(partial.id).delivered, 40);
TS_ASSERT_EQUALS(producer.GetStock(), 0);
TS_ASSERT_EQUALS(cmpInventory.GetStock(2, "cocoa"), 40);
TS_ASSERT_EQUALS(cmpContracts.Find(partial.id).quantityDelivered, 40);
TS_ASSERT_EQUALS(cmpContracts.Find(partial.id).status, "active");

// No cocoa.
const empty = acceptSale(500, 1000000);
producer.stock = 0;
cmpContracts.Assign(1, empty.id, 82, 80, 81);
const none = cmpContracts.TryDeliver(empty.id);
TS_ASSERT_EQUALS(none.delivered, 0);
TS_ASSERT_EQUALS(none.paid, 0);
TS_ASSERT_EQUALS(cmpContracts.Find(empty.id).status, "active");

// Rounding closes exactly.
const tiny = acceptSale(3, 100);
producer.stock = 3;
cmpContracts.LotSize = 1;
cmpContracts.Assign(1, tiny.id, 82, 80, 81);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(tiny.id).paid, 33);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(tiny.id).paid, 33);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(tiny.id).paid, 34);
TS_ASSERT_EQUALS(cmpContracts.Find(tiny.id).amountPaid, 100);
TS_ASSERT_EQUALS(cmpContracts.Find(tiny.id).quantityDelivered, 3);
TS_ASSERT_EQUALS(cmpContracts.Find(tiny.id).status, "fulfilled");
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(tiny.id).delivered, 0);

// Buyer cannot pay.
const broke = acceptSale(500, 1000000);
producer.stock = 500;
treasury(2, 10);
cmpContracts.Assign(1, broke.id, 82, 80, 81);
const blocked = cmpContracts.TryDeliver(broke.id);
TS_ASSERT_EQUALS(blocked.delivered, 0);
TS_ASSERT_EQUALS(blocked.paid, 0);
TS_ASSERT_EQUALS(producer.GetStock(), 500);
TS_ASSERT_EQUALS(cmpInventory.GetStock(2, "cocoa"), 0);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), 10);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 10000000);
TS_ASSERT_EQUALS(cmpContracts.Find(broke.id).status, "blocked");
treasury(2, 5000000);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(broke.id).delivered, 100);
TS_ASSERT_EQUALS(cmpContracts.Find(broke.id).status, "active");

// Access.
const gated = acceptSale(500, 1000000);
producer.stock = 500;
cmpContracts.Assign(1, gated.id, 82, 80, 81);
cmpTrade.RevokeTrade(2, 1);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(gated.id).reason, "no_access");
TS_ASSERT_EQUALS(producer.GetStock(), 500);
TS_ASSERT_EQUALS(cmpContracts.Find(gated.id).status, "active");
cmpTrade.GrantTrade(2, 1);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(gated.id).delivered, 100);
cmpTrade.RevokeTrade(2, 1);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(gated.id).delivered, 0);
TS_ASSERT_EQUALS(cmpContracts.Find(gated.id).quantityDelivered, 100);
TS_ASSERT_EQUALS(cmpContracts.Find(gated.id).status, "active");

// Same package creates the right and the contract, and moves nothing yet.
const packaged = acceptSale(500, 1000000, true);
TS_ASSERT(cmpTrade.CanTrade(2, 1));
TS_ASSERT_EQUALS(cmpInventory.GetStock(1, "cocoa"), 0);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 10000000);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), 5000000);
producer.stock = 100;
cmpContracts.Assign(1, packaged.id, 82, 80, 81);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(packaged.id).delivered, 100);

// Infrastructure scales the lot. A dead corridor moves nothing.
const road = acceptSale(500, 1000000);
producer.stock = 500;
cmpContracts.Assign(1, road.id, 82, 80, 81);
TS_ASSERT_EQUALS(cmpTransport.GetRouteCondition(33), 100);
TS_ASSERT_EQUALS(cmpContracts.LotCapacity(1, "cocoa"), 100);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(road.id).delivered, 100);
g_Hop = 50;
TS_ASSERT_EQUALS(cmpContracts.LotCapacity(1, "cocoa"), 50);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(road.id).delivered, 50);
g_Hop = 0;
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(road.id).delivered, 0);
TS_ASSERT_EQUALS(cmpContracts.Find(road.id).status, "active");
g_Hop = 100;
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(road.id).delivered, 100);

// Dead trader and a destroyed market leave the contract.
const fragile = acceptSale(500, 1000000);
producer.stock = 500;
cmpContracts.Assign(1, fragile.id, 82, 80, 81);
g_TraderHp = 0;
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(fragile.id).reason, "no_trader");
TS_ASSERT_EQUALS(cmpContracts.Find(fragile.id).status, "active");
g_TraderHp = 100;
g_BuyerHp = 0;
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(fragile.id).reason, "no_endpoint");
TS_ASSERT_EQUALS(cmpContracts.Find(fragile.id).quantityDelivered, 0);
g_BuyerHp = 100;
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(fragile.id).delivered, 100);

// Completion.
const done = acceptSale(100, 200000);
producer.stock = 100;
cmpContracts.Assign(1, done.id, 82, 80, 81);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(done.id).delivered, 100);
TS_ASSERT_EQUALS(cmpContracts.Find(done.id).quantityDelivered, 100);
TS_ASSERT_EQUALS(cmpContracts.Find(done.id).amountPaid, 200000);
TS_ASSERT_EQUALS(cmpContracts.Find(done.id).status, "fulfilled");
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(done.id).delivered, 0);
TS_ASSERT_EQUALS(producer.GetStock(), 0);

// World buyer does not take cocoa that an open contract still claims.
for (let i = 0; i < cmpContracts.contracts.length; ++i)
	if (cmpContracts.contracts[i].status !== "fulfilled")
		cmpContracts.contracts[i].status = "fulfilled";
const reserved = acceptSale(500, 1000000);
producer.stock = 80;
cmpExport.ApplyExports();
TS_ASSERT_EQUALS(producer.GetStock(), 80);
TS_ASSERT_EQUALS(cmpExport.GetTotalExported(1, "cocoa"), 0);
cmpContracts.Drop(reserved.id);
g_Hop = 100;
cmpExport.ApplyExports();
TS_ASSERT_EQUALS(producer.GetStock(), 0);
TS_ASSERT_EQUALS(cmpExport.GetTotalExported(1, "cocoa"), 80);

// Serialization does not repeat a delivery.
const saved = acceptSale(500, 1000000);
producer.stock = 300;
cmpContracts.Assign(1, saved.id, 82, 80, 81);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(saved.id).delivered, 100);
const paidOnce = cmpContracts.Find(saved.id).amountPaid;
cmpContracts = SerializationCycle(cmpContracts);
cmpInventory = SerializationCycle(cmpInventory);
producer = SerializationCycle(producer);
TS_ASSERT_EQUALS(cmpContracts.Find(saved.id).quantityDelivered, 100);
TS_ASSERT_EQUALS(cmpContracts.Find(saved.id).amountPaid, paidOnce);
TS_ASSERT_EQUALS(cmpContracts.Find(saved.id).trader, 82);
TS_ASSERT_EQUALS(cmpInventory.GetStock(2, "cocoa"), 100);
TS_ASSERT_EQUALS(producer.GetStock(), 200);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(saved.id).delivered, 100);
TS_ASSERT_EQUALS(cmpContracts.Find(saved.id).quantityDelivered, 200);

// Valuation.
function proposal(quantity, price, access)
{
	const offer = [sale(quantity, price)];
	if (access)
		offer.push({ "type": "trade_access" });
	offer[0].provider = 1;
	offer[0].beneficiary = 2;
	if (access)
	{
		offer[1].provider = 1;
		offer[1].beneficiary = 2;
	}
	return { "offer": offer, "request": [] };
}

resetGoods();
producer.stock = 500;
cmpInventory.Add(2, "cocoa", 500);
g_Hop = 100;
const cheap = cmpEvaluator.EvaluateProposalData(proposal(500, 100000), 2);
const expensive = cmpEvaluator.EvaluateProposalData(proposal(500, 4000000), 2);
const unaffordable = cmpEvaluator.EvaluateProposalData(proposal(500, 50000000), 2);
TS_ASSERT_EQUALS(cheap.decision, "accept");
TS_ASSERT(cheap.totalUtility > 0);
TS_ASSERT(expensive.totalUtility < 0);
TS_ASSERT_EQUALS(unaffordable.decision, "reject");
const sellerCheap = cmpEvaluator.EvaluateProposalData(proposal(500, 100000), 1);
const sellerRich = cmpEvaluator.EvaluateProposalData(proposal(500, 4000000), 1);
TS_ASSERT(sellerRich.totalUtility > sellerCheap.totalUtility);

producer.stock = 0;
const scarceSeller = cmpEvaluator.EvaluateProposalData(proposal(500, 1000000), 1).totalUtility;
producer.stock = 10000;
const stockedSeller = cmpEvaluator.EvaluateProposalData(proposal(500, 1000000), 1).totalUtility;
TS_ASSERT(scarceSeller < stockedSeller);

cmpInventory.held[2].cocoa = 0;
const hungryBuyer = cmpEvaluator.EvaluateProposalData(proposal(500, 100000), 2).totalUtility;
cmpInventory.held[2].cocoa = 10000;
const stockedBuyer = cmpEvaluator.EvaluateProposalData(proposal(500, 100000), 2).totalUtility;
TS_ASSERT(hungryBuyer > stockedBuyer);

cmpInventory.held[2].cocoa = 500;
producer.stock = 500;
const openRoute = cmpEvaluator.EvaluateProposalData(proposal(500, 100000), 2).totalUtility;
g_Hop = 0;
const shutRoute = cmpEvaluator.EvaluateProposalData(proposal(500, 100000), 2).totalUtility;
TS_ASSERT(shutRoute < openRoute);
TS_ASSERT(shutRoute > 0);
g_Hop = 100;

// Neighbor can accept, reject, and counter.
resetGoods();
producer.stock = 500;
cmpInventory.Add(2, "cocoa", 500);
const accepted = cmpAgreements.Propose(1, 2, [sale(500, 100000)], []);
cmpAI.Respond(accepted);
TS_ASSERT_EQUALS(cmpAgreements.Find(accepted).status, "accepted");
TS_ASSERT_EQUALS(cmpInventory.GetStock(1, "cocoa"), 500);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(1), 10000000);

const rejected = cmpAgreements.Propose(1, 2, [sale(500, 50000000)], []);
cmpAI.Respond(rejected);
TS_ASSERT_EQUALS(cmpAgreements.Find(rejected).status, "rejected");

const countered = cmpAgreements.Propose(1, 2, [sale(500, 4000000)], []);
cmpAI.Respond(countered);
TS_ASSERT_EQUALS(cmpAgreements.Find(countered).status, "countered");
const counter = cmpAgreements.GetProposals()[cmpAgreements.GetProposals().length - 1];
TS_ASSERT_EQUALS(counter.parentProposal, countered);
TS_ASSERT_EQUALS(counter.status, "pending");
