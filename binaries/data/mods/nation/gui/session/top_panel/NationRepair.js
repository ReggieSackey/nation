/**
 * Loaded from gui/session/top_panel, which session.xml includes after gui/session.
 * g_EntityCommands therefore already exists. This file only adds one command.
 */
function nationFormatAmount(value)
{
	return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

g_EntityCommands["nation-repair-infrastructure"] = {
	"getInfo": function(entStates)
	{
		if (!entStates || entStates.length !== 1)
			return false;

		const quote = entStates[0].nationRepair;
		if (!quote || !quote.authorized)
			return false;

		let tooltip = "Repair infrastructure" + "\n" +
			"Condition: " + quote.condition + "%" + "\n" +
			"Cost: " + nationFormatAmount(quote.cost) + "\n" +
			"Treasury: " + nationFormatAmount(quote.treasury);
		if (!quote.repairable)
			tooltip += "\n" + "The road is already fully operational.";
		else if (!quote.canAfford)
			tooltip += "\n" + "The treasury cannot afford this repair.";

		return {
			"tooltip": tooltip,
			"icon": "repair.png",
			"enabled": quote.repairable && quote.canAfford
		};
	},
	"execute": function(entStates)
	{
		if (!entStates || !entStates[0])
			return;
		Engine.PostNetworkCommand({
			"type": "nation-repair-infrastructure",
			"entity": entStates[0].id
		});
	},
	"allowedPlayers": ["Player"]
};
