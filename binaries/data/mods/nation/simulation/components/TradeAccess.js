function TradeAccess() {}

TradeAccess.prototype.Schema =
	"<a:component type='system'/><empty/>";

TradeAccess.prototype.Init = function()
{
	this.grants = [];
};

/**
 * @param {Object[]|undefined} grants - {from, to, trade} rules. Undefined means none.
 * @return {boolean} - False when the list is present but malformed. Malformed data grants nothing.
 */
TradeAccess.prototype.ReadGrants = function(grants)
{
	if (grants === undefined)
	{
		this.grants = [];
		return true;
	}

	if (!Array.isArray(grants))
	{
		error("TradeAccess: expected an array of grants");
		this.grants = [];
		return false;
	}

	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	const numPlayers = cmpPlayerManager ? cmpPlayerManager.GetNumPlayers() : undefined;

	for (let i = 0; i < grants.length; ++i)
	{
		const grant = grants[i];
		if (!grant || !Number.isInteger(grant.from) || grant.from < 0 ||
			!Number.isInteger(grant.to) || grant.to < 0 ||
			typeof grant.trade !== "boolean")
		{
			error("TradeAccess: grant " + i + " needs integer from, integer to, and boolean trade");
			this.grants = [];
			return false;
		}
		if (numPlayers !== undefined && (grant.from >= numPlayers || grant.to >= numPlayers))
		{
			error("TradeAccess: grant " + i + " names a player that does not exist");
			this.grants = [];
			return false;
		}
	}

	this.grants = clone(grants);
	return true;
};

TradeAccess.prototype.OnInitGame = function()
{
	const settings = typeof InitAttributes !== "undefined" && InitAttributes.settings;
	this.ReadGrants(settings ? settings.TradeAccess : undefined);
};

/**
 * May fromPlayer buy from toPlayer?
 * The first matching grant wins. A missing grant is denial.
 * This does not read military access, ally, enemy, or neutral stance.
 * A grant from 1 to 2 does not grant 2 to 1.
 * @return {boolean}
 */
TradeAccess.prototype.CanTrade = function(fromPlayer, toPlayer)
{
	for (let i = 0; i < this.grants.length; ++i)
	{
		const grant = this.grants[i];
		if (grant.from === fromPlayer && grant.to === toPlayer)
			return grant.trade;
	}
	return false;
};

/**
 * Grant fromPlayer permission to buy from toPlayer.
 * An existing row for that pair is set true. A second grant does not add another row and does not revoke.
 * @return {boolean}
 */
TradeAccess.prototype.GrantTrade = function(fromPlayer, toPlayer)
{
	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	const numPlayers = cmpPlayerManager ? cmpPlayerManager.GetNumPlayers() : 0;
	if (!Number.isInteger(fromPlayer) || !Number.isInteger(toPlayer) ||
		fromPlayer < 0 || toPlayer < 0 || fromPlayer >= numPlayers || toPlayer >= numPlayers ||
		fromPlayer === toPlayer)
		return false;

	for (let i = 0; i < this.grants.length; ++i)
	{
		const grant = this.grants[i];
		if (grant.from === fromPlayer && grant.to === toPlayer)
		{
			grant.trade = true;
			return true;
		}
	}

	this.grants.push({
		"from": fromPlayer,
		"to": toPlayer,
		"trade": true
	});
	return true;
};

Engine.RegisterSystemComponentType(IID_TradeAccess, "TradeAccess", TradeAccess);
