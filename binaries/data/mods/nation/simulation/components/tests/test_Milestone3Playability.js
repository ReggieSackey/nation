const templateDir = "/Users/reg/Documents/GitHub/nation/binaries/data/mods/nation/simulation/templates";
const technologyDir = "/Users/reg/Documents/GitHub/nation/binaries/data/mods/nation/simulation/data/technologies";

function template(name)
{
	return fs.readFileSync(path.join(templateDir, name), "utf8");
}

function technology(name)
{
	return JSON.parse(fs.readFileSync(path.join(technologyDir, name + ".json"), "utf8"));
}

const farmer = template("units/nation/farmer.xml");
const development = technology("phase_town_athen");
const advanced = technology("phase_city_athen");
const required = {
	"NationLoggingCamp": "logging_camp",
	"NationQuarry": "quarry",
	"NationMine": "mine",
	"NationMarket": "town_market",
	"NationBarracks": "town_barracks",
	"NationCourt": "court"
};

for (const phase of [development, advanced])
	for (const requirement of phase.requirements.all)
	{
		const className = requirement.entity.class;
		const name = required[className];
		TS_ASSERT(name);
		const building = template("structures/nation/" + name + ".xml");
		TS_ASSERT(building.includes(className));
		TS_ASSERT(farmer.includes("structures/nation/" + name));
	}

const court = template("structures/nation/court.xml");
TS_ASSERT(court.includes("parent=\"structures/athen/temple\""));
TS_ASSERT(court.includes("<Territory>sovereign</Territory>"));
TS_ASSERT(court.includes("TerritoryDecay disable"));
TS_ASSERT(court.includes("TerritoryInfluence disable"));
// The temple parent requires phase_town, so the Court is available in Development.
TS_ASSERT(!court.includes("phase_city"));

const baselinePopulation = 18000 + 5000 + 3500 + 7000;
TS_ASSERT_EQUALS(baselinePopulation, 33500);
TS_ASSERT(baselinePopulation >= 20000);
TS_ASSERT(baselinePopulation >= 30000);
TS_ASSERT(baselinePopulation >= 33000);
TS_ASSERT_EQUALS(development.cost.food, 300);
TS_ASSERT_EQUALS(advanced.cost.food, 800);
const project = template("structures/nation/national_project.xml");
TS_ASSERT(project.includes("<food>1500</food>"));
TS_ASSERT(project.includes("<wood>1000</wood>"));
TS_ASSERT(project.includes("<stone>1200</stone>"));
TS_ASSERT(project.includes("<metal>800</metal>"));
