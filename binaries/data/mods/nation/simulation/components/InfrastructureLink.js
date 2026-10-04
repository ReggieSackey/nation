function InfrastructureLink() {}

InfrastructureLink.prototype.Schema =
	"<a:help>A physical connection between two settlements. It does not change state integration by itself.</a:help>" +
	"<element name='From' a:help='Entity id of one settlement.'>" +
		"<data type='positiveInteger'/>" +
	"</element>" +
	"<element name='To' a:help='Entity id of the other settlement.'>" +
		"<data type='positiveInteger'/>" +
	"</element>";

InfrastructureLink.prototype.Init = function()
{
	const from = this.template ? +this.template.From : NaN;
	const to = this.template ? +this.template.To : NaN;
	if (!Number.isInteger(from) || from <= 0 || !Number.isInteger(to) || to <= 0 || from === to)
	{
		error("InfrastructureLink: entity " + this.entity + " needs two different settlement entity ids");
		this.from = 0;
		this.to = 0;
		return;
	}

	this.from = from;
	this.to = to;
};

/**
 * @return {number}
 */
InfrastructureLink.prototype.GetFrom = function()
{
	return this.from;
};

/**
 * @return {number}
 */
InfrastructureLink.prototype.GetTo = function()
{
	return this.to;
};

/**
 * True when the stored endpoints are two different entity ids.
 * Settlement existence is checked when the connectivity graph is built.
 * @return {boolean}
 */
InfrastructureLink.prototype.IsUsable = function()
{
	return this.from > 0 && this.to > 0 && this.from !== this.to;
};

Engine.RegisterComponentType(IID_InfrastructureLink, "InfrastructureLink", InfrastructureLink);
