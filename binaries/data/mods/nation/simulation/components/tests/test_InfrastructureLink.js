Engine.LoadComponentScript("interfaces/SettlementConnectivity.js");
Engine.LoadComponentScript("interfaces/InfrastructureLink.js");
Engine.LoadComponentScript("InfrastructureLink.js");

const g_Errors = [];
error = function(message)
{
	g_Errors.push(String(message));
};

const valid = ConstructComponent(40, "InfrastructureLink", {
	"From": "30",
	"To": "31"
});
TS_ASSERT_EQUALS(valid.GetFrom(), 30);
TS_ASSERT_EQUALS(valid.GetTo(), 31);
TS_ASSERT_EQUALS(valid.IsUsable(), true);
TS_ASSERT_EQUALS(valid.GetCondition(), 100);
TS_ASSERT_EQUALS(valid.GetConditionFraction(), 1);
TS_ASSERT_EQUALS(valid.IsOperational(), true);
TS_ASSERT_EQUALS(valid.SetCondition(50), true);
TS_ASSERT_EQUALS(valid.GetCondition(), 50);
TS_ASSERT_EQUALS(valid.GetConditionFraction(), 0.5);
TS_ASSERT_EQUALS(valid.SetCondition(150), true);
TS_ASSERT_EQUALS(valid.GetCondition(), 100);
TS_ASSERT_EQUALS(valid.SetCondition(-4), true);
TS_ASSERT_EQUALS(valid.GetCondition(), 0);
TS_ASSERT_EQUALS(valid.IsOperational(), false);
TS_ASSERT_EQUALS(valid.SetCondition(NaN), false);
TS_ASSERT_EQUALS(valid.GetCondition(), 0);
TS_ASSERT_EQUALS(valid.SetCondition(100), true);

const restored = SerializationCycle(valid);
TS_ASSERT_EQUALS(restored.GetFrom(), 30);
TS_ASSERT_EQUALS(restored.GetTo(), 31);
TS_ASSERT_EQUALS(restored.IsUsable(), true);
TS_ASSERT_EQUALS(restored.GetCondition(), 100);
TS_ASSERT_EQUALS(restored.IsOperational(), true);

g_Errors.length = 0;
const same = ConstructComponent(41, "InfrastructureLink", {
	"From": "30",
	"To": "30"
});
TS_ASSERT_EQUALS(same.IsUsable(), false);
TS_ASSERT_EQUALS(same.GetFrom(), 0);
TS_ASSERT(g_Errors.length > 0);

g_Errors.length = 0;
const missing = ConstructComponent(42, "InfrastructureLink", {
	"From": "0",
	"To": "31"
});
TS_ASSERT_EQUALS(missing.IsUsable(), false);
TS_ASSERT(g_Errors.length > 0);
