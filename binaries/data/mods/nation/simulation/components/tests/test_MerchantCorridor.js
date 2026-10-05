Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/GovernmentFinance.js");
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
Engine.LoadComponentScript("interfaces/Market.js");
Engine.LoadComponentScript("interfaces/Trader.js");
Engine.LoadComponentScript("interfaces/Health.js");
Engine.RegisterInterface("Ownership");
Engine.RegisterInterface("Position");
Engine.RegisterInterface("UnitAI");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("GovernmentFinance.js");
Engine.LoadComponentScript("TradeAccess.js");
Engine.LoadComponentScript("TransitAccess.js");
Engine.LoadComponentScript("InfrastructureLink.js");
Engine.LoadComponentScript("InfrastructureNode.js");
Engine.LoadComponentScript("TransportEfficiency.js");
Engine.LoadComponentScript("CommodityProducer.js");
Engine.LoadComponentScript("CommodityInventory.js");
Engine.LoadComponentScript("TradeContractManager.js");
Engine.LoadComponentScript("Trader.js");

const g_Players = {};
let g_Minted = 0;
global.QueryPlayerIDInterface = function(id)
{
	return g_Players[id] || null;
};
global.QueryMiragedInterface = function(ent, iid)
{
	return Engine.QueryInterface(ent, iid);
};
global.QueryOwnerInterface = function(ent, iid)
{
	const cmpOwnership = Engine.QueryInterface(ent, IID_Ownership);
	if (!cmpOwnership)
		return null;
	return QueryPlayerIDInterface(cmpOwnership.GetOwner(), iid);
};

function makePlayer()
{
	return {
		"IsEnemy": () => false,
		"GetNextTradingGoods": () => "food",
		"AddResource": () => { ++g_Minted; }
	};
}
g_Players[1] = makePlayer();
g_Players[2] = makePlayer();

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
		if (pos.x < 100)
			return 2;
		return INVALID_PLAYER;
	}
});

let g_LinkIds = [];
Engine.GetEntitiesWithInterface = function(iid)
{
	if (iid === IID_InfrastructureLink)
		return g_LinkIds.slice();
	if (iid === IID_CommodityProducer)
		return [33];
	return [];
};

const cmpTransport = ConstructComponent(SYSTEM_ENTITY, "TransportEfficiency");
const cmpFinance = ConstructComponent(SYSTEM_ENTITY, "GovernmentFinance");
const cmpTrade = ConstructComponent(SYSTEM_ENTITY, "TradeAccess");
const cmpTransit = ConstructComponent(SYSTEM_ENTITY, "TransitAccess");
const cmpInventory = ConstructComponent(SYSTEM_ENTITY, "CommodityInventory");
let cmpContracts = ConstructComponent(SYSTEM_ENTITY, "TradeContractManager");
const producer = ConstructComponent(33, "CommodityProducer", {
	"Commodity": "cocoa",
	"ProductionPerTick": "100",
	"Stock": "500"
});

function place(ent, x, z)
{
	AddMock(ent, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": x, "y": z })
	});
}

function node(ent, x, z)
{
	ConstructComponent(ent, "InfrastructureNode", { "Kind": "commercial" });
	place(ent, x, z);
}

function link(ent, from, to, condition, x, z)
{
	const cmp = ConstructComponent(ent, "InfrastructureLink", {
		"From": String(from),
		"To": String(to)
	});
	cmp.SetCondition(condition);
	place(ent, x, z);
	return cmp;
}

function gain()
{
	return { "traderGain": 5, "market1Gain": 1, "market2Gain": 1 };
}

let g_Setups = 0;
let g_Adds = 0;
const g_Order = {
	"type": "Trade",
	"data": { "target": 80, "route": [{ "x": 999, "z": 999 }] }
};
AddMock(82, IID_UnitAI, {
	"order": g_Order,
	"SetupTradeRoute": (target, source) =>
	{
		++g_Setups;
		const cmpTrader = Engine.QueryInterface(82, IID_Trader);
		cmpTrader.SetTargetMarket(target, source);
		g_Order.type = "Trade";
		g_Order.data = { "target": cmpTrader.GetFirstMarket(), "route": null };
	},
	"AddOrder": (type, data) =>
	{
		++g_Adds;
		g_Order.type = type;
		g_Order.data = data;
	}
});
AddMock(82, IID_Ownership, { "GetOwner": () => 1 });
AddMock(70, IID_UnitAI, {
	"order": { "type": "Trade", "data": { "target": 1, "route": [{ "x": 7, "z": 7 }] } }
});
AddMock(70, IID_Ownership, { "GetOwner": () => 1 });

for (const ent of [1, 2, 10, 20, 80, 81])
	AddMock(ent, IID_Market, {
		"CalculateTraderGain": gain,
		"HasType": () => true,
		"AddTrader": () => {},
		"RemoveTrader": () => {}
	});
AddMock(1, IID_Ownership, { "GetOwner": () => 1 });
AddMock(2, IID_Ownership, { "GetOwner": () => 2 });
AddMock(80, IID_Ownership, { "GetOwner": () => 1 });
AddMock(81, IID_Ownership, { "GetOwner": () => 2 });

node(1, 0, 0);
node(10, 10, 0);
node(20, 20, 10);
node(2, 30, 10);
const chainA = link(11, 1, 10, 100, 5, 0);
const chainB = link(12, 10, 20, 100, 15, 5);
const chainC = link(13, 20, 2, 100, 25, 10);
g_LinkIds = [11, 12, 13];

const forward = cmpTransport.GetCommercialRoute(1, 2);
TS_ASSERT_EQUALS(forward.connected, true);
TS_ASSERT_EQUALS(forward.nodes.join(","), "1,10,20,2");
TS_ASSERT_EQUALS(cmpTransport.GetCommercialRoute(2, 1).nodes.join(","), "2,20,10,1");
const points = cmpTransport.NodePoints(forward.nodes);
TS_ASSERT_EQUALS(points.length, 4);
TS_ASSERT_EQUALS(points[0].x + "," + points[0].z, "0,0");
TS_ASSERT_EQUALS(points[1].x + "," + points[1].z, "10,0");
TS_ASSERT_EQUALS(points[2].x + "," + points[2].z, "20,10");
TS_ASSERT_EQUALS(points[3].x + "," + points[3].z, "30,10");
const middles = cmpTransport.CorridorWaypoints(forward.nodes);
TS_ASSERT_EQUALS(middles.length, 2);
TS_ASSERT_EQUALS(middles[0].x + "," + middles[0].z, "10,0");
TS_ASSERT_EQUALS(middles[1].x + "," + middles[1].z, "20,10");

function visited(route, towardBuyer)
{
	const pending = route.slice();
	if (towardBuyer)
		pending.reverse();
	const seen = [];
	while (pending.length)
		seen.push(pending.pop());
	return seen;
}
const outbound = visited(middles, true);
TS_ASSERT_EQUALS(outbound[0].x + "," + outbound[0].z, "10,0");
TS_ASSERT_EQUALS(outbound[1].x + "," + outbound[1].z, "20,10");
const returning = visited(middles, false);
TS_ASSERT_EQUALS(returning[0].x + "," + returning[0].z, "20,10");
TS_ASSERT_EQUALS(returning[1].x + "," + returning[1].z, "10,0");

node(80, 10, 100);
node(110, 40, 100);
node(111, 80, 100);
node(81, 90, 100);
node(120, 15, 0);
node(121, 85, 0);
place(33, 10, 10);
const northA = link(101, 80, 110, 100, 20, 100);
const northB = link(102, 110, 111, 100, 45, 100);
const northC = link(103, 111, 81, 100, 85, 100);
const southA = link(201, 80, 120, 100, 12, 50);
const southB = link(202, 120, 121, 60, 20, 0);
const southC = link(203, 121, 81, 100, 88, 50);
g_LinkIds = [101, 102, 103, 201, 202, 203];

const physical = cmpTransport.DescribeCommercialRoute(80, 81, 1, 2);
TS_ASSERT_EQUALS(physical.connected, true);
TS_ASSERT_EQUALS(physical.condition, 100);
TS_ASSERT_EQUALS(physical.nodes.join(","), "80,110,111,81");
TS_ASSERT_EQUALS(physical.missingTransit.join(","), "4");
const bypass = cmpTransport.GetUsableCommercialRoute(1, 80, 81, 2);
TS_ASSERT_EQUALS(bypass.connected, true);
TS_ASSERT_EQUALS(bypass.condition, 60);
TS_ASSERT_EQUALS(bypass.nodes.join(","), "80,120,121,81");

cmpFinance.AddFunds(1, 10000000);
cmpFinance.AddFunds(2, 5000000);
cmpTrade.GrantTrade(2, 1);
const contractId = cmpContracts.Create(0, {
	"commodity": "cocoa",
	"provider": 1,
	"beneficiary": 2,
	"quantity": 500,
	"totalPrice": 1000000
});
TS_ASSERT(contractId > 0);
let cmpTrader = ConstructComponent(82, "Trader", { "GainMultiplier": "1" });
TS_ASSERT(cmpContracts.Assign(1, contractId, 82, 80, 81));

const beforeStock = producer.GetStock();
const beforeTreasury = cmpFinance.GetTreasury(2);
cmpContracts.SettleArrival(82, 120);
TS_ASSERT_EQUALS(producer.GetStock(), beforeStock);
TS_ASSERT_EQUALS(cmpFinance.GetTreasury(2), beforeTreasury);

function leaveSeller()
{
	cmpTrader.index = 0;
	cmpTrader.goods.amount = null;
	g_Minted = 0;
	const result = cmpTrader.PerformTrade(80);
	if (result === INVALID_ENTITY)
		g_Order.type = null;
	return result;
}

TS_ASSERT_EQUALS(leaveSeller(), 81);
TS_ASSERT_EQUALS(g_Minted, 0);
TS_ASSERT_EQUALS(cmpTrader.GetJourney().nodes.join(","), "80,120,121,81");
TS_ASSERT_EQUALS(cmpTrader.GetJourney().condition, 60);
TS_ASSERT_EQUALS(g_Order.data.route[0].x + "," + g_Order.data.route[0].z, "15,0");
TS_ASSERT_EQUALS(g_Order.data.route[1].x + "," + g_Order.data.route[1].z, "85,0");
const walked = visited(g_Order.data.route, true);
TS_ASSERT_EQUALS(walked[0].z, 0);
TS_ASSERT_EQUALS(walked[1].z, 0);

cmpTransit.GrantTransit(1, 4);
TS_ASSERT_EQUALS(cmpTransport.GetUsableCommercialRoute(1, 80, 81, 2).condition, 100);
const matched = cmpContracts.TryDeliver(contractId);
TS_ASSERT_EQUALS(matched.delivered, 60);
TS_ASSERT_EQUALS(matched.reason, "settled");
TS_ASSERT_EQUALS(cmpTrader.GetJourney(), null);
TS_ASSERT_EQUALS(producer.GetStock(), 440);

cmpTrader = SerializationCycle(cmpTrader);
TS_ASSERT_EQUALS(leaveSeller(), 81);
TS_ASSERT_EQUALS(cmpTrader.GetJourney().nodes.join(","), "80,110,111,81");
cmpTrader = SerializationCycle(cmpTrader);
TS_ASSERT_EQUALS(cmpTrader.GetJourney().links.join(","), "101,102,103");
TS_ASSERT_EQUALS(cmpTrader.GetCorridor()[0].z, 100);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(contractId).delivered, 100);
cmpContracts = SerializationCycle(cmpContracts);
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).quantityDelivered, 160);

function leaveBuyer()
{
	cmpTrader.index = 1;
	cmpTrader.goods.amount = null;
	g_Minted = 0;
	const result = cmpTrader.PerformTrade(81);
	if (result === INVALID_ENTITY)
		g_Order.type = null;
	return result;
}

TS_ASSERT_EQUALS(leaveBuyer(), 80);
TS_ASSERT_EQUALS(g_Minted, 0);
TS_ASSERT_EQUALS(cmpTrader.GetJourney().direction, "return");
TS_ASSERT_EQUALS(cmpTrader.GetJourney().nodes.join(","), "81,111,110,80");
const sameWayHome = visited(g_Order.data.route, false);
TS_ASSERT_EQUALS(sameWayHome[0].x, 80);
TS_ASSERT_EQUALS(sameWayHome[1].x, 40);

TS_ASSERT_EQUALS(leaveSeller(), 81);
TS_ASSERT_EQUALS(cmpTrader.GetJourney().direction, "outbound");
TS_ASSERT_EQUALS(cmpTrader.GetJourney().nodes.join(","), "80,110,111,81");
cmpTrader = SerializationCycle(cmpTrader);
cmpTransit.RevokeTransit(1, 4);
const savedDelivered = cmpContracts.Find(contractId).quantityDelivered;
const revokedMidway = cmpContracts.TryDeliver(contractId);
TS_ASSERT_EQUALS(revokedMidway.delivered, 0);
TS_ASSERT_EQUALS(revokedMidway.reason, "missing_transit");
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).quantityDelivered, savedDelivered);
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).status, "active");
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).trader, 82);
TS_ASSERT_EQUALS(cmpTrader.GetFirstMarket(), 80);
TS_ASSERT_EQUALS(cmpTrader.GetSecondMarket(), 81);
TS_ASSERT_EQUALS(leaveBuyer(), 80);
TS_ASSERT_EQUALS(cmpTrader.GetJourney().nodes.join(","), "81,121,120,80");
const bypassHome = visited(g_Order.data.route, false);
TS_ASSERT_EQUALS(bypassHome[0].x + "," + bypassHome[0].z, "85,0");
TS_ASSERT_EQUALS(bypassHome[1].x + "," + bypassHome[1].z, "15,0");
TS_ASSERT_EQUALS(cmpTrader.GetJourney().nodes.indexOf(110), -1);
TS_ASSERT_EQUALS(cmpTrader.GetJourney().nodes.indexOf(111), -1);

cmpTransit.RevokeTransit(1, 4);
TS_ASSERT_EQUALS(leaveSeller(), 81);
TS_ASSERT_EQUALS(cmpTrader.GetJourney().nodes.join(","), "80,120,121,81");
cmpTransit.GrantTransit(1, 4);
TS_ASSERT_EQUALS(cmpTransport.GetUsableCommercialRoute(1, 80, 81, 2).nodes.join(","), "80,110,111,81");
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(contractId).delivered, 60);
TS_ASSERT_EQUALS(leaveBuyer(), 80);
TS_ASSERT_EQUALS(cmpTrader.GetJourney().nodes.join(","), "81,111,110,80");
const grantedHome = visited(g_Order.data.route, false);
TS_ASSERT_EQUALS(grantedHome[0].x, 80);
TS_ASSERT_EQUALS(grantedHome[1].x, 40);

TS_ASSERT_EQUALS(leaveSeller(), 81);
northB.SetCondition(0);
const severed = cmpContracts.TryDeliver(contractId);
TS_ASSERT_EQUALS(severed.reason, "no_route");
TS_ASSERT_EQUALS(severed.delivered, 0);
TS_ASSERT_EQUALS(leaveBuyer(), 80);
TS_ASSERT_EQUALS(cmpTrader.GetJourney().nodes.join(","), "81,121,120,80");

northB.SetCondition(0);
TS_ASSERT_EQUALS(leaveSeller(), 81);
TS_ASSERT_EQUALS(cmpTrader.GetJourney().nodes.join(","), "80,120,121,81");
northB.SetCondition(100);
TS_ASSERT_EQUALS(cmpContracts.TryDeliver(contractId).delivered, 60);
TS_ASSERT_EQUALS(leaveBuyer(), 80);
TS_ASSERT_EQUALS(cmpTrader.GetJourney().nodes.join(","), "81,111,110,80");

g_LinkIds = [];
const addsWhileClosed = g_Adds;
const setupsWhileReturnClosed = g_Setups;
TS_ASSERT_EQUALS(leaveBuyer(), INVALID_ENTITY);
TS_ASSERT_EQUALS(g_Order.data.route, null);
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).blockReason, "no_route");
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).status, "active");
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).trader, 82);
cmpContracts.ResumeDeparture(contractId);
TS_ASSERT_EQUALS(g_Adds, addsWhileClosed);
TS_ASSERT_EQUALS(g_Setups, setupsWhileReturnClosed);
g_LinkIds = [201, 202, 203];
cmpContracts.ResumeDeparture(contractId);
TS_ASSERT_EQUALS(g_Adds, addsWhileClosed + 1);
TS_ASSERT_EQUALS(g_Order.data.target, 81);
TS_ASSERT_EQUALS(leaveBuyer(), 80);
TS_ASSERT_EQUALS(cmpTrader.GetJourney().nodes.join(","), "81,121,120,80");
g_LinkIds = [101, 102, 103, 201, 202, 203];

cmpTransit.RevokeTransit(1, 4);
g_LinkIds = [101, 102, 103];
const setupsWhileClosed = g_Setups;
TS_ASSERT_EQUALS(leaveSeller(), INVALID_ENTITY);
TS_ASSERT_EQUALS(g_Minted, 0);
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).blockReason, "missing_transit");
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).status, "active");
TS_ASSERT_EQUALS(g_Order.data.route, null);
cmpContracts.ResumeDeparture(contractId);
TS_ASSERT_EQUALS(g_Setups, setupsWhileClosed);
cmpTransit.GrantTransit(1, 4);
cmpContracts.ResumeDeparture(contractId);
TS_ASSERT_EQUALS(g_Setups, setupsWhileClosed + 1);

g_LinkIds = [];
const setupsWithoutRoad = g_Setups;
TS_ASSERT_EQUALS(leaveSeller(), INVALID_ENTITY);
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).blockReason, "no_route");
cmpContracts.ResumeDeparture(contractId);
TS_ASSERT_EQUALS(g_Setups, setupsWithoutRoad);

const lonely = cmpTransport.NodePoints([10, 999]);
TS_ASSERT_EQUALS(lonely.length, 1);
TS_ASSERT_EQUALS(lonely[0].x, 10);

const cmpOther = ConstructComponent(70, "Trader", { "GainMultiplier": "1" });
cmpOther.SetTargetMarket(2, 1);
cmpOther.index = 0;
const otherOrder = Engine.QueryInterface(70, IID_UnitAI).order;
g_Minted = 0;
TS_ASSERT_EQUALS(cmpOther.PerformTrade(1), 2);
TS_ASSERT_EQUALS(g_Minted, 0);
TS_ASSERT_EQUALS(otherOrder.data.route[0].x, 7);
TS_ASSERT_EQUALS(cmpOther.GetJourney(), null);

let g_MarketHp = 100;
AddMock(81, IID_Health, { "GetHitpoints": () => g_MarketHp });
g_MarketHp = 0;
g_LinkIds = [201, 202, 203];
const setupsDeadMarket = g_Setups;
TS_ASSERT_EQUALS(leaveSeller(), INVALID_ENTITY);
TS_ASSERT_EQUALS(cmpContracts.Find(contractId).blockReason, "no_endpoint");
cmpContracts.ResumeDeparture(contractId);
TS_ASSERT_EQUALS(g_Setups, setupsDeadMarket);

TS_ASSERT_EQUALS(chainA.GetCondition(), 100);
TS_ASSERT_EQUALS(chainB.GetCondition(), 100);
TS_ASSERT_EQUALS(chainC.GetCondition(), 100);
TS_ASSERT_EQUALS(southB.GetCondition(), 60);
