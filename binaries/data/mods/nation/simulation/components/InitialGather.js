function InitialGather() {}

InitialGather.prototype.Schema =
	"<a:help>At the start of a match, order this worker to gather one resource entity.</a:help>" +
	"<element name='Target' a:help='Entity id of the ResourceSupply to gather.'>" +
		"<data type='positiveInteger'/>" +
	"</element>";

/**
 * Wait until the first turn. Gather rates are calculated during InitGame,
 * and a saved game already has the worker's own orders.
 */
InitialGather.prototype.OnInitGame = function()
{
	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (!cmpTimer)
		return;

	this.timer = cmpTimer.SetTimeout(this.entity, IID_InitialGather, "BeginWork", 0, null);
};

/**
 * Issue the upstream gather order once. Later work is UnitAI's.
 */
InitialGather.prototype.BeginWork = function()
{
	this.timer = 0;
	const target = this.template ? +this.template.Target : NaN;
	const cmpSupply = Engine.QueryInterface(target, IID_ResourceSupply);
	const cmpUnitAI = Engine.QueryInterface(this.entity, IID_UnitAI);
	if (!cmpSupply || !cmpUnitAI || !cmpUnitAI.Gather)
		return;

	cmpUnitAI.Gather(target, false);
};

Engine.RegisterComponentType(IID_InitialGather, "InitialGather", InitialGather);
