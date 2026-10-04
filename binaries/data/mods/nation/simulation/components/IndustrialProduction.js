function IndustrialProduction() {}

IndustrialProduction.prototype.Schema =
	"<a:help>Converts Player resources into other Player resources on a fixed interval.</a:help>" +
	"<element name='Interval' a:help='Milliseconds between production attempts.'>" +
		"<data type='positiveInteger'/>" +
	"</element>" +
	"<element name='Inputs' a:help='Resources removed from the owner when a cycle succeeds.'>" +
		Resources.BuildSchema("nonNegativeInteger") +
	"</element>" +
	"<element name='Outputs' a:help='Resources added to the owner when a cycle succeeds.'>" +
		Resources.BuildSchema("nonNegativeInteger") +
	"</element>";

IndustrialProduction.prototype.Init = function()
{
	this.timer = 0;
};

/**
 * Loaded games skip this. The timer id is serialized with the component,
 * and Timer serializes the callback, so a load does not schedule a second interval.
 */
IndustrialProduction.prototype.OnInitGame = function()
{
	this.Start();
};

IndustrialProduction.prototype.OnDestroy = function()
{
	this.Stop();
};

/**
 * Positive amounts from a recipe node. Zero and missing entries are ignored.
 * @return {Object}
 */
IndustrialProduction.prototype.Amounts = function(node)
{
	const amounts = {};
	if (!node)
		return amounts;

	for (const resource in node)
	{
		const amount = +node[resource];
		if (Number.isFinite(amount) && amount > 0)
			amounts[resource] = amount;
	}
	return amounts;
};

IndustrialProduction.prototype.Start = function()
{
	if (this.timer)
		return;

	const interval = +this.template.Interval;
	const inputs = this.Amounts(this.template.Inputs);
	const outputs = this.Amounts(this.template.Outputs);
	if (!Number.isInteger(interval) || interval <= 0 ||
		!Object.keys(inputs).length || !Object.keys(outputs).length)
		return;

	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (!cmpTimer)
		return;

	this.timer = cmpTimer.SetInterval(
		this.entity,
		IID_IndustrialProduction,
		"Produce",
		interval,
		interval,
		null
	);
};

IndustrialProduction.prototype.Stop = function()
{
	if (!this.timer)
		return;

	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (cmpTimer)
		cmpTimer.CancelTimer(this.timer);
	this.timer = 0;
};

/**
 * One recipe attempt. The owner's stockpile is read now, not cached.
 * Every input must be present or the stockpile is left unchanged.
 */
IndustrialProduction.prototype.Produce = function()
{
	const cmpOwnership = Engine.QueryInterface(this.entity, IID_Ownership);
	if (!cmpOwnership)
		return;

	const owner = cmpOwnership.GetOwner();
	if (!Number.isInteger(owner) || owner <= 0)
		return;

	const cmpPlayer = QueryPlayerIDInterface(owner);
	if (!cmpPlayer)
		return;

	const inputs = this.Amounts(this.template.Inputs);
	const outputs = this.Amounts(this.template.Outputs);
	const counts = cmpPlayer.GetResourceCounts();
	for (const resource in inputs)
		if (!Number.isFinite(counts[resource]) || counts[resource] < inputs[resource])
			return;

	if (!cmpPlayer.TrySubtractResources(inputs))
		return;

	cmpPlayer.AddResources(outputs);
};

Engine.RegisterComponentType(IID_IndustrialProduction, "IndustrialProduction", IndustrialProduction);
