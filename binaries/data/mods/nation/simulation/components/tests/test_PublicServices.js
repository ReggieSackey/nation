Engine.LoadComponentScript("interfaces/PublicService.js");
Engine.LoadComponentScript("interfaces/PublicServiceManager.js");
Engine.LoadComponentScript("interfaces/NationSettlement.js");
Engine.RegisterInterface("Foundation");
Engine.RegisterInterface("Health");
Engine.RegisterInterface("Ownership");
Engine.RegisterInterface("Position");
Engine.LoadComponentScript("PublicService.js");
Engine.LoadComponentScript("PublicServiceManager.js");

let services = [];
Engine.GetEntitiesWithInterface = iid => iid === IID_PublicService ? services.slice() : [];

function position(entity, x, y)
{
	AddMock(entity, IID_Position, {
		"IsInWorld": () => true,
		"GetPosition2D": () => ({ "x": x, "y": y })
	});
}

function service(entity, owner, type, radius, level, x, y)
{
	services.push(entity);
	position(entity, x, y);
	AddMock(entity, IID_Ownership, { "GetOwner": () => owner });
	AddMock(entity, IID_Health, { "GetHitpoints": () => 100 });
	ConstructComponent(entity, "PublicService", {
		"Type": type,
		"Radius": String(radius),
		"Level": String(level)
	});
}

position(10, 100, 100);
AddMock(10, IID_NationSettlement, { "GetSovereignOwner": () => 1 });
service(20, 1, "education", 150, 1, 200, 100);
service(21, 1, "education", 300, 3, 350, 100);
service(22, 1, "healthcare", 140, 1, 239, 100);
service(23, 1, "electricity", 120, 1, 221, 100);
service(24, 2, "electricity", 450, 3, 100, 100);

const manager = ConstructComponent(SYSTEM_ENTITY, "PublicServiceManager");
TS_ASSERT_UNEVAL_EQUALS(manager.GetCoverage(10), {
	"education": 3,
	"healthcare": 1,
	"electricity": 0
});
TS_ASSERT_UNEVAL_EQUALS(manager.GetMissing(10), ["electricity"]);

// A foundation does not provide service until ordinary construction completes.
AddMock(23, IID_Foundation, {});
TS_ASSERT_EQUALS(manager.GetCoverage(10).electricity, 0);
DeleteMock(23, IID_Foundation);
position(23, 219, 100);
TS_ASSERT_EQUALS(manager.GetCoverage(10).electricity, 1);

// Destroyed and foreign-owned buildings never satisfy local public service.
AddMock(22, IID_Health, { "GetHitpoints": () => 0 });
TS_ASSERT_EQUALS(manager.GetCoverage(10).healthcare, 0);
TS_ASSERT_EQUALS(manager.GetCoverage(10).education, 3);
