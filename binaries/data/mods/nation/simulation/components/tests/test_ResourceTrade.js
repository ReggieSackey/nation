Engine.LoadComponentScript("interfaces/GovernmentFinance.js");
Engine.LoadComponentScript("interfaces/PlayerManager.js");
Engine.LoadComponentScript("interfaces/TradeAccess.js");
Engine.LoadComponentScript("interfaces/TradeContractManager.js");
Engine.LoadComponentScript("interfaces/TransportEfficiency.js");
Engine.LoadComponentScript("interfaces/Trader.js");
Engine.LoadComponentScript("interfaces/Market.js");
Engine.LoadComponentScript("interfaces/Health.js");
Engine.LoadComponentScript("GovernmentFinance.js");
Engine.LoadComponentScript("TradeAccess.js");
Engine.LoadComponentScript("TradeContractManager.js");

AddMock(SYSTEM_ENTITY, IID_PlayerManager, { GetNumPlayers: () => 3 });
const stock = {
	1: { food: 500, wood: 500, stone: 500, metal: 500 },
	2: { food: 0, wood: 0, stone: 0, metal: 0 }
};
const players = {};
let enemies = false;
for (const id of [1, 2])
	players[id] = {
		GetResourceCounts: () => stock[id],
		TrySubtractResources: cost => {
			for (const code in cost)
				if (stock[id][code] < cost[code])
					return false;
			for (const code in cost)
				stock[id][code] -= cost[code];
			return true;
		},
		AddResource: (code, amount) => { stock[id][code] += amount; },
		IsEnemy: () => enemies
	};
global.QueryPlayerIDInterface = id => players[id] || null;
AddMock(80, IID_Market, {});
AddMock(81, IID_Market, {});
AddMock(80, IID_Ownership, { GetOwner: () => 1 });
AddMock(81, IID_Ownership, { GetOwner: () => 2 });
let alive = true;
AddMock(82, IID_Health, { GetHitpoints: () => alive ? 100 : 0 });
const journey = { direction: "outbound", links: [90], nodes: [80, 81], condition: 100 };
let activeJourney = null;
AddMock(82, IID_Trader, {
	SetJourney: value => { activeJourney = value; },
	GetJourney: () => activeJourney,
	ClearJourney: () => { activeJourney = null; },
	GetCorridor: () => []
});
let routeOpen = true;
AddMock(SYSTEM_ENTITY, IID_TransportEfficiency, {
	GetUsableCommercialRoute: () => ({ connected: routeOpen, condition: routeOpen ? 100 : 0, links: [90], nodes: [80, 81] }),
	DescribeCommercialRoute: () => ({ connected: true, missingTransit: routeOpen ? [] : [3] }),
	AssessLinks: () => ({ operational: true, legallyUsable: true, condition: 100, missingTransit: [] }),
	CorridorWaypoints: () => []
});
const finance = ConstructComponent(SYSTEM_ENTITY, "GovernmentFinance");
finance.AddFunds(2, 10000);
const access = ConstructComponent(SYSTEM_ENTITY, "TradeAccess");
access.GrantTrade(2, 1);
const contracts = ConstructComponent(SYSTEM_ENTITY, "TradeContractManager");

for (const resource of ["food", "wood", "stone", "metal"])
{
	const id = contracts.Create(1, {
		type: "resource_sale", provider: 1, beneficiary: 2,
		resource, quantity: 100, totalPrice: 300
	});
	TS_ASSERT(id > 0);
	const contract = contracts.Find(id);
	contract.trader = 82;
	contract.sellerMarket = 80;
	contract.buyerMarket = 81;
	const sellerBefore = stock[1][resource];
	const buyerBefore = stock[2][resource];
	const sellerMoney = finance.GetTreasury(1);
	const buyerMoney = finance.GetTreasury(2);
	TS_ASSERT_EQUALS(stock[1][resource], sellerBefore);
	TS_ASSERT_EQUALS(contracts.PrepareDeparture(82, 80, 81), "outbound");
	TS_ASSERT_EQUALS(stock[1][resource], sellerBefore - 100);
	TS_ASSERT_EQUALS(stock[2][resource], buyerBefore);
	TS_ASSERT_EQUALS(contract.cargo.resource, resource);
	TS_ASSERT_EQUALS(contract.cargo.quantity, 100);
	TS_ASSERT_EQUALS(contracts.TryDeliver(id).delivered, 100);
	TS_ASSERT_EQUALS(stock[2][resource], buyerBefore + 100);
	TS_ASSERT_EQUALS(finance.GetTreasury(1), sellerMoney + 300);
	TS_ASSERT_EQUALS(finance.GetTreasury(2), buyerMoney - 300);
	TS_ASSERT_EQUALS(contract.cargo, null);
	TS_ASSERT_EQUALS(contracts.TryDeliver(id).delivered, 0);
}

function openSale(resource, quantity, price)
{
	const id = contracts.Create(2, {
		type: "resource_sale", provider: 1, beneficiary: 2,
		resource, quantity, totalPrice: price
	});
	const contract = contracts.Find(id);
	contract.trader = 82;
	contract.sellerMarket = 80;
	contract.buyerMarket = 81;
	return contract;
}

const noSupply = openSale("food", 20, 100);
stock[1].food = 0;
TS_ASSERT_EQUALS(contracts.PrepareDeparture(82, 80, 81), "hold");
TS_ASSERT_EQUALS(noSupply.blockReason, "no_supply");
TS_ASSERT_EQUALS(noSupply.cargo, null);

stock[1].food = 100;
access.grants = [];
TS_ASSERT_EQUALS(contracts.PrepareDeparture(82, 80, 81), "hold");
TS_ASSERT_EQUALS(noSupply.blockReason, "no_access");
TS_ASSERT_EQUALS(stock[1].food, 100);
access.GrantTrade(2, 1);
noSupply.trader = 0;

const lost = openSale("wood", 20, 100);
stock[1].wood = 20;
TS_ASSERT_EQUALS(contracts.PrepareDeparture(82, 80, 81), "outbound");
TS_ASSERT_EQUALS(stock[1].wood, 0);
contracts.OnGlobalDestroy({ entity: 82 });
TS_ASSERT_EQUALS(lost.cargo, null);
TS_ASSERT_EQUALS(stock[2].wood, 100);
TS_ASSERT_EQUALS(contracts.TryDeliver(lost.id).delivered, 0);

const saved = contracts.Serialize();
const restored = ConstructComponent(SYSTEM_ENTITY, "TradeContractManager");
restored.Deserialize(saved);
TS_ASSERT_EQUALS(restored.Find(lost.id).cargo, null);

const transitBlocked = openSale("stone", 20, 100);
routeOpen = false;
const beforeTransit = stock[1].stone;
TS_ASSERT_EQUALS(contracts.PrepareDeparture(82, 80, 81), "hold");
TS_ASSERT_EQUALS(transitBlocked.blockReason, "missing_transit");
TS_ASSERT_EQUALS(stock[1].stone, beforeTransit);
routeOpen = true;
transitBlocked.trader = 0;
const transitResume = openSale("metal", 20, 100);
stock[1].metal = 20;
TS_ASSERT_EQUALS(contracts.PrepareDeparture(82, 80, 81), "outbound");
TS_ASSERT_EQUALS(stock[1].metal, 0);
const savedInTransit = contracts.Serialize();
restored.Deserialize(savedInTransit);
const restoredContract = restored.Find(transitResume.id);
TS_ASSERT_EQUALS(restoredContract.cargo.quantity, 20);
TS_ASSERT_EQUALS(stock[1].metal, 0);
TS_ASSERT_EQUALS(restored.TryDeliver(transitResume.id).delivered, 20);
TS_ASSERT_EQUALS(restoredContract.cargo, null);
TS_ASSERT_EQUALS(restored.TryDeliver(transitResume.id).delivered, 0);
const savedAfterDelivery = restored.Serialize();
restored.Deserialize(savedAfterDelivery);
TS_ASSERT_EQUALS(restored.Find(transitResume.id).quantityDelivered, 20);
TS_ASSERT_EQUALS(restored.TryDeliver(transitResume.id).delivered, 0);

for (const existing of contracts.contracts)
	existing.trader = 0;
const wartimeDeparture = openSale("food", 20, 100);
stock[1].food = 20;
enemies = true;
TS_ASSERT_EQUALS(contracts.PrepareDeparture(82, 80, 81), "hold");
TS_ASSERT_EQUALS(wartimeDeparture.blockReason, "enemies");
TS_ASSERT_EQUALS(wartimeDeparture.cargo, null);
TS_ASSERT_EQUALS(stock[1].food, 20);

wartimeDeparture.trader = 0;
enemies = false;
const wartimeArrival = openSale("stone", 20, 100);
stock[1].stone = 20;
const buyerStone = stock[2].stone;
const sellerTreasury = finance.GetTreasury(1);
const buyerTreasury = finance.GetTreasury(2);
TS_ASSERT_EQUALS(contracts.PrepareDeparture(82, 80, 81), "outbound");
enemies = true;
const refused = contracts.TryDeliver(wartimeArrival.id);
TS_ASSERT_EQUALS(refused.delivered, 0);
TS_ASSERT_EQUALS(refused.paid, 0);
TS_ASSERT_EQUALS(refused.reason, "enemies");
TS_ASSERT_EQUALS(wartimeArrival.cargo, null);
TS_ASSERT_EQUALS(stock[2].stone, buyerStone);
TS_ASSERT_EQUALS(finance.GetTreasury(1), sellerTreasury);
TS_ASSERT_EQUALS(finance.GetTreasury(2), buyerTreasury);
