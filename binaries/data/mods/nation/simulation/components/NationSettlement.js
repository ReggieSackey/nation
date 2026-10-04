function NationSettlement() {}

NationSettlement.prototype.Schema =
	"<a:help>Aggregate population and state integration of a populated place. This is not the unit population cap.</a:help>" +
	"<element name='Name' a:help='Settlement name.'>" +
		"<data type='string'>" +
			"<param name='minLength'>1</param>" +
		"</data>" +
	"</element>" +
	"<element name='Population' a:help='Number of people living in this settlement.'>" +
		"<data type='nonNegativeInteger'/>" +
	"</element>" +
	"<element name='StateIntegration' a:help='How far this settlement is integrated into the sovereign state, from 0 to 100.'>" +
		"<data type='decimal'>" +
			"<param name='minInclusive'>0</param>" +
			"<param name='maxInclusive'>100</param>" +
		"</data>" +
	"</element>" +
	"<element name='IsCapital' a:help='Whether this settlement is the capital of its sovereign state.'>" +
		"<data type='boolean'/>" +
	"</element>";

/**
 * Template booleans arrive as the strings "true" and "false".
 * @return {boolean|undefined}
 */
NationSettlement.prototype.ReadFlag = function(value)
{
	if (value === true || value === "true")
		return true;
	if (value === false || value === "false")
		return false;
	return undefined;
};

/**
 * @return {boolean} - True when name, population, integration, and the capital flag are usable.
 */
NationSettlement.prototype.DataIsValid = function(name, population, integration, isCapital)
{
	return typeof name === "string" && name.trim().length > 0 &&
		Number.isInteger(population) && population >= 0 &&
		Number.isFinite(integration) && integration >= 0 && integration <= 100 &&
		(isCapital === true || isCapital === false);
};

NationSettlement.prototype.Init = function()
{
	// Runtime political state. Templates do not set a historical starting unrest.
	this.discontent = 0;
	const name = this.template && this.template.Name != null ? String(this.template.Name) : "";
	const population = this.template ? +this.template.Population : NaN;
	const integration = this.template ? +this.template.StateIntegration : NaN;
	const isCapital = this.ReadFlag(this.template ? this.template.IsCapital : undefined);
	if (!this.DataIsValid(name, population, integration, isCapital))
	{
		error("Invalid NationSettlement data on entity " + this.entity);
		this.name = "";
		this.population = 0;
		this.stateIntegration = 0;
		this.isCapital = false;
		return;
	}

	this.name = name;
	this.population = population;
	this.stateIntegration = integration;
	this.isCapital = isCapital;
};

/**
 * @return {string}
 */
NationSettlement.prototype.GetName = function()
{
	return this.name;
};

/**
 * @return {number} - People living here. Not a unit-cap cost.
 */
NationSettlement.prototype.GetPopulation = function()
{
	return this.population;
};

/**
 * Replace the demographic population. This does not create or remove physical units.
 * @return {number} - The stored population, or the previous value when the input is rejected.
 */
NationSettlement.prototype.SetPopulation = function(value)
{
	if (!Number.isInteger(value) || value < 0)
	{
		error("NationSettlement.SetPopulation: value must be a non-negative integer");
		return this.population;
	}

	this.population = value;
	if (Engine.BroadcastMessage)
		Engine.BroadcastMessage(MT_NationPopulationChanged, { "entity": this.entity });
	return this.population;
};

/**
 * @return {number} - Integration from 0 to 100.
 */
NationSettlement.prototype.GetStateIntegration = function()
{
	return this.stateIntegration;
};

/**
 * @return {boolean}
 */
NationSettlement.prototype.GetIsCapital = function()
{
	return this.isCapital;
};

/**
 * Move integration by delta and keep it inside 0–100.
 * @return {number} - The clamped value.
 */
NationSettlement.prototype.ChangeStateIntegration = function(delta)
{
	if (!Number.isFinite(delta))
	{
		error("NationSettlement.ChangeStateIntegration: delta must be a finite number");
		return this.stateIntegration;
	}

	let next = this.stateIntegration + delta;
	if (next < 0)
		next = 0;
	if (next > 100)
		next = 100;
	this.stateIntegration = next;
	return next;
};

/**
 * @return {number} - Political instability from 0 to 100. 0 is calm.
 */
NationSettlement.prototype.GetDiscontent = function()
{
	return this.discontent;
};

/**
 * Store an integer discontent and keep it inside 0–100.
 * @return {number} - The clamped value.
 */
NationSettlement.prototype.SetDiscontent = function(value)
{
	if (!Number.isInteger(value))
	{
		error("NationSettlement.SetDiscontent: value must be an integer");
		return this.discontent;
	}

	if (value < 0)
		value = 0;
	if (value > 100)
		value = 100;
	this.discontent = value;
	return this.discontent;
};

/**
 * Move discontent by an integer delta and keep it inside 0–100.
 * @return {number} - The clamped value.
 */
NationSettlement.prototype.ChangeDiscontent = function(delta)
{
	if (!Number.isInteger(delta))
	{
		error("NationSettlement.ChangeDiscontent: delta must be an integer");
		return this.discontent;
	}
	return this.SetDiscontent(this.discontent + delta);
};

/**
 * Legal owner of the land under this settlement. Not the entity's Ownership.
 * @return {number}
 */
NationSettlement.prototype.GetSovereignOwner = function()
{
	const cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
	if (!cmpPosition || !cmpPosition.IsInWorld())
		return INVALID_PLAYER;
	const pos = cmpPosition.GetPosition2D();
	const cmpSovereignty = Engine.QueryInterface(SYSTEM_ENTITY, IID_Sovereignty);
	if (!pos || !cmpSovereignty)
		return INVALID_PLAYER;

	// GetPosition2D stores map z in y.
	return cmpSovereignty.GetSovereignOwner({ "x": pos.x, "z": pos.y });
};

Engine.RegisterComponentType(IID_NationSettlement, "NationSettlement", NationSettlement);
