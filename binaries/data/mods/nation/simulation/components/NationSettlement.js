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
	"</element>";

/**
 * @return {boolean} - True when name, population, and integration are usable.
 */
NationSettlement.prototype.DataIsValid = function(name, population, integration)
{
	return typeof name === "string" && name.trim().length > 0 &&
		Number.isInteger(population) && population >= 0 &&
		Number.isFinite(integration) && integration >= 0 && integration <= 100;
};

NationSettlement.prototype.Init = function()
{
	const name = this.template && this.template.Name != null ? String(this.template.Name) : "";
	const population = this.template ? +this.template.Population : NaN;
	const integration = this.template ? +this.template.StateIntegration : NaN;
	if (!this.DataIsValid(name, population, integration))
	{
		error("Invalid NationSettlement data on entity " + this.entity);
		this.name = "";
		this.population = 0;
		this.stateIntegration = 0;
		return;
	}

	this.name = name;
	this.population = population;
	this.stateIntegration = integration;
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
 * @return {number} - Integration from 0 to 100.
 */
NationSettlement.prototype.GetStateIntegration = function()
{
	return this.stateIntegration;
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
