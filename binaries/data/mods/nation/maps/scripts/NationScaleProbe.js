/**
 * Reproducible load for a larger Nation map.
 * Spawns a fixed grid, then walks and gathers until SCALE_DONE.
 * Counts are chosen by the map name: "Scale A", "Scale B", or "Scale C".
 */
var g_ScaleProbeCases = {
	"Scale A": { "structures": 8, "units": 8 },
	"Scale B": { "structures": 130, "units": 100 },
	"Scale C": { "structures": 180, "units": 300 }
};

Trigger.prototype.ScaleProbeDuration = 30000;

Trigger.prototype.ScaleProbeStart = function()
{
	const name = InitAttributes && InitAttributes.settings && InitAttributes.settings.mapName;
	const spec = g_ScaleProbeCases[name] || g_ScaleProbeCases["Scale A"];
	const mapSize = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain).GetMapSize();
	const centers = [
		[0.28, 0.28],
		[0.30, 0.72],
		[0.55, 0.48],
		[0.75, 0.25],
		[0.74, 0.74]
	];
	const structures = [];
	for (let i = 0; i < spec.structures; ++i)
	{
		const center = centers[i % centers.length];
		const column = Math.floor(i / centers.length) % 8;
		const row = Math.floor(i / (centers.length * 8));
		const x = center[0] * mapSize + (column - 3) * 16;
		const z = center[1] * mapSize + (row - 1) * 16;
		const ent = Engine.AddEntity("structures/athen/house");
		const cmpPosition = Engine.QueryInterface(ent, IID_Position);
		const cmpOwnership = Engine.QueryInterface(ent, IID_Ownership);
		if (!cmpPosition)
			continue;
		cmpPosition.JumpTo(x, z);
		if (cmpOwnership)
			cmpOwnership.SetOwner(1);
		structures.push(ent);
	}

	const field = Engine.AddEntity("structures/nation/crisis_field");
	const fieldPosition = Engine.QueryInterface(field, IID_Position);
	const fieldOwner = Engine.QueryInterface(field, IID_Ownership);
	if (fieldPosition)
		fieldPosition.JumpTo(0.28 * mapSize + 40, 0.28 * mapSize + 40);
	if (fieldOwner)
		fieldOwner.SetOwner(1);

	const units = [];
	for (let i = 0; i < spec.units; ++i)
	{
		const center = centers[i % centers.length];
		const ent = Engine.AddEntity(i % 5 === 0 ?
			"units/nation/crisis_farmer" : "units/athen/infantry_spearman_b");
		const cmpPosition = Engine.QueryInterface(ent, IID_Position);
		const cmpOwnership = Engine.QueryInterface(ent, IID_Ownership);
		if (!cmpPosition)
			continue;
		cmpPosition.JumpTo(center[0] * mapSize + (i % 10) * 3, center[1] * mapSize + Math.floor(i / 10) % 10);
		if (cmpOwnership)
			cmpOwnership.SetOwner(1);
		units.push(ent);
	}

	const walkers = [];
	const gatherers = [];
	for (let i = 0; i < units.length; ++i)
	{
		if (i % 4 === 0)
			gatherers.push(units[i]);
		else
			walkers.push(units[i]);
	}
	if (walkers.length)
		ProcessCommand(1, {
			"type": "walk",
			"entities": walkers,
			"x": 0.74 * mapSize,
			"z": 0.74 * mapSize,
			"queued": false
		});
	for (let i = 0; i < gatherers.length; ++i)
	{
		const cmpUnitAI = Engine.QueryInterface(gatherers[i], IID_UnitAI);
		if (cmpUnitAI)
			cmpUnitAI.Gather(field, false);
	}

	this.scaleStarted = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime();
	this.scaleWalker = walkers.length ? walkers[0] : INVALID_ENTITY;
	const walkerPos = Engine.QueryInterface(this.scaleWalker, IID_Position);
	this.scaleWalkerStart = walkerPos ? walkerPos.GetPosition2D() : null;
	print("SCALE_SPAWNED name=" + name +
		" map=" + mapSize +
		" structures=" + structures.length +
		" units=" + units.length + "\n");
	this.DoAfterDelay(this.ScaleProbeDuration, "ScaleProbeFinish", {});
};

Trigger.prototype.ScaleProbeFinish = function()
{
	const time = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime();
	const walkerPos = Engine.QueryInterface(this.scaleWalker, IID_Position);
	const now = walkerPos ? walkerPos.GetPosition2D() : null;
	const start = this.scaleWalkerStart;
	let moved = 0;
	if (start && now)
		moved = Math.round(Math.hypot(now.x - start.x, now.y - start.y));
	print("SCALE_DONE simMs=" + (time - this.scaleStarted) + " walkerMovedM=" + moved + "\n");
};

{
	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	cmpTrigger.RegisterTrigger("OnInitGame", "ScaleProbeStart", { "enabled": true });
}
