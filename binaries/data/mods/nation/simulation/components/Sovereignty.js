function Sovereignty() {}

Sovereignty.prototype.Schema =
	"<a:component type='system'/><empty/>";

Sovereignty.prototype.Init = function()
{
	// Loaded-gate data for SovereignBorderTracker. Not an ownership authority.
	this.regions = [];
};

function isFiniteNumber(value)
{
	return typeof value === "number" && isFinite(value);
}

/**
 * Remember the authored regions so callers can tell that InitGame has loaded them.
 * Ownership is not decided here. SovereigntyManager rasterizes the same settings.
 * @param {Object[]|undefined} regions - ScriptSettings.Sovereignty, or undefined when the map defines none.
 * @return {boolean} - False after reporting malformed data. The caller then stores no regions.
 */
Sovereignty.prototype.ReadRegions = function(regions)
{
	if (regions === undefined || regions === null)
	{
		this.regions = [];
		return true;
	}

	if (!Array.isArray(regions))
	{
		error("Sovereignty: expected an array of regions");
		this.regions = [];
		return false;
	}

	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	const numPlayers = cmpPlayerManager ? cmpPlayerManager.GetNumPlayers() : undefined;

	for (let i = 0; i < regions.length; ++i)
	{
		const region = regions[i];
		if (!region || !Number.isInteger(region.owner) || region.owner < 0)
		{
			error("Sovereignty: region " + i + " needs an integer owner >= 0");
			this.regions = [];
			return false;
		}
		if (numPlayers !== undefined && region.owner >= numPlayers)
		{
			error("Sovereignty: region " + i + " owner " + region.owner + " is not a player");
			this.regions = [];
			return false;
		}
		if (!Array.isArray(region.points) || region.points.length < 3)
		{
			error("Sovereignty: region " + i + " needs at least 3 points");
			this.regions = [];
			return false;
		}
		for (let p = 0; p < region.points.length; ++p)
		{
			const point = region.points[p];
			if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.z))
			{
				error("Sovereignty: region " + i + " point " + p + " needs numeric x and z");
				this.regions = [];
				return false;
			}
		}
	}

	this.regions = clone(regions);
	return true;
};

Sovereignty.prototype.OnInitGame = function()
{
	const settings = typeof InitAttributes !== "undefined" && InitAttributes.settings;
	this.ReadRegions(settings ? settings.Sovereignty : undefined);
};

/**
 * Legal owner of a world position.
 * The native grid answers. A missing manager is unclaimed, the same as byte 0.
 * @param {{x: number, z: number}} position - World position in map coordinates.
 * @return {number} - Player id, or INVALID_PLAYER when the cell is unclaimed or the manager is absent.
 */
Sovereignty.prototype.GetSovereignOwner = function(position)
{
	if (!position || !isFiniteNumber(position.x) || !isFiniteNumber(position.z))
	{
		error("Sovereignty.GetSovereignOwner: position must be {x, z} numbers");
		return INVALID_PLAYER;
	}

	const cmpNative = Engine.QueryInterface(SYSTEM_ENTITY, IID_SovereigntyManager);
	if (!cmpNative)
		return INVALID_PLAYER;

	return cmpNative.GetOwner(position.x, position.z);
};

/**
 * @return {Object[]} - Copy of the loaded regions. Empty until OnInitGame.
 */
Sovereignty.prototype.GetRegions = function()
{
	return clone(this.regions);
};

Engine.RegisterSystemComponentType(IID_Sovereignty, "Sovereignty", Sovereignty);
