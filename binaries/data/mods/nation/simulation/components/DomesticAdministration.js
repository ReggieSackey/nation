function DomesticAdministration() {}

DomesticAdministration.prototype.Schema =
	"<a:component type='system'/><empty/>";

DomesticAdministration.prototype.TemplateName = "structures/nation/regional_administration";

DomesticAdministration.prototype.Init = function()
{
};

// Must stay registered even though placement moved to BuildRestrictions:
// GenerateSchema emits an (invalid) empty choice for an interface with no
// implementing component.
Engine.RegisterSystemComponentType(IID_DomesticAdministration, "DomesticAdministration", DomesticAdministration);

/**
 * Spatial placement for regional administration is owned by BuildRestrictions
 * with the generic "sovereign" token. This system component remains only for
 * the phase gate: upstream TryConstructBuilding checks CanProduce after
 * CheckPlacement but does not abort construction when it fails, and this
 * building costs nothing, so the gate is enforced here.
 */
function AttachDomesticAdministrationToConstruct()
{
	if (typeof g_Commands === "undefined" || !g_Commands.construct)
		return;
	if (g_Commands.construct.nationDomesticWrapped)
		return;

	const original = g_Commands.construct;
	const wrapped = function(player, cmd, data)
	{
		if (cmd && cmd.template === DomesticAdministration.prototype.TemplateName)
		{
			const cmpTech = QueryPlayerIDInterface(player, IID_TechnologyManager);
			if (cmpTech && !cmpTech.CanProduce(cmd.template))
				return false;
		}
		return original.apply(this, arguments);
	};
	wrapped.nationDomesticWrapped = true;
	g_Commands.construct = wrapped;
}

AttachDomesticAdministrationToConstruct();
