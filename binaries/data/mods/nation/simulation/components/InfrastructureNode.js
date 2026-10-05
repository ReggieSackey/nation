function InfrastructureNode() {}

InfrastructureNode.prototype.Schema =
	"<a:help>Marks an entity as a node in the physical infrastructure graph. Settlements are nodes through NationSettlement. This component is for endpoints that are not settlements, such as a trade depot or a corridor junction.</a:help>" +
	"<element name='Kind' a:help='commercial for a trade endpoint or junction. Later kinds can name a port or a rail terminal without a new component.'>" +
		"<text/>" +
	"</element>";

InfrastructureNode.prototype.Init = function()
{
	const kind = this.template && this.template.Kind != null ? String(this.template.Kind) : "";
	if (kind !== "commercial")
	{
		error("InfrastructureNode: entity " + this.entity + " needs kind commercial");
		this.kind = "";
		return;
	}
	this.kind = kind;
};

/**
 * @return {string}
 */
InfrastructureNode.prototype.GetKind = function()
{
	return this.kind;
};

/**
 * @return {boolean}
 */
InfrastructureNode.prototype.IsNode = function()
{
	return this.kind === "commercial";
};

Engine.RegisterComponentType(IID_InfrastructureNode, "InfrastructureNode", InfrastructureNode);
