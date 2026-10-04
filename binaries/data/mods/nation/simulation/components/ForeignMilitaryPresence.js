function ForeignMilitaryPresence() {}

ForeignMilitaryPresence.prototype.Schema =
	"<a:component type='system'/><empty/>";

ForeignMilitaryPresence.prototype.Init = function()
{
	// One record per foreign owner and host sovereign. entities is a set of ids.
	this.presences = [];
};

ForeignMilitaryPresence.prototype.Find = function(foreignPlayer, hostPlayer)
{
	for (let i = 0; i < this.presences.length; ++i)
	{
		const record = this.presences[i];
		if (record.foreignPlayer === foreignPlayer && record.hostPlayer === hostPlayer)
			return record;
	}
	return undefined;
};

ForeignMilitaryPresence.prototype.CountEntities = function(record)
{
	let count = 0;
	for (const id in record.entities)
		if (record.entities[id])
			++count;
	return count;
};

/**
 * @return {boolean} - True when foreignPlayer has at least one tracked unit inside hostPlayer.
 */
ForeignMilitaryPresence.prototype.HasForeignMilitaryPresence = function(foreignPlayer, hostPlayer)
{
	return this.GetForeignMilitaryPresenceCount(foreignPlayer, hostPlayer) > 0;
};

/**
 * @return {number}
 */
ForeignMilitaryPresence.prototype.GetForeignMilitaryPresenceCount = function(foreignPlayer, hostPlayer)
{
	const record = this.Find(foreignPlayer, hostPlayer);
	return record ? this.CountEntities(record) : 0;
};

/**
 * @return {number[]} - Copy of the entity ids currently inside.
 */
ForeignMilitaryPresence.prototype.GetForeignMilitaryEntities = function(foreignPlayer, hostPlayer)
{
	const record = this.Find(foreignPlayer, hostPlayer);
	if (!record)
		return [];
	const ids = [];
	for (const id in record.entities)
		if (record.entities[id])
			ids.push(+id);
	return ids;
};

ForeignMilitaryPresence.prototype.Add = function(foreignPlayer, hostPlayer, entity)
{
	let record = this.Find(foreignPlayer, hostPlayer);
	const created = !record;
	if (!record)
	{
		record = {
			"foreignPlayer": foreignPlayer,
			"hostPlayer": hostPlayer,
			"entities": {}
		};
		this.presences.push(record);
	}
	if (record.entities[entity])
		return;
	record.entities[entity] = true;
	if (created)
		Engine.BroadcastMessage(MT_ForeignMilitaryPresenceStarted, {
			"foreignPlayer": foreignPlayer,
			"hostPlayer": hostPlayer
		});
};

ForeignMilitaryPresence.prototype.Remove = function(foreignPlayer, hostPlayer, entity)
{
	const record = this.Find(foreignPlayer, hostPlayer);
	if (!record || !record.entities[entity])
		return;
	delete record.entities[entity];
	if (this.CountEntities(record) > 0)
		return;
	this.presences.splice(this.presences.indexOf(record), 1);
	Engine.BroadcastMessage(MT_ForeignMilitaryPresenceEnded, {
		"foreignPlayer": foreignPlayer,
		"hostPlayer": hostPlayer
	});
};

ForeignMilitaryPresence.prototype.RemoveEntity = function(entity)
{
	for (let i = 0; i < this.presences.length; ++i)
	{
		const record = this.presences[i];
		if (!record.entities[entity])
			continue;
		this.Remove(record.foreignPlayer, record.hostPlayer, entity);
		--i;
	}
};

/**
 * V1 treats every mobile player unit the border tracker reports as military presence.
 * Civilian and trade units can be excluded here later.
 */
ForeignMilitaryPresence.prototype.OnGlobalSovereignBorderCrossed = function(msg)
{
	// Movement inside one sovereign region is not a crossing.
	if (msg.from === msg.to)
		return;

	const cmpOwnership = Engine.QueryInterface(msg.entity, IID_Ownership);
	const owner = cmpOwnership ? cmpOwnership.GetOwner() : undefined;
	if (!Number.isInteger(owner) || owner <= 0)
		return;

	if (msg.from > 0 && msg.from !== owner)
		this.Remove(owner, msg.from, msg.entity);
	if (msg.to > 0 && msg.to !== owner)
		this.Add(owner, msg.to, msg.entity);
};

ForeignMilitaryPresence.prototype.OnGlobalDestroy = function(msg)
{
	this.RemoveEntity(msg.entity);
};

ForeignMilitaryPresence.prototype.OnGlobalOwnershipChanged = function(msg)
{
	if (msg.from === msg.to)
		return;
	if (!Engine.QueryInterface(msg.entity, IID_UnitMotion))
		return;

	this.RemoveEntity(msg.entity);
	if (!Number.isInteger(msg.to) || msg.to <= 0)
		return;

	const cmpPosition = Engine.QueryInterface(msg.entity, IID_Position);
	if (!cmpPosition || !cmpPosition.IsInWorld())
		return;
	const pos = cmpPosition.GetPosition2D();
	const cmpSovereignty = Engine.QueryInterface(SYSTEM_ENTITY, IID_Sovereignty);
	if (!pos || !cmpSovereignty)
		return;

	// GetPosition2D stores map z in y.
	const sovereign = cmpSovereignty.GetSovereignOwner({ "x": pos.x, "z": pos.y });
	if (sovereign > 0 && sovereign !== msg.to)
		this.Add(msg.to, sovereign, msg.entity);
};

Engine.RegisterSystemComponentType(IID_ForeignMilitaryPresence, "ForeignMilitaryPresence", ForeignMilitaryPresence);
