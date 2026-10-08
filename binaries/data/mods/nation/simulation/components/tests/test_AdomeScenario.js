const scenarioDir = "/Users/reg/Documents/GitHub/nation/binaries/data/mods/nation/maps/scenarios";
const templateDir = "/Users/reg/Documents/GitHub/nation/binaries/data/mods/nation/simulation/templates";

const food = fs.readFileSync(path.join(scenarioDir, "nation_food_crisis.xml"), "utf8");
const sandbox = fs.readFileSync(path.join(scenarioDir, "nation_1961_sandbox.xml"), "utf8");
const aveme = fs.readFileSync(path.join(templateDir, "structures/nation/aveme.xml"), "utf8");
const civic = fs.readFileSync(path.join(templateDir, "structures/nation/neighbor_civil_centre.xml"), "utf8");
const barracks = fs.readFileSync(path.join(templateDir, "structures/nation/neighbor_barracks.xml"), "utf8");
const worker = fs.readFileSync(path.join(templateDir, "units/nation/adome_worker.xml"), "utf8");
const strategySetting = fs.readFileSync(
	"/Users/reg/Documents/GitHub/nation/binaries/data/mods/nation/gamesettings/attributes/AdomeStrategy.js", "utf8");
const endgameSetting = fs.readFileSync(
	"/Users/reg/Documents/GitHub/nation/binaries/data/mods/nation/gamesettings/attributes/NationEndgame.js", "utf8");

for (const scenario of [food, sandbox])
{
	TS_ASSERT(scenario.includes('"AI": "petra"'));
	TS_ASSERT(scenario.includes('"AIBehavior": "balanced"'));
	TS_ASSERT(scenario.includes('"PopulationLimit":'));
	TS_ASSERT(scenario.includes("units/nation/adome_worker"));
}

TS_ASSERT(food.includes('"AdomeStrategy"'));
TS_ASSERT(food.includes('"NationEndgame": { "player": 1, "palaceEntity": 10 }'));
TS_ASSERT(strategySetting.includes("this.settings.playerAI.set(player - 1"));
TS_ASSERT(strategySetting.includes('"bot": "petra"'));
TS_ASSERT(endgameSetting.includes('attribs.settings.NationEndgame = clone(this.endgame)'));
TS_ASSERT(food.includes('"startingTechnology": "phase_city_generic"'));
TS_ASSERT(food.includes('"PopulationLimit": 120'));
TS_ASSERT(food.includes('"food": 30000'));
TS_ASSERT(food.includes('"wood": 5000'));
TS_ASSERT(food.includes('<Template>structures/nation/neighbor_barracks</Template>'));
TS_ASSERT(food.includes('<Template>structures/nation/neighbor_market</Template>'));
TS_ASSERT(food.includes('<Template>structures/nation/farmstead</Template>'));
TS_ASSERT(food.includes('<Template>structures/nation/town_storehouse</Template>'));
TS_ASSERT_EQUALS((food.match(/<Template>units\/nation\/adome_worker<\/Template>/g) || []).length, 6);
TS_ASSERT_EQUALS((food.match(/<Template>units\/spart\/infantry_spearman_b<\/Template>/g) || []).length, 10);

TS_ASSERT(aveme.includes("<Population>12000</Population>"));
TS_ASSERT(aveme.includes("<IsCapital>true</IsCapital>"));
TS_ASSERT(civic.includes("units/nation/adome_worker"));
TS_ASSERT(!civic.includes("TerritoryInfluence disable"));
TS_ASSERT(barracks.includes('parent="structures/spart/barracks"'));
TS_ASSERT(worker.includes('parent="units/spart/support_female_citizen"'));
TS_ASSERT(worker.includes("<Builder>"));
TS_ASSERT(worker.includes("NationWorker"));
