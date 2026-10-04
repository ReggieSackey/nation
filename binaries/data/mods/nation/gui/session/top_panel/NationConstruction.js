/**
 * Loaded from gui/session/top_panel, which session.xml includes after gui/session.
 * The button shows the simulation quote for the settlement and posts the project id.
 * The formatter is repeated so this file does not depend on which top_panel script loads first.
 */
function nationFormatAmount(value)
{
	return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

g_EntityCommands["nation-construct-infrastructure"] = {
	"getInfo": function(entStates)
	{
		if (!entStates || entStates.length !== 1)
			return false;

		const quote = entStates[0].nationConstruction;
		if (!quote || !quote.authorized)
			return false;

		let tooltip = "Connect " + quote.name + "\n" +
			"Build road to " + quote.fromName + "\n" +
			"Cost: " + nationFormatAmount(quote.cost) + "\n" +
			"\n" +
			quote.name + "\n" +
			"Population: " + nationFormatAmount(quote.population) + "\n" +
			"Integration: " + quote.integration + "\n" +
			"Capital connected: " + (quote.connected ? "Yes" : "No") + "\n" +
			"Treasury: " + nationFormatAmount(quote.treasury);
		if (quote.completed)
			tooltip += "\n" + "Project completed";
		else if (!quote.canAfford)
			tooltip += "\n" + "The treasury cannot afford this road.";

		return {
			"tooltip": tooltip,
			"icon": "repair.png",
			"enabled": quote.available && quote.canAfford
		};
	},
	"execute": function(entStates)
	{
		const quote = entStates && entStates[0] && entStates[0].nationConstruction;
		if (!quote || !quote.project)
			return;
		Engine.PostNetworkCommand({
			"type": "nation-construct-infrastructure",
			"project": quote.project
		});
	},
	"allowedPlayers": ["Player"]
};
