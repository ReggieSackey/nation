function TransitAccess() {}

TransitAccess.prototype.Schema =
	"<a:component type='system'/><empty/>";

TransitAccess.prototype.Init = function()
{
	this.grants = [];
};

/**
 * @param {Object[]|undefined} grants - {from, to, transit} rules. Undefined means none.
 * @return {boolean} - False when the list is present but malformed. Malformed data grants nothing.
 */
TransitAccess.prototype.ReadGrants = function(grants)
{
	if (grants === undefined)
	{
		this.grants = [];
		return true;
	}

	if (!Array.isArray(grants))
	{
		error("TransitAccess: expected an array of grants");
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
			typeof grant.transit !== "boolean")
		{
			error("TransitAccess: grant " + i + " needs integer from, integer to, and boolean transit");
			this.grants = [];
			return false;
		}
		if (numPlayers !== undefined && (grant.from >= numPlayers || grant.to >= numPlayers))
		{
			error("TransitAccess: grant " + i + " names a player that does not exist");
			this.grants = [];
			return false;
		}
	}

	this.grants = clone(grants);
	return true;
};

TransitAccess.prototype.OnInitGame = function()
{
	const settings = typeof InitAttributes !== "undefined" && InitAttributes.settings;
	this.ReadGrants(settings ? settings.TransitAccess : undefined);
};

/**
 * May user's commercial traffic cross infrastructure in grantor's sovereign territory?
 * The first matching grant wins. A missing grant is denial.
 * This does not read trade access, military access, or diplomatic stance.
 * A grant from 1 through 4 does not grant 4 through 1.
 * @return {boolean}
 */
TransitAccess.prototype.CanTransit = function(user, grantor)
{
	for (let i = 0; i < this.grants.length; ++i)
	{
		const grant = this.grants[i];
		if (grant.from === user && grant.to === grantor)
			return grant.transit;
	}
	return false;
};

/**
 * @return {boolean}
 */
TransitAccess.prototype.ValidPair = function(user, grantor)
{
	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	const numPlayers = cmpPlayerManager ? cmpPlayerManager.GetNumPlayers() : 0;
	return Number.isInteger(user) && Number.isInteger(grantor) &&
		user > 0 && grantor > 0 && user < numPlayers && grantor < numPlayers &&
		user !== grantor;
};

/**
 * Grant user permission to traverse grantor's sovereign territory.
 * An existing row for that pair is set true. A second grant does not add another row.
 * @return {boolean}
 */
TransitAccess.prototype.GrantTransit = function(user, grantor)
{
	if (!this.ValidPair(user, grantor))
		return false;

	for (let i = 0; i < this.grants.length; ++i)
	{
		const grant = this.grants[i];
		if (grant.from === user && grant.to === grantor)
		{
			grant.transit = true;
			return true;
		}
	}

	this.grants.push({
		"from": user,
		"to": grantor,
		"transit": true
	});
	return true;
};

/**
 * Withdraw permission. A missing row is already a denial.
 * @return {boolean}
 */
TransitAccess.prototype.RevokeTransit = function(user, grantor)
{
	if (!this.ValidPair(user, grantor))
		return false;

	for (let i = 0; i < this.grants.length; ++i)
	{
		const grant = this.grants[i];
		if (grant.from === user && grant.to === grantor)
		{
			grant.transit = false;
			return true;
		}
	}
	return true;
};

Engine.RegisterSystemComponentType(IID_TransitAccess, "TransitAccess", TransitAccess);

function RegisterTransitCommands()
{
	if (typeof g_Commands === "undefined")
		return;

	g_Commands["nation-revoke-transit"] = function(player, cmd)
	{
		const cmpTransit = Engine.QueryInterface(SYSTEM_ENTITY, IID_TransitAccess);
		if (!cmpTransit || !cmd)
			return;
		cmpTransit.RevokeTransit(cmd.user, player);
	};
}

RegisterTransitCommands();
