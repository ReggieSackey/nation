Engine.LoadComponentScript("interfaces/TransportEfficiency.js");
Engine.LoadComponentScript("interfaces/SettlementConnectivity.js");
Engine.LoadComponentScript("interfaces/InfrastructureLink.js");
Engine.LoadComponentScript("interfaces/InfrastructureNode.js");
Engine.LoadComponentScript("interfaces/TradeContractManager.js");
Engine.LoadComponentScript("interfaces/Health.js");
Engine.LoadComponentScript("TransportEfficiency.js");
Engine.LoadComponentScript("InfrastructureLink.js");
Engine.LoadComponentScript("InfrastructureNode.js");
Engine.LoadComponentScript("TradeContractManager.js");

let g_Hop = 100;
AddMock(SYSTEM_ENTITY, IID_SettlementConnectivity, {
	"GetPathToCapital": () => [33, 30],
	"GetHopCondition": () => g_Hop,
	"RefreshPhysicalLink": () => {},
	"RemovePhysicalLink": () => {}
});

let g_LinkIds = [];
Engine.GetEntitiesWithInterface = function(iid)
{
	if (iid === IID_InfrastructureLink)
		return g_LinkIds.slice();
	return [];
};

const cmpTransport = ConstructComponent(SYSTEM_ENTITY, "TransportEfficiency");
const cmpContracts = ConstructComponent(SYSTEM_ENTITY, "TradeContractManager");

function node(ent)
{
	ConstructComponent(ent, "InfrastructureNode", { "Kind": "commercial" });
}

function link(ent, from, to, condition)
{
	const cmp = ConstructComponent(ent, "InfrastructureLink", {
		"From": String(from),
		"To": String(to)
	});
	if (condition !== undefined)
		cmp.SetCondition(condition);
	return cmp;
}

node(80);
node(81);
node(83);
node(84);
node(30);
node(31);
const linkA = link(90, 80, 83, 100);
const linkB = link(91, 83, 84, 100);
const linkC = link(92, 84, 81, 100);
const linkOther = link(93, 30, 31, 100);
g_LinkIds = [92, 90, 93, 91];

const intact = cmpTransport.GetCommercialRoute(80, 81);
TS_ASSERT_EQUALS(intact.connected, true);
TS_ASSERT_EQUALS(intact.condition, 100);
TS_ASSERT_EQUALS(intact.links.join(","), "90,91,92");
TS_ASSERT_EQUALS(cmpTransport.GetCommercialRouteEfficiency(80, 81), 1);
TS_ASSERT_EQUALS(cmpContracts.LotCapacity(80, 81), 100);

g_Hop = 10;
linkOther.SetCondition(10);
TS_ASSERT_EQUALS(cmpTransport.GetRouteCondition(33), 10);
TS_ASSERT_EQUALS(cmpTransport.GetCommercialRoute(80, 81).condition, 100);
TS_ASSERT_EQUALS(cmpContracts.LotCapacity(80, 81), 100);
g_Hop = 100;
linkOther.SetCondition(100);
TS_ASSERT_EQUALS(cmpTransport.GetCommercialRoute(30, 31).links.join(","), "93");

linkB.SetCondition(50);
TS_ASSERT_EQUALS(cmpTransport.GetCommercialRoute(80, 81).condition, 50);
TS_ASSERT_EQUALS(cmpTransport.GetCommercialRouteEfficiency(80, 81), 0.5);
TS_ASSERT_EQUALS(cmpContracts.LotCapacity(80, 81), 50);

linkB.SetCondition(0);
const severed = cmpTransport.GetCommercialRoute(80, 81);
TS_ASSERT_EQUALS(severed.connected, false);
TS_ASSERT_EQUALS(severed.condition, 0);
TS_ASSERT_EQUALS(severed.links.length, 0);
TS_ASSERT_EQUALS(cmpContracts.LotCapacity(80, 81), 0);

linkB.SetCondition(100);
TS_ASSERT_EQUALS(cmpTransport.GetCommercialRoute(80, 81).condition, 100);
TS_ASSERT_EQUALS(cmpContracts.LotCapacity(80, 81), 100);

let hp = 0;
AddMock(91, IID_Health, {
	"GetMaxHitpoints": () => 100,
	"GetHitpoints": () => hp
});
linkB.SyncConditionFromHealth();
TS_ASSERT_EQUALS(cmpTransport.GetCommercialRoute(80, 81).connected, false);
linkB.SetCondition(100);
TS_ASSERT_EQUALS(cmpTransport.GetCommercialRoute(80, 81).condition, 100);

g_LinkIds = [90, 92];
TS_ASSERT_EQUALS(cmpTransport.GetCommercialRoute(80, 81).connected, false);
g_LinkIds = [90, 91, 92, 93];
TS_ASSERT_EQUALS(cmpTransport.GetCommercialRoute(80, 81).condition, 100);

linkB.SetCondition(40);
const restored = SerializationCycle(linkB);
TS_ASSERT_EQUALS(restored.GetCondition(), 40);
TS_ASSERT_EQUALS(cmpTransport.GetCommercialRoute(80, 81).condition, 40);
restored.SetCondition(100);

node(10);
node(11);
node(12);
node(13);
node(14);
link(201, 10, 11, 100);
link(202, 11, 12, 75);
link(203, 12, 13, 40);
link(204, 13, 14, 90);
g_LinkIds = [201, 202, 203, 204];
const bottleneck = cmpTransport.GetCommercialRoute(10, 14);
TS_ASSERT_EQUALS(bottleneck.connected, true);
TS_ASSERT_EQUALS(bottleneck.condition, 40);
TS_ASSERT_EQUALS(bottleneck.links.join(","), "201,202,203,204");
TS_ASSERT_EQUALS(cmpContracts.LotCapacity(10, 14), 40);

node(1);
node(2);
node(3);
node(4);
node(5);
node(6);
link(101, 1, 2, 100);
link(102, 2, 3, 20);
link(103, 3, 4, 100);
link(111, 1, 5, 60);
link(112, 5, 6, 60);
link(113, 6, 4, 60);
g_LinkIds = [101, 102, 103, 111, 112, 113];
const widest = cmpTransport.GetCommercialRoute(1, 4);
TS_ASSERT_EQUALS(widest.condition, 60);
TS_ASSERT_EQUALS(widest.links.join(","), "111,112,113");

node(7);
node(8);
node(9);
link(50, 7, 8, 70);
link(10, 7, 9, 70);
link(20, 9, 8, 70);
g_LinkIds = [50, 10, 20];
TS_ASSERT_EQUALS(cmpTransport.GetCommercialRoute(7, 8).links.join(","), "50");

node(15);
node(16);
link(11, 1, 15, 80);
link(31, 15, 4, 80);
link(12, 1, 16, 80);
link(21, 16, 4, 80);
g_LinkIds = [11, 31, 12, 21];
TS_ASSERT_EQUALS(cmpTransport.GetCommercialRoute(1, 4).links.join(","), "11,31");
TS_ASSERT_EQUALS(cmpTransport.GetCommercialRoute(1, 1).connected, false);
