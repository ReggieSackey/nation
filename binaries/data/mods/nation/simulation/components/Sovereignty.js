function Sovereignty() {}

Sovereignty.prototype.Schema =
	"<a:component type='system'/><empty/>";

Sovereignty.prototype.Init = function()
{
	// Static regions for this match. Plain data so the engine can serialize it.
	this.regions = [];
};

/**
 * A point on a segment, including the endpoints, belongs to that segment.
 * Coordinates used here are exact map values, so equality is exact.
 */
function pointOnSegment(x, z, ax, az, bx, bz)
{
	const cross = (z - az) * (bx - ax) - (x - ax) * (bz - az);
	if (cross !== 0)
		return false;

	const dot = (x - ax) * (bx - ax) + (z - az) * (bz - az);
	if (dot < 0)
		return false;

	const lengthSquared = (bx - ax) * (bx - ax) + (bz - az) * (bz - az);
	return dot <= lengthSquared;
}

/**
 * Even-odd ray cast along +x. Boundary points are inside.
 */
function pointInPolygon(x, z, points)
{
	const count = points.length;
	for (let i = 0, j = count - 1; i < count; j = i++)
		if (pointOnSegment(x, z, points[j].x, points[j].z, points[i].x, points[i].z))
			return true;

	let inside = false;
	for (let i = 0, j = count - 1; i < count; j = i++)
	{
		const xi = points[i].x;
		const zi = points[i].z;
		const xj = points[j].x;
		const zj = points[j].z;
		const crossesZ = (zi > z) !== (zj > z);
		if (crossesZ && x < (xj - xi) * (z - zi) / (zj - zi) + xi)
			inside = !inside;
	}
	return inside;
}

function isFiniteNumber(value)
{
	return typeof value === "number" && isFinite(value);
}

/**
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
 * First matching region wins, so a shared edge belongs to the earlier region.
 * @param {{x: number, z: number}} position - World position in map coordinates.
 * @return {number} - Player id, or INVALID_PLAYER when the point is unclaimed.
 */
Sovereignty.prototype.GetSovereignOwner = function(position)
{
	if (!position || !isFiniteNumber(position.x) || !isFiniteNumber(position.z))
	{
		error("Sovereignty.GetSovereignOwner: position must be {x, z} numbers");
		return INVALID_PLAYER;
	}

	for (let i = 0; i < this.regions.length; ++i)
		if (pointInPolygon(position.x, position.z, this.regions[i].points))
			return this.regions[i].owner;

	return INVALID_PLAYER;
};

/**
 * @return {Object[]} - Copy of the loaded regions.
 */
Sovereignty.prototype.GetRegions = function()
{
	return clone(this.regions);
};

Engine.RegisterSystemComponentType(IID_Sovereignty, "Sovereignty", Sovereignty);
