function SovereignEntryClassifier() {}

SovereignEntryClassifier.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * V1 uses MilitaryAccess for every unit the border tracker reports.
 * The sandbox units are military. A later civilian, trade, or diplomatic
 * category check belongs in this handler.
 */
SovereignEntryClassifier.prototype.OnGlobalSovereignBorderCrossed = function(msg)
{
	// Leaving a state for unclaimed land is not an entry.
	if (msg.to === INVALID_PLAYER)
		return;

	const cmpOwnership = Engine.QueryInterface(msg.entity, IID_Ownership);
	const entityOwner = cmpOwnership ? cmpOwnership.GetOwner() : undefined;
	if (entityOwner === undefined || entityOwner <= 0)
		return;

	const cmpAccess = Engine.QueryInterface(SYSTEM_ENTITY, IID_DiplomaticAccess);
	const authorized = entityOwner === msg.to ||
		(!!cmpAccess && cmpAccess.HasMilitaryAccess(entityOwner, msg.to));

	Engine.PostMessage(msg.entity, MT_SovereignEntryClassified, {
		"entity": msg.entity,
		"entityOwner": entityOwner,
		"from": msg.from,
		"to": msg.to,
		"authorized": authorized
	});
};

Engine.RegisterSystemComponentType(IID_SovereignEntryClassifier, "SovereignEntryClassifier", SovereignEntryClassifier);
