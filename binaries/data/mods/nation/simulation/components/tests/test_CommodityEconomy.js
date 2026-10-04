Engine.LoadComponentScript("interfaces/Timer.js");
Engine.LoadComponentScript("Timer.js");
Engine.LoadComponentScript("interfaces/Sovereignty.js");
Engine.LoadComponentScript("interfaces/GovernmentFinance.js");
Engine.LoadComponentScript("GovernmentFinance.js");
Engine.LoadComponentScript("interfaces/CommodityProducer.js");
Engine.LoadComponentScript("CommodityProducer.js");
Engine.LoadComponentScript("interfaces/CommodityProductionManager.js");
Engine.LoadComponentScript("CommodityProductionManager.js");
Engine.LoadComponentScript("interfaces/CommodityExportManager.js");
Engine.LoadComponentScript("CommodityExportManager.js");

IID_PlayerManager = 4;

const g_Errors = [];
error = function(message)
{
	g_Errors.push(String(message));
};

let g_ProducerIds = [];

AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
	"GetSovereignOwner": pos => pos.x <= 256 ? 1 : pos.x <= 512 ? 2 : INVALID_PLAYER
});
AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
	"GetNumPlayers": () => 3
});

Engine.GetEntitiesWithInterface = function(iid)
{
	if (iid !== IID_CommodityProducer)
		return [];
	return g_ProducerIds.slice();
};

function place(entity, x, owner)
{
	AddMock(entity, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": x, "y": 100 })
	});
	AddMock(entity, IID_Ownership, {
		"GetOwner": () => owner
	});
}

function producer(entity, commodity, production, stock, x, owner)
{
	place(entity, x, owner);
	g_ProducerIds.push(entity);
	return ConstructComponent(entity, "CommodityProducer", {
		"Commodity": commodity,
		"ProductionPerTick": String(production),
		"Stock": String(stock)
	});
}

function start()
{
	ResetState();
	g_Errors.length = 0;
	g_ProducerIds = [];
	AddMock(SYSTEM_ENTITY, IID_Sovereignty, {
		"GetSovereignOwner": pos => pos.x <= 256 ? 1 : pos.x <= 512 ? 2 : INVALID_PLAYER
	});
	AddMock(SYSTEM_ENTITY, IID_PlayerManager, {
		"GetNumPlayers": () => 3
	});
	const cmpTimer = ConstructComponent(SYSTEM_ENTITY, "Timer");
	const cmpFinance = ConstructComponent(SYSTEM_ENTITY, "GovernmentFinance");
	const cmpProduction = ConstructComponent(SYSTEM_ENTITY, "CommodityProductionManager");
	const cmpExport = ConstructComponent(SYSTEM_ENTITY, "CommodityExportManager");
	global.InitAttributes = { "settings": {} };
	cmpFinance.OnInitGame();
	cmpProduction.OnInitGame();
	cmpExport.OnInitGame();
	cmpProduction.OnInitGame();
	cmpExport.OnInitGame();
	return {
		"cmpTimer": cmpTimer,
		"cmpFinance": cmpFinance,
		"cmpProduction": cmpProduction,
		"cmpExport": cmpExport
	};
}

function advance(cmpTimer, seconds)
{
	cmpTimer.OnUpdate({ "turnLength": seconds });
}

g_Errors.length = 0;
const cocoa = producer(33, "cocoa", 100, 0, 180, 1);
TS_ASSERT_EQUALS(cocoa.GetCommodity(), "cocoa");
TS_ASSERT_EQUALS(cocoa.GetProductionPerTick(), 100);
TS_ASSERT_EQUALS(cocoa.GetStock(), 0);
TS_ASSERT_EQUALS(cocoa.Produce(), 100);
TS_ASSERT_EQUALS(cocoa.Produce(), 200);

const restored = SerializationCycle(cocoa);
TS_ASSERT_EQUALS(restored.GetCommodity(), "cocoa");
TS_ASSERT_EQUALS(restored.GetStock(), 200);
TS_ASSERT_EQUALS(restored.GetProductionPerTick(), 100);

TS_ASSERT_EQUALS(restored.RemoveStock(50), true);
TS_ASSERT_EQUALS(restored.GetStock(), 150);
TS_ASSERT_EQUALS(restored.RemoveStock(300), false);
TS_ASSERT_EQUALS(restored.GetStock(), 150);
TS_ASSERT_EQUALS(restored.RemoveStock(0), false);
TS_ASSERT_EQUALS(restored.RemoveStock(-5), false);
TS_ASSERT_EQUALS(restored.GetStock(), 150);

g_Errors.length = 0;
const negative = producer(11, "cocoa", -10, 0, 180, 1);
TS_ASSERT_EQUALS(negative.GetProductionPerTick(), 0);
TS_ASSERT_EQUALS(negative.GetCommodity(), "");
TS_ASSERT(g_Errors.length > 0);

g_Errors.length = 0;
const blank = producer(12, "   ", 100, 0, 180, 1);
TS_ASSERT_EQUALS(blank.GetCommodity(), "");
TS_ASSERT(g_Errors.length > 0);

g_Errors.length = 0;
const badStock = producer(13, "cocoa", 100, -1, 180, 1);
TS_ASSERT_EQUALS(badStock.GetStock(), 0);
TS_ASSERT(g_Errors.length > 0);

let world = start();
const south = producer(33, "cocoa", 100, 200, 180, 1);
TS_ASSERT_EQUALS(world.cmpExport.ApplyExports(), undefined);
TS_ASSERT_EQUALS(south.GetStock(), 0);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 2000);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(2), 0);
TS_ASSERT_EQUALS(world.cmpExport.GetTotalExported(1, "cocoa"), 200);
TS_ASSERT_EQUALS(world.cmpExport.GetTotalExportRevenue(1), 2000);

const before = world.cmpFinance.GetTreasury(1);
world.cmpExport.ApplyExports();
TS_ASSERT_EQUALS(south.GetStock(), 0);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), before);
TS_ASSERT_EQUALS(world.cmpExport.GetTotalExported(1, "cocoa"), 200);

world = start();
const foreignLand = producer(34, "cocoa", 100, 100, 400, 1);
world.cmpExport.ApplyExports();
TS_ASSERT_EQUALS(foreignLand.GetStock(), 0);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 0);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(2), 1000);
TS_ASSERT_EQUALS(world.cmpExport.GetTotalExportRevenue(2), 1000);
TS_ASSERT_EQUALS(world.cmpExport.GetTotalExported(1, "cocoa"), 0);

world = start();
g_Errors.length = 0;
const unpriced = producer(35, "spice", 10, 50, 180, 1);
world.cmpExport.ApplyExports();
TS_ASSERT_EQUALS(unpriced.GetStock(), 50);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 0);
TS_ASSERT(g_Errors.length > 0);

world = start();
const timed = producer(33, "cocoa", 100, 0, 180, 1);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 3);
advance(world.cmpTimer, 4);
TS_ASSERT_EQUALS(timed.GetStock(), 0);

world.cmpTimer = SerializationCycle(world.cmpTimer);
world.cmpFinance = SerializationCycle(world.cmpFinance);
world.cmpProduction = SerializationCycle(world.cmpProduction);
world.cmpExport = SerializationCycle(world.cmpExport);
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 3);
world.cmpProduction.OnInitGame();
world.cmpExport.OnInitGame();
world.cmpFinance.OnInitGame();
TS_ASSERT_EQUALS(world.cmpTimer.timers.size, 3);

advance(world.cmpTimer, 6);
TS_ASSERT_EQUALS(Engine.QueryInterface(33, IID_CommodityProducer).GetStock(), 100);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 0);

advance(world.cmpTimer, 10);
TS_ASSERT_EQUALS(Engine.QueryInterface(33, IID_CommodityProducer).GetStock(), 200);

advance(world.cmpTimer, 5);
TS_ASSERT_EQUALS(Engine.QueryInterface(33, IID_CommodityProducer).GetStock(), 0);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 2000);
TS_ASSERT_EQUALS(world.cmpExport.GetTotalExported(1, "cocoa"), 200);
TS_ASSERT_EQUALS(world.cmpExport.GetTotalExportRevenue(1), 2000);

world.cmpTimer = SerializationCycle(world.cmpTimer);
world.cmpFinance = SerializationCycle(world.cmpFinance);
world.cmpProduction = SerializationCycle(world.cmpProduction);
world.cmpExport = SerializationCycle(world.cmpExport);
const saved = SerializationCycle(Engine.QueryInterface(33, IID_CommodityProducer));
TS_ASSERT_EQUALS(saved.GetStock(), 0);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 2000);
TS_ASSERT_EQUALS(world.cmpExport.GetTotalExportRevenue(1), 2000);

advance(world.cmpTimer, 5);
TS_ASSERT_EQUALS(Engine.QueryInterface(33, IID_CommodityProducer).GetStock(), 100);
TS_ASSERT_EQUALS(world.cmpFinance.GetTreasury(1), 2000);
TS_ASSERT_EQUALS(world.cmpExport.GetTotalExported(1, "cocoa"), 200);
