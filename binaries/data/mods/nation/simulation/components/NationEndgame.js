function NationEndgame() {}
NationEndgame.prototype.Schema = "<a:component type='system'/><empty/>";
NationEndgame.prototype.Init = function()
{
	this.player = 0;
	this.palace = 0;
	this.finished = false;
	this.timer = 0;
};
NationEndgame.prototype.Serialize = function()
{
	return { "player": this.player, "palace": this.palace, "finished": this.finished };
};
NationEndgame.prototype.Deserialize = function(data)
{
	this.Init();
	this.player = data.player;
	this.palace = data.palace;
	this.finished = data.finished;
};
NationEndgame.prototype.OnInitGame = function()
{
	const settings = typeof InitAttributes !== "undefined" && InitAttributes.settings;
	const config = settings && settings.NationEndgame;
	if (!config || !Number.isInteger(config.player) || !Number.isInteger(config.palaceEntity))
		return;
	this.player = config.player;
	this.palace = config.palaceEntity;
	this.Start();
};
NationEndgame.prototype.OnDeserialized = function()
{
	this.Start();
};
NationEndgame.prototype.Start = function()
{
	if (!this.player || this.finished || this.timer)
		return;
	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (cmpTimer)
		this.timer = cmpTimer.SetInterval(SYSTEM_ENTITY, IID_NationEndgame,
			"ObserveHumans", 1000, 1000, null);
};
NationEndgame.prototype.Report = function(outcome, reason)
{
	const cmpScenario = typeof IID_NationScenarioController !== "undefined" &&
		Engine.QueryInterface(SYSTEM_ENTITY, IID_NationScenarioController);
	if (cmpScenario && cmpScenario.active && cmpScenario.Finish)
	{
		const world = cmpScenario.ReadWorld();
		if (world)
			cmpScenario.Finish(outcome, reason, world);
	}
};
NationEndgame.prototype.Lose = function(reason)
{
	if (!this.player || this.finished)
		return;
	this.finished = true;
	this.Report("loss", reason);
	const cmpPlayer = QueryPlayerIDInterface(this.player);
	if (cmpPlayer && cmpPlayer.IsActive())
		cmpPlayer.Defeat(reason);
};
NationEndgame.prototype.Win = function()
{
	if (!this.player || this.finished)
		return;
	const cmpPlayer = QueryPlayerIDInterface(this.player);
	if (!cmpPlayer || !cmpPlayer.IsActive())
		return;
	this.finished = true;
	this.Report("victory", "The National Project is complete.");
	const cmpEnd = Engine.QueryInterface(SYSTEM_ENTITY, IID_EndGameManager);
	if (cmpEnd)
		cmpEnd.MarkPlayersAsWon([this.player],
			() => "Densira has completed the National Project.",
			() => "Densira has completed the National Project.");
	else
		cmpPlayer.Win("The National Project is complete.");
};
NationEndgame.prototype.OnGlobalConstructionFinished = function(msg)
{
	if (!this.player || this.finished || !msg || !msg.newentity)
		return;
	const cmpIdentity = Engine.QueryInterface(msg.newentity, IID_Identity);
	const cmpOwner = Engine.QueryInterface(msg.newentity, IID_Ownership);
	if (cmpIdentity && cmpIdentity.HasClass("NationNationalProject") &&
		cmpOwner && cmpOwner.GetOwner() === this.player &&
		!Engine.QueryInterface(msg.newentity, IID_Foundation))
		this.Win();
};
NationEndgame.prototype.OnGlobalOwnershipChanged = function(msg)
{
	if (this.player && !this.finished && msg.entity === this.palace &&
		msg.from === this.player && msg.to === 2)
		this.Lose("Adomé has taken the Government House.");
};
NationEndgame.prototype.OnGlobalDestroy = function(msg)
{
	if (this.player && !this.finished && msg.entity === this.palace)
		this.Lose("The Government House has been destroyed.");
};
NationEndgame.prototype.ObserveHumans = function()
{
	if (!this.player || this.finished)
		return;
	const entities = Engine.GetEntitiesWithInterface(IID_Identity);
	for (let i = 0; i < entities.length; ++i)
	{
		const cmpIdentity = Engine.QueryInterface(entities[i], IID_Identity);
		const cmpOwner = Engine.QueryInterface(entities[i], IID_Ownership);
		if (cmpIdentity && cmpIdentity.HasClass("Human") && cmpOwner &&
			cmpOwner.GetOwner() === this.player)
			return;
	}
	this.Lose("Densira has no people left in the field.");
};
Engine.RegisterSystemComponentType(IID_NationEndgame, "NationEndgame", NationEndgame);
