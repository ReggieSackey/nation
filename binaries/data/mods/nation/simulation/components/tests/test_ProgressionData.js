const techDir = "/Users/reg/Documents/GitHub/nation/binaries/data/mods/nation/simulation/data/technologies";
const templateDir = "/Users/reg/Documents/GitHub/nation/binaries/data/mods/nation/simulation/templates";

function technology(name)
{
	return JSON.parse(fs.readFileSync(path.join(techDir, name + ".json"), "utf8"));
}

for (const name of ["phase_town_athen", "phase_town_generic"])
{
	const phase = technology(name);
	TS_ASSERT_EQUALS(phase.genericName, "Development");
	TS_ASSERT_EQUALS(phase.cost.food, 300);
	TS_ASSERT_EQUALS(phase.cost.wood, 200);
	TS_ASSERT_EQUALS(phase.cost.stone, 150);
	TS_ASSERT_EQUALS(phase.cost.metal, 100);
	TS_ASSERT_EQUALS(phase.cost.construction_materials, undefined);
}

for (const name of ["phase_city_athen", "phase_city_generic"])
{
	const phase = technology(name);
	TS_ASSERT_EQUALS(phase.genericName, "Advanced State");
	TS_ASSERT_EQUALS(phase.cost.food, 800);
	TS_ASSERT_EQUALS(phase.cost.wood, 400);
	TS_ASSERT_EQUALS(phase.cost.stone, 350);
	TS_ASSERT_EQUALS(phase.cost.metal, 250);
	TS_ASSERT_EQUALS(phase.cost.construction_materials, undefined);
}

const project = fs.readFileSync(
	path.join(templateDir, "structures/nation/national_project.xml"), "utf8");
TS_ASSERT(project.includes("phase_city"));
TS_ASSERT(project.includes("<Territory>sovereign</Territory>"));
TS_ASSERT(project.includes("<food>1500</food>"));
TS_ASSERT(project.includes("<wood>1000</wood>"));
TS_ASSERT(project.includes("<stone>1200</stone>"));
TS_ASSERT(project.includes("<metal>800</metal>"));
TS_ASSERT(!project.includes("construction_materials"));
