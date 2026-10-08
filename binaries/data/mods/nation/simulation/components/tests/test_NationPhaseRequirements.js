Engine.LoadComponentScript("interfaces/GovernmentFinance.js");
Engine.LoadComponentScript("interfaces/NationSettlementManager.js");

function TechnologyManager() {}
TechnologyManager.prototype.CanResearch = function() { return true; };
TechnologyManager.prototype.Technology = function(templateName, player)
{
	this.templateName = templateName;
	this.player = player;
};
TechnologyManager.prototype.Technology.prototype.Queue = function()
{
	this.resources = { "food": 300 };
	return this.queueSucceeds;
};
TechnologyManager.prototype.Technology.prototype.Stop = function()
{
	this.stopped = true;
};
TechnologyManager.prototype.Technology.prototype.SerializableAttributes = [];

let treasury = 300000;
let people = 20000;
let refunded = 0;
AddMock(1, IID_Player, {
	"GetPlayerID": () => 1,
	"RefundResources": () => { ++refunded; }
});
AddMock(SYSTEM_ENTITY, IID_GovernmentFinance, {
	"CanAfford": () => treasury >= 300000,
	"Spend": () =>
	{
		if (treasury < 300000)
			return false;
		treasury -= 300000;
		return true;
	},
	"AddFunds": (player, amount) => { treasury += amount; }
});
AddMock(SYSTEM_ENTITY, IID_NationSettlementManager, {
	"GetTotalPopulation": () => people
});

Engine.LoadComponentScript("ZZNationPhaseRequirements.js");

const manager = new TechnologyManager();
manager.entity = 1;
TS_ASSERT(manager.CanResearch("phase_town_athen"));
people = 19999;
TS_ASSERT(!manager.CanResearch("phase_town_athen"));
people = 20000;
treasury = 299999;
TS_ASSERT(!manager.CanResearch("phase_town_athen"));

treasury = 300000;
const phase = new TechnologyManager.prototype.Technology("phase_town_athen", 1);
phase.queueSucceeds = true;
TS_ASSERT(phase.Queue({}));
TS_ASSERT_EQUALS(treasury, 0);
TS_ASSERT_EQUALS(phase.nationTreasurySpent, 300000);
phase.Stop();
TS_ASSERT_EQUALS(treasury, 300000);
TS_ASSERT_EQUALS(phase.nationTreasurySpent, 0);

const unaffordable = new TechnologyManager.prototype.Technology("phase_town_athen", 1);
unaffordable.queueSucceeds = true;
treasury = 299999;
TS_ASSERT(!unaffordable.Queue({}));
TS_ASSERT_EQUALS(refunded, 0);

const queueFailure = new TechnologyManager.prototype.Technology("phase_town_athen", 1);
queueFailure.queueSucceeds = false;
treasury = 300000;
TS_ASSERT(!queueFailure.Queue({}));
TS_ASSERT_EQUALS(treasury, 300000);
