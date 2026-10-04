function DiplomaticAccess() {}

DiplomaticAccess.prototype.Schema =
	"<a:component type='system'/><empty/>";

DiplomaticAccess.prototype.Init = function()
{
	this.grants = [];
};

/**
 * @param {Object[]|undefined} grants - {from, to, military} rules. Undefined means none.
 * @return {boolean} - False when the list is present but malformed. Malformed data grants nothing.
 */
DiplomaticAccess.prototype.ReadGrants = function(grants)
{
	if (grants === undefined)
	{
		this.grants = [];
		return true;
	}

	if (!Array.isArray(grants))
	{
		error("DiplomaticAccess: expected an array of grants");
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
			typeof grant.military !== "boolean")
		{
			error("DiplomaticAccess: grant " + i + " needs integer from, integer to, and boolean military");
			this.grants = [];
			return false;
		}
		if (numPlayers !== undefined && (grant.from >= numPlayers || grant.to >= numPlayers))
		{
			error("DiplomaticAccess: grant " + i + " names a player that does not exist");
			this.grants = [];
			return false;
		}
	}

	this.grants = clone(grants);
	return true;
};

DiplomaticAccess.prototype.OnInitGame = function()
{
	const settings = typeof InitAttributes !== "undefined" && InitAttributes.settings;
	this.ReadGrants(settings ? settings.MilitaryAccess : undefined);
};

/**
 * May units owned by fromPlayer enter land sovereign to toPlayer?
 * The first matching grant wins. A missing grant is denial.
 * This does not read ally, enemy, or neutral stance.
 * @return {boolean}
 */
DiplomaticAccess.prototype.HasMilitaryAccess = function(fromPlayer, toPlayer)
{
	for (let i = 0; i < this.grants.length; ++i)
	{
		const grant = this.grants[i];
		if (grant.from === fromPlayer && grant.to === toPlayer)
			return grant.military;
	}
	return false;
};

/**
 * Grant fromPlayer the right to enter land sovereign to toPlayer.
 * An existing row for that pair is set true. A second grant does not add another row and does not revoke.
 * @return {boolean}
 */
DiplomaticAccess.prototype.GrantMilitaryAccess = function(fromPlayer, toPlayer)
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
			grant.military = true;
			return true;
		}
	}

	this.grants.push({
		"from": fromPlayer,
		"to": toPlayer,
		"military": true
	});
	return true;
};

Engine.RegisterSystemComponentType(IID_DiplomaticAccess, "DiplomaticAccess", DiplomaticAccess);
