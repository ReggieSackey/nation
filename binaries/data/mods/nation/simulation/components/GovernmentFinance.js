function GovernmentFinance() {}

GovernmentFinance.prototype.Schema =
	"<a:component type='system'/><empty/>";

/**
 * Prototype interval in simulation milliseconds.
 * This is sandbox timing, not a final fiscal calendar.
 */
GovernmentFinance.prototype.RevenueInterval = 10000;

/**
 * Prototype income: one currency unit per this many people each interval.
 * The remainder is discarded. It does not accumulate.
 * Population is temporary scaffolding for government income.
 */
GovernmentFinance.prototype.PeoplePerRevenueUnit = 100;

GovernmentFinance.prototype.Init = function()
{
	// Player id -> integer treasury. Missing players read as 0.
	this.treasuries = {};
	this.timer = 0;
	this.accountsLoaded = false;
};

/**
 * @param {number} playerId
 * @return {boolean}
 */
GovernmentFinance.prototype.IsPlayerId = function(playerId)
{
	return Number.isInteger(playerId) && playerId > 0;
};

/**
 * @param {Object[]|undefined} accounts - {player, treasury} rows. Undefined means none.
 * @return {boolean} - False when the list is present but malformed. Malformed data stores no cash.
 */
GovernmentFinance.prototype.ReadAccounts = function(accounts)
{
	if (accounts === undefined || accounts === null)
	{
		this.treasuries = {};
		this.accountsLoaded = true;
		return true;
	}

	if (!Array.isArray(accounts))
	{
		error("GovernmentFinance: expected an array of accounts");
		this.treasuries = {};
		this.accountsLoaded = true;
		return false;
	}

	const treasuries = {};
	for (let i = 0; i < accounts.length; ++i)
	{
		const account = accounts[i];
		const player = account ? +account.player : NaN;
		const treasury = account ? +account.treasury : NaN;
		if (!this.IsPlayerId(player) || !Number.isInteger(treasury) || treasury < 0)
		{
			error("GovernmentFinance: account " + i + " needs a real player and a non-negative integer treasury");
			this.treasuries = {};
			this.accountsLoaded = true;
			return false;
		}
		if (treasuries[player] !== undefined)
		{
			error("GovernmentFinance: duplicate account for player " + player);
			this.treasuries = {};
			this.accountsLoaded = true;
			return false;
		}
		treasuries[player] = treasury;
	}

	this.treasuries = treasuries;
	this.accountsLoaded = true;
	return true;
};

GovernmentFinance.prototype.OnInitGame = function()
{
	if (!this.accountsLoaded)
	{
		const settings = typeof InitAttributes !== "undefined" && InitAttributes.settings;
		this.ReadAccounts(settings ? settings.GovernmentFinance : undefined);
	}
	this.StartCollection();
};

/**
 * One repeating timer for every state. A second call does not schedule another.
 */
GovernmentFinance.prototype.StartCollection = function()
{
	if (this.timer)
		return;

	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (!cmpTimer)
		return;

	this.timer = cmpTimer.SetInterval(
		SYSTEM_ENTITY,
		IID_GovernmentFinance,
		"CollectRevenue",
		this.RevenueInterval,
		this.RevenueInterval,
		null
	);
};

/**
 * @return {number} - Whole currency units. Zero when this player has no account.
 */
GovernmentFinance.prototype.GetTreasury = function(playerId)
{
	if (!this.IsPlayerId(playerId) || this.treasuries[playerId] === undefined)
		return 0;
	return this.treasuries[playerId];
};

/**
 * Current sovereign settlement population, divided by PeoplePerRevenueUnit.
 * Queried live. Not cached. Not scaled by state integration.
 * @return {number}
 */
GovernmentFinance.prototype.GetRevenuePerTick = function(playerId)
{
	if (!this.IsPlayerId(playerId))
		return 0;

	const cmpSettlements = Engine.QueryInterface(SYSTEM_ENTITY, IID_NationSettlementManager);
	if (!cmpSettlements)
		return 0;

	return Math.floor(cmpSettlements.GetTotalPopulation(playerId) / this.PeoplePerRevenueUnit);
};

/**
 * @return {boolean}
 */
GovernmentFinance.prototype.CanAfford = function(playerId, amount)
{
	return this.IsPlayerId(playerId) && Number.isInteger(amount) && amount >= 0 &&
		this.GetTreasury(playerId) >= amount;
};

/**
 * Subtract a non-negative integer. The treasury does not go below zero.
 * @return {boolean}
 */
GovernmentFinance.prototype.Spend = function(playerId, amount)
{
	if (!this.CanAfford(playerId, amount))
		return false;

	this.treasuries[playerId] = this.GetTreasury(playerId) - amount;
	return true;
};

/**
 * Add a positive integer. Negative amounts are not a way to spend.
 * @return {boolean}
 */
GovernmentFinance.prototype.AddFunds = function(playerId, amount)
{
	if (!this.IsPlayerId(playerId) || !Number.isInteger(amount) || amount <= 0)
		return false;

	this.treasuries[playerId] = this.GetTreasury(playerId) + amount;
	return true;
};

/**
 * Add this interval's population revenue to each real player.
 */
GovernmentFinance.prototype.CollectRevenue = function()
{
	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	if (!cmpPlayerManager)
		return;

	const count = cmpPlayerManager.GetNumPlayers();
	for (let player = 1; player < count; ++player)
	{
		const revenue = this.GetRevenuePerTick(player);
		if (revenue > 0)
			this.AddFunds(player, revenue);
	}
};

Engine.RegisterSystemComponentType(IID_GovernmentFinance, "GovernmentFinance", GovernmentFinance);
