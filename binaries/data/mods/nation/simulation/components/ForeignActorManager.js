function ForeignActorManager() {}

ForeignActorManager.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * A player remains a positive integer. An off-map actor is {type, id}.
 * The key is the only identity comparisons should use.
 */
var NationParticipantKey = typeof NationParticipantKey === "function" ? NationParticipantKey : function(participant)
{
	if (typeof participant === "number" && Number.isInteger(participant) && participant > 0)
		return "player:" + participant;
	if (participant && participant.type === "foreign_actor" &&
		typeof participant.id === "string" && /^[a-z][a-z0-9_]*$/.test(participant.id))
		return "foreign_actor:" + participant.id;
	return "";
};

var NationSameParticipant = typeof NationSameParticipant === "function" ? NationSameParticipant : function(left, right)
{
	const key = NationParticipantKey(left);
	return key !== "" && key === NationParticipantKey(right);
};

ForeignActorManager.prototype.Init = function()
{
	// id -> actor. Treasury lives here, not on a Player and not in GovernmentFinance.
	this.actors = {};
	this.ready = false;
};

/**
 * @return {boolean}
 */
ForeignActorManager.prototype.ValidActor = function(actor)
{
	if (!actor)
		return false;
	if (typeof actor.id !== "string" || !/^[a-z][a-z0-9_]*$/.test(actor.id))
		return false;
	if (typeof actor.name !== "string" || !actor.name.length)
		return false;
	if (actor.type !== "foreign_power")
		return false;
	if (!Number.isInteger(actor.treasury) || actor.treasury < 0)
		return false;
	if (typeof actor.responds !== "boolean")
		return false;
	return true;
};

/**
 * @return {boolean} - False when the list is present but malformed. Malformed data stores no actors.
 */
ForeignActorManager.prototype.ReadActors = function(actors)
{
	if (actors === undefined || actors === null)
	{
		this.actors = {};
		this.ready = true;
		return true;
	}
	if (!Array.isArray(actors))
	{
		error("ForeignActorManager: expected an array of actors");
		this.actors = {};
		this.ready = true;
		return false;
	}

	const stored = {};
	for (let i = 0; i < actors.length; ++i)
	{
		const actor = actors[i];
		if (!this.ValidActor(actor))
		{
			error("ForeignActorManager: actor " + i + " needs a stable id, name, foreign_power type, boolean responds, and a non-negative integer treasury");
			this.actors = {};
			this.ready = true;
			return false;
		}
		if (stored[actor.id])
		{
			error("ForeignActorManager: duplicate actor " + actor.id);
			this.actors = {};
			this.ready = true;
			return false;
		}
		stored[actor.id] = {
			"id": actor.id,
			"name": actor.name,
			"type": actor.type,
			"treasury": actor.treasury,
			"responds": actor.responds
		};
	}

	this.actors = stored;
	this.ready = true;
	return true;
};

ForeignActorManager.prototype.OnInitGame = function()
{
	if (this.ready)
		return;
	const settings = typeof InitAttributes !== "undefined" && InitAttributes.settings;
	this.ReadActors(settings ? settings.ForeignActors : undefined);
};

/**
 * @return {Object|null}
 */
ForeignActorManager.prototype.Get = function(id)
{
	if (typeof id !== "string" || !this.actors[id])
		return null;
	return this.actors[id];
};

/**
 * @return {Object[]} - Deterministic id order.
 */
ForeignActorManager.prototype.GetActors = function()
{
	const ids = Object.keys(this.actors).sort();
	const actors = [];
	for (let i = 0; i < ids.length; ++i)
		actors.push(clone(this.actors[ids[i]]));
	return actors;
};

/**
 * @return {number}
 */
ForeignActorManager.prototype.GetTreasury = function(id)
{
	const actor = this.Get(id);
	return actor ? actor.treasury : 0;
};

/**
 * @return {boolean}
 */
ForeignActorManager.prototype.CanAfford = function(id, amount)
{
	return !!this.Get(id) && Number.isInteger(amount) && amount >= 0 &&
		this.GetTreasury(id) >= amount;
};

/**
 * @return {boolean}
 */
ForeignActorManager.prototype.Spend = function(id, amount)
{
	if (!this.CanAfford(id, amount))
		return false;
	this.actors[id].treasury = this.GetTreasury(id) - amount;
	return true;
};

/**
 * @return {boolean}
 */
ForeignActorManager.prototype.AddFunds = function(id, amount)
{
	if (!this.Get(id) || !Number.isInteger(amount) || amount <= 0)
		return false;
	this.actors[id].treasury = this.GetTreasury(id) + amount;
	return true;
};

Engine.RegisterSystemComponentType(IID_ForeignActorManager, "ForeignActorManager", ForeignActorManager);

function AttachForeignActorsToSimulationState()
{
	if (typeof GuiInterface === "undefined" || !GuiInterface.prototype.GetSimulationState)
		return;
	if (GuiInterface.prototype.GetSimulationState.nationForeignActorWrapped)
		return;

	const original = GuiInterface.prototype.GetSimulationState;
	const wrapped = function()
	{
		const state = original.apply(this, arguments);
		if (!state)
			return state;
		const cmpActors = Engine.QueryInterface(SYSTEM_ENTITY, IID_ForeignActorManager);
		if (cmpActors)
			state.nationForeignActors = cmpActors.GetActors();
		return state;
	};
	wrapped.nationForeignActorWrapped = true;
	GuiInterface.prototype.GetSimulationState = wrapped;
}

AttachForeignActorsToSimulationState();
