Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("interfaces/GovernmentFinance.js");
Engine.LoadComponentScript("interfaces/DiplomaticAccess.js");
Engine.LoadComponentScript("interfaces/TradeAccess.js");
Engine.LoadComponentScript("interfaces/TransitAccess.js");
Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("interfaces/SettlementConnectivity.js");
Engine.LoadComponentScript("interfaces/InfrastructureLink.js");
Engine.LoadComponentScript("interfaces/InfrastructureNode.js");
Engine.LoadComponentScript("interfaces/TransportEfficiency.js");
Engine.LoadComponentScript("interfaces/CommodityProducer.js");
Engine.LoadComponentScript("interfaces/CommodityInventory.js");
Engine.LoadComponentScript("interfaces/TradeContractManager.js");
Engine.LoadComponentScript("interfaces/AgreementManager.js");
Engine.LoadComponentScript("interfaces/AgreementEvaluator.js");
Engine.LoadComponentScript("interfaces/AgreementAI.js");
Engine.LoadComponentScript("interfaces/ForeignActorManager.js");
Engine.LoadComponentScript("interfaces/Market.js");
Engine.LoadComponentScript("interfaces/Diplomacy.js");
Engine.LoadComponentScript("interfaces/SovereignEntryClassifier.js");
Engine.RegisterInterface("Ownership");
Engine.RegisterInterface("Position");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("GovernmentFinance.js");
Engine.LoadComponentScript("DiplomaticAccess.js");
Engine.LoadComponentScript("TradeAccess.js");
Engine.LoadComponentScript("TransitAccess.js");
Engine.LoadComponentScript("Sovereignty.js");
Engine.LoadComponentScript("InfrastructureLink.js");
Engine.LoadComponentScript("InfrastructureNode.js");
Engine.LoadComponentScript("TransportEfficiency.js");
Engine.LoadComponentScript("CommodityProducer.js");
Engine.LoadComponentScript("CommodityInventory.js");
Engine.LoadComponentScript("TradeContractManager.js");
Engine.LoadComponentScript("ForeignActorManager.js");
Engine.LoadComponentScript("AgreementManager.js");
Engine.LoadComponentScript("AgreementEvaluator.js");
Engine.LoadComponentScript("AgreementAI.js");
Engine.LoadComponentScript("SovereignEntryClassifier.js");

const g_Players = {};
let g_Enemy = false;

global.QueryPlayerIDInterface = function(id, iid)
{
	const player = g_Players[id];
	if (!player)
		return null;
	if (iid === IID_Diplomacy)
		return player.diplomacy;
	return player;
};

AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 6
});
AddMock(SYSTEM_ENTITY, IID_SettlementConnectivity, {
	"RefreshPhysicalLink": () => {},
	"RemovePhysicalLink": () => {}
});
AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
	"GetSovereignOwner": pos =>
	{
		if (pos.x < 30)
			return 1;
		if (pos.x < 50)
			return 4;
		if (pos.x < 70)
			return 5;
		if (pos.x < 100)
			return 2;
		return INVALID_PLAYER;
	},
	"GetRegions": () => [{ "owner": 1 }, { "owner": 4 }, { "owner": 2 }]
});

let g_LinkIds = [];
let g_Markets = [80, 81];
Engine.GetEntitiesWithInterface = function(iid)
{
	if (iid === IID_InfrastructureLink)
		return g_LinkIds.slice();
	if (iid === IID_Market)
		return g_Markets.slice();
	if (iid === IID_CommodityProducer)
		return [33];
	return [];
};

function makePlayer()
{
	const stock = {
		"food": 300,
		"wood": 0,
		"stone": 0,
		"metal": 0,
		"construction_materials": 0
	};
	return {
		"stock": stock,
		"diplomacy": {
			"IsEnemy": () => g_Enemy,
			"IsAlly": () => false,
			"IsNeutral": () => !g_Enemy
		},
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
g_Players[4] = makePlayer();
g_Players[5] = makePlayer();

global.Resources = {
	"GetCodes": () => ["food", "wood", "stone", "metal", "construction_materials"],
	"GetResource": code => ({ "name": code })
};
global.g_Commands = {};

const cmpTimer = ConstructComponent(SYSTEM_ENTITY, "Timer");
const cmpFinance = ConstructComponent(SYSTEM_ENTITY, "GovernmentFinance");
const cmpMilitary = ConstructComponent(SYSTEM_ENTITY, "DiplomaticAccess");
const cmpTrade = ConstructComponent(SYSTEM_ENTITY, "TradeAccess");
let cmpTransit = ConstructComponent(SYSTEM_ENTITY, "TransitAccess");
const cmpTransport = ConstructComponent(SYSTEM_ENTITY, "TransportEfficiency");
let cmpInventory = ConstructComponent(SYSTEM_ENTITY, "CommodityInventory");
let cmpContracts = ConstructComponent(SYSTEM_ENTITY, "TradeContractManager");
const cmpActors = ConstructComponent(SYSTEM_ENTITY, "ForeignActorManager");
const cmpAgreements = ConstructComponent(SYSTEM_ENTITY, "AgreementManager");
const cmpEvaluator = ConstructComponent(SYSTEM_ENTITY, "AgreementEvaluator");
const cmpAI = ConstructComponent(SYSTEM_ENTITY, "AgreementAI");
const cmpClassifier = ConstructComponent(SYSTEM_ENTITY, "SovereignEntryClassifier");
const producer = ConstructComponent(33, "CommodityProducer", {
	"Commodity": "cocoa",
	"ProductionPerTick": "100",
	"Stock": "500"
});
place(33, 10);

cmpActors.ReadActors([{
	"id": "ussr",
	"name": "Soviet Union",
	"type": "foreign_power",
	"treasury": 100000000,
	"responds": true
}]);

function treasury(player, amount)
{
	const current = cmpFinance.GetTreasury(player);
	if (current > amount)
		cmpFinance.Spend(player, current - amount);
	else if (amount > current)
		cmpFinance.AddFunds(player, amount - current);
}

function place(ent, x)
{
	AddMock(ent, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": x, "y": 80 })
	});
}

function node(ent, x)
{
	place(ent, x);
	ConstructComponent(ent, "InfrastructureNode", { "Kind": "commercial" });
}

function link(ent, from, to, condition, x)
{
	place(ent, x);
	const cmp = ConstructComponent(ent, "InfrastructureLink", {
		"From": String(from),
		"To": String(to)
	});
	if (condition !== undefined)
		cmp.SetCondition(condition);
	return cmp;
}

TS_ASSERT_EQUALS(cmpTransit.CanTransit(1, 4), false);
TS_ASSERT_EQUALS(cmpTransit.GrantTransit(1, 4), true);
TS_ASSERT_EQUALS(cmpTransit.CanTransit(1, 4), true);
TS_ASSERT_EQUALS(cmpTransit.CanTransit(4, 1), false);
TS_ASSERT_EQUALS(cmpTransit.GrantTransit(1, 4), true);
TS_ASSERT_EQUALS(cmpTransit.grants.length, 1);
TS_ASSERT_EQUALS(cmpTransit.GrantTransit(1, 1), false);
TS_ASSERT_EQUALS(cmpTransit.GrantTransit(1, 9), false);
TS_ASSERT_EQUALS(cmpTransit.RevokeTransit(1, 4), true);
TS_ASSERT_EQUALS(cmpTransit.CanTransit(1, 4), false);
TS_ASSERT_EQUALS(cmpTransit.RevokeTransit(1, 4), true);
cmpTransit.GrantTransit(1, 4);
cmpTransit = SerializationCycle(cmpTransit);
TS_ASSERT_EQUALS(cmpTransit.CanTransit(1, 4), true);
TS_ASSERT_EQUALS(cmpTransit.CanTransit(4, 1), false);
cmpTransit.RevokeTransit(1, 4);

node(80, 10);
node(81, 80);
node(83, 40);
node(84, 60);
AddMock(80, IID_Market, {});
AddMock(80, IID_Ownership, { "GetOwner": () => 1 });
AddMock(81, IID_Market, {});
AddMock(81, IID_Ownership, { "GetOwner": () => 2 });
const linkA = link(101, 80, 83, 100, 25);
const linkB = link(102, 83, 81, 100, 45);
const linkLegal = link(201, 80, 81, 60, 15);
const linkP5a = link(301, 80, 83, 100, 25);
const linkP5b = link(302, 83, 84, 100, 55);
const linkP5c = link(303, 84, 81, 100, 75);

g_LinkIds = [101, 102];
const physical = cmpTransport.DescribeCommercialRoute(80, 81, 1, 2);
TS_ASSERT_EQUALS(physical.connected, true);
TS_ASSERT_EQUALS(physical.condition, 100);
TS_ASSERT_EQUALS(physical.transitStates.join(","), "4");
TS_ASSERT_EQUALS(physical.missingTransit.join(","), "4");
TS_ASSERT_EQUALS(physical.legallyUsable, false);
const blocked = cmpTransport.GetUsableCommercialRoute(1, 80, 81, 2);
TS_ASSERT_EQUALS(blocked.connected, false);

cmpTransit.GrantTransit(1, 4);
const opened = cmpTransport.DescribeCommercialRoute(80, 81, 1, 2);
TS_ASSERT_EQUALS(opened.legallyUsable, true);
TS_ASSERT_EQUALS(opened.missingTransit.length, 0);
TS_ASSERT_EQUALS(cmpTransport.GetUsableCommercialRoute(1, 80, 81, 2).condition, 100);
cmpTransit.RevokeTransit(1, 4);

g_LinkIds = [101, 102, 201];
TS_ASSERT_EQUALS(cmpTransport.GetCommercialRoute(80, 81).condition, 100);
TS_ASSERT_EQUALS(cmpTransport.GetUsableCommercialRoute(1, 80, 81, 2).condition, 60);
TS_ASSERT_EQUALS(cmpTransport.GetUsableCommercialRoute(1, 80, 81, 2).links.join(","), "201");
cmpTransit.GrantTransit(1, 4);
TS_ASSERT_EQUALS(cmpTransport.GetUsableCommercialRoute(1, 80, 81, 2).condition, 100);
TS_ASSERT_EQUALS(cmpTransport.GetUsableCommercialRoute(1, 80, 81, 2).links.join(","), "101,102");
cmpTransit.RevokeTransit(1, 4);
TS_ASSERT_EQUALS(cmpTransport.GetUsableCommercialRoute(1, 80, 81, 2).condition, 60);

g_LinkIds = [301, 302, 303];
TS_ASSERT_EQUALS(cmpTransport.DescribeCommercialRoute(80, 81, 1, 2).missingTransit.join(","), "4,5");
TS_ASSERT_EQUALS(cmpTransport.GetUsableCommercialRoute(1, 80, 81, 2).connected, false);
cmpTransit.GrantTransit(1, 4);
TS_ASSERT_EQUALS(cmpTransport.GetUsableCommercialRoute(1, 80, 81, 2).connected, false);
TS_ASSERT_EQUALS(cmpTransport.DescribeCommercialRoute(80, 81, 1, 2).missingTransit.join(","), "5");
cmpTransit.GrantTransit(1, 5);
TS_ASSERT_EQUALS(cmpTransport.GetUsableCommercialRoute(1, 80, 81, 2).connected, true);
TS_ASSERT_EQUALS(cmpTransport.GetUsableCommercialRoute(1, 80, 81, 2).condition, 100);
cmpTransit.RevokeTransit(1, 4);
cmpTransit.RevokeTransit(1, 5);

g_LinkIds = [101, 102];
treasury(1, 10000000);
treasury(2, 5000000);
cmpTrade.GrantTrade(2, 1);
const saleId = cmpAgreements.Propose(1, 2, [{
	"type": "commodity_sale",
	"commodity": "cocoa",
	"quantity": 500,
	"totalPrice": 1000000
}], []);
TS_ASSERT(saleId > 0);
TS_ASSERT(cmpAgreements.Accept(2, saleId));
const contractId = cmpContracts.GetContracts()[0].id;
TS_ASSERT(cmpContracts.Assign(1, contractId, 82, 80, 81));
const denied = cmpContracts.TryDeliver(contractId);
TS_ASSERT_EQUALS(denied.delivered, 0);
TS_ASSERT_EQUALS(denied.reason, "missing_transit");
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).missingTransit.join(","), "4");
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).status, "active");
TS_ASSERT_EQUALS(producer.GetStock(), 500);

cmpTransit.GrantTransit(1, 4);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(contractId).delivered, 100);
TS_ASSERT_EQUALS(cmpTrade.CanTrade(1, 4), false);
TS_ASSERT_EQUALS(cmpMilitary.HasMilitaryAccess(1, 4), false);

cmpContracts = SerializationCycle(cmpContracts);
cmpTransit = SerializationCycle(cmpTransit);
TS_ASSERT_EQUALS(cmpTransit.CanTransit(1, 4), true);
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).quantityDelivered, 100);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(contractId).delivered, 100);
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).quantityDelivered, 200);

cmpTransit.RevokeTransit(1, 4);
const revoked = cmpContracts.TryDeliver(contractId);
TS_ASSERT_EQUALS(revoked.delivered, 0);
TS_ASSERT_EQUALS(revoked.reason, "missing_transit");
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).status, "active");
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).quantityDelivered, 200);
cmpTransit.GrantTransit(1, 4);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(contractId).delivered, 100);

cmpTrade.RevokeTrade(2, 1);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(contractId).reason, "no_access");
cmpTrade.GrantTrade(2, 1);
linkB.SetCondition(0);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(contractId).reason, "no_route");
linkB.SetCondition(100);

const g_Classified = [];
Engine.PostMessage = function(entity, type, message)
{
	if (type === MT_SovereignEntryClassified)
		g_Classified.push(message);
};
AddMock(13, IID_Ownership, { "GetOwner": () => 1 });
cmpClassifier.OnGlobalSovereignBorderCrossed({
	"entity": 13,
	"from": 1,
	"to": 4
});
TS_ASSERT_EQUALS(g_Classified.length, 1);
TS_ASSERT_EQUALS(g_Classified[0].authorized, false);
TS_ASSERT_EQUALS(cmpTransit.CanTransit(1, 4), true);
cmpMilitary.GrantMilitaryAccess(1, 4);
cmpClassifier.OnGlobalSovereignBorderCrossed({
	"entity": 13,
	"from": 1,
	"to": 4
});
TS_ASSERT_EQUALS(g_Classified[1].authorized, true);

const beforeRegions = cmpTransport.SovereignAt(83);
cmpTransit.GrantTransit(2, 4);
TS_ASSERT_EQUALS(cmpTransport.SovereignAt(83), beforeRegions);
TS_ASSERT_EQUALS(beforeRegions, 4);

g_LinkIds = [101, 102];
cmpTransit.RevokeTransit(1, 4);
const transitItem = {
	"type": "transit_rights",
	"provider": 4,
	"beneficiary": 1
};
const closedSale = cmpEvaluator.EvaluateProposalData({
	"offer": [{
		"type": "commodity_sale",
		"commodity": "cocoa",
		"quantity": 500,
		"totalPrice": 100000,
		"provider": 1,
		"beneficiary": 2
	}],
	"request": []
}, 2).totalUtility;
const packagedSale = cmpEvaluator.EvaluateProposalData({
	"offer": [{
		"type": "commodity_sale",
		"commodity": "cocoa",
		"quantity": 500,
		"totalPrice": 100000,
		"provider": 1,
		"beneficiary": 2
	}],
	"request": [transitItem]
}, 2).totalUtility;
TS_ASSERT(packagedSale > closedSale);

const unlock = cmpEvaluator.EvaluateItem(transitItem, 1);
TS_ASSERT_EQUALS(unlock.utility, cmpEvaluator.TransitUnlock);
const grantCost = cmpEvaluator.EvaluateItem(transitItem, 4);
TS_ASSERT_EQUALS(grantCost.utility, -cmpEvaluator.TransitGrantCorridor);
TS_ASSERT_EQUALS(grantCost.hardReject, false);

g_LinkIds = [101, 102, 201];
linkLegal.SetCondition(60);
const improved = cmpEvaluator.EvaluateItem(transitItem, 1);
TS_ASSERT_EQUALS(improved.utility, cmpEvaluator.TransitImprove);
linkLegal.SetCondition(100);
TS_ASSERT_EQUALS(cmpEvaluator.EvaluateItem(transitItem, 1).utility, 0);
linkLegal.SetCondition(60);

cmpTransit.GrantTransit(1, 4);
TS_ASSERT_EQUALS(cmpEvaluator.EvaluateItem(transitItem, 1).utility, 0);
cmpTransit.RevokeTransit(1, 4);

g_Enemy = true;
const hostile = cmpEvaluator.EvaluateItem(transitItem, 4);
TS_ASSERT_EQUALS(hostile.hardReject, true);
TS_ASSERT_EQUALS(hostile.utility, -cmpEvaluator.MilitaryHostile);
g_Enemy = false;

g_LinkIds = [101, 102];
treasury(1, 10000000);
treasury(4, 2000000);
const cheapId = cmpAgreements.Propose(1, 4, [{ "type": "cash", "amount": 10000 }], [{ "type": "transit_rights" }]);
TS_ASSERT(cheapId > 0);
const cheapScore = cmpEvaluator.EvaluateProposalData(cmpAgreements.Find(cheapId), 4);
TS_ASSERT_EQUALS(cheapScore.decision, "counter");
cmpAI.responders = [4];
cmpAI.Respond(cheapId);
TS_ASSERT_EQUALS(cmpAgreements.Find(cheapId).status, "countered");
const counter = cmpAgreements.GetProposals()[cmpAgreements.GetProposals().length - 1];
TS_ASSERT_EQUALS(counter.status, "pending");
let counterCash = 0;
for (let i = 0; i < counter.request.length; ++i)
	if (counter.request[i].type === "cash")
		counterCash += counter.request[i].amount;
TS_ASSERT(counterCash > 10000);
TS_ASSERT(cmpAgreements.Accept(1, counter.id));
TS_ASSERT_EQUALS(cmpTransit.CanTransit(1, 4), true);
cmpTransit.RevokeTransit(1, 4);

const dearId = cmpAgreements.Propose(1, 4, [{ "type": "cash", "amount": 3000000 }], [{ "type": "transit_rights" }]);
TS_ASSERT_EQUALS(cmpEvaluator.EvaluateProposalData(cmpAgreements.Find(dearId), 4).decision, "accept");
cmpAI.Respond(dearId);
TS_ASSERT_EQUALS(cmpAgreements.Find(dearId).status, "accepted");
TS_ASSERT_EQUALS(cmpTransit.CanTransit(1, 4), true);

TS_ASSERT_EQUALS(cmpAgreements.Propose(1, { "type": "foreign_actor", "id": "ussr" }, [], [{
	"type": "transit_rights"
}]), 0);
TS_ASSERT_EQUALS(cmpMilitary.HasMilitaryAccess(1, 4), true);
TS_ASSERT_EQUALS(cmpTrade.CanTrade(1, 4), false);

const regionsBefore = [{ "owner": 1 }, { "owner": 4 }];
const cmpSovereignty = ConstructComponent(SYSTEM_ENTITY, "Sovereignty");
TS_ASSERT(cmpSovereignty.ReadRegions([
	{
		"owner": 1,
		"points": [{ "x": 0, "z": 0 }, { "x": 30, "z": 0 }, { "x": 30, "z": 100 }, { "x": 0, "z": 100 }]
	},
	{
		"owner": 4,
		"points": [{ "x": 30, "z": 0 }, { "x": 50, "z": 0 }, { "x": 50, "z": 100 }, { "x": 30, "z": 100 }]
	}
]));
const owned = cmpSovereignty.GetSovereignOwner({ "x": 40, "z": 80 });
cmpTransit.GrantTransit(1, 4);
TS_ASSERT_EQUALS(cmpSovereignty.GetSovereignOwner({ "x": 40, "z": 80 }), owned);
TS_ASSERT_EQUALS(cmpSovereignty.GetRegions().length, regionsBefore.length);
