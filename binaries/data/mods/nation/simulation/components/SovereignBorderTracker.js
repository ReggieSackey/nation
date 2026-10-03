function SovereignBorderTracker() {}

SovereignBorderTracker.prototype.Schema =
	"<a:component type='system'/><empty/>";

SovereignBorderTracker.prototype.Init = function()
{
	// entity id -> sovereign owner last seen at an in-world position
	this.sovereignOwners = {};
};

SovereignBorderTracker.prototype.OnGlobalPositionChanged = function(msg)
{
	if (!msg.inWorld)
		return;

	// UnitMotion is the mobile-unit component. Structures, resources, and props do not have it.
	if (!Engine.QueryInterface(msg.entity, IID_UnitMotion))
		return;

	const cmpOwnership = Engine.QueryInterface(msg.entity, IID_Ownership);
	// Gaia is 0 and unowned is INVALID_PLAYER. V1 tracks player-owned units only.
	if (!cmpOwnership || cmpOwnership.GetOwner() <= 0)
		return;

	const cmpSovereignty = Engine.QueryInterface(SYSTEM_ENTITY, IID_Sovereignty);
	// Map entities are placed before InitGame loads regions. Those updates are not crossings.
	if (!cmpSovereignty || !cmpSovereignty.GetRegions().length)
		return;

	const sovereign = cmpSovereignty.GetSovereignOwner({ "x": msg.x, "z": msg.z });
	const previous = this.sovereignOwners[msg.entity];
	this.sovereignOwners[msg.entity] = sovereign;
	if (previous === undefined || previous === sovereign)
		return;

	Engine.PostMessage(msg.entity, MT_SovereignBorderCrossed, {
		"entity": msg.entity,
		"from": previous,
		"to": sovereign
	});
};

SovereignBorderTracker.prototype.OnGlobalDestroy = function(msg)
{
	delete this.sovereignOwners[msg.entity];
};

Engine.RegisterSystemComponentType(IID_SovereignBorderTracker, "SovereignBorderTracker", SovereignBorderTracker);
