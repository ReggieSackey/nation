function DomesticAdministration() {}

DomesticAdministration.prototype.Schema =
	"<a:component type='system'/><empty/>";

DomesticAdministration.prototype.TemplateName = "structures/nation/regional_administration";

DomesticAdministration.prototype.Init = function()
{
};

/**
 * Domestic administration is allowed only on land legally sovereign to the builder.
 * Existing effective control is not consulted.
 * @return {boolean}
 */
DomesticAdministration.prototype.MayPlace = function(playerId, x, z)
{
	if (!Number.isInteger(playerId) || playerId <= 0)
		return false;
	if (!Number.isFinite(+x) || !Number.isFinite(+z))
		return false;

	const cmpSovereignty = Engine.QueryInterface(SYSTEM_ENTITY, IID_Sovereignty);
	if (!cmpSovereignty)
		return false;

	return cmpSovereignty.GetSovereignOwner({ "x": +x, "z": +z }) === playerId;
};

Engine.RegisterSystemComponentType(IID_DomesticAdministration, "DomesticAdministration", DomesticAdministration);

/**
 * Commands.js creates g_Commands while helpers load.
 * Components load afterwards, so the construct command can be wrapped here.
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
			const cmpAdmin = Engine.QueryInterface(SYSTEM_ENTITY, IID_DomesticAdministration);
			if (!cmpAdmin || !cmpAdmin.MayPlace(player, cmd.x, cmd.z))
				return false;

			// Upstream construct does not return when CanProduce fails, and this
			// building costs nothing, so the phase gate is enforced here as well.
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
