const root = path.resolve("binaries/data/mods/nation");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const farmer = read("simulation/templates/units/nation/farmer.xml");

const buildings = [
	"training_college", "polytechnic", "university", "clinic", "hospital",
	"generator_station", "power_station", "national_power_plant",
	"military_camp", "special_operations_centre", "grand_mosque",
	"national_cathedral", "independence_monument"
];
for (const building of buildings)
{
	const xml = read("simulation/templates/structures/nation/" + building + ".xml");
	TS_ASSERT(xml.includes("<GenericName>"));
	TS_ASSERT(farmer.includes("structures/nation/" + building));
}

const serviceTemplates = {
	"training_college": ["education", "150", "1"],
	"polytechnic": ["education", "220", "2"],
	"university": ["education", "300", "3"],
	"clinic": ["healthcare", "140", "1"],
	"hospital": ["healthcare", "250", "2"],
	"generator_station": ["electricity", "120", "1"],
	"power_station": ["electricity", "260", "2"],
	"national_power_plant": ["electricity", "450", "3"]
};
for (const name of Object.keys(serviceTemplates))
{
	const [type, radius, level] = serviceTemplates[name];
	const xml = read("simulation/templates/structures/nation/" + name + ".xml");
	TS_ASSERT(xml.includes("<Type>" + type + "</Type>"));
	TS_ASSERT(xml.includes("<Radius>" + radius + "</Radius>"));
	TS_ASSERT(xml.includes("<Level>" + level + "</Level>"));
}

const doctor = read("simulation/templates/units/nation/doctor.xml");
TS_ASSERT(doctor.includes("<Heal>"));
TS_ASSERT(doctor.includes("<Range>18</Range>"));
TS_ASSERT(doctor.includes("phase_city"));
const regular = read("simulation/templates/units/nation/infantry.xml");
const elite = read("simulation/templates/units/nation/special_operations_soldier.xml");
TS_ASSERT(regular.includes("Regular Soldier"));
TS_ASSERT(elite.includes("Special Operations Soldier"));
TS_ASSERT(elite.includes("<Max>240</Max>"));
TS_ASSERT(read("simulation/templates/units/nation/officer.xml").includes("units/nation/officer"));

const scenario = read("maps/scenarios/nation_food_crisis.xml");
TS_ASSERT(!scenario.includes("units/athen/infantry_spearman_b"));
TS_ASSERT(!scenario.includes("units/spart/infantry_spearman_b"));
TS_ASSERT_EQUALS((scenario.match(/units\/nation\/infantry/g) || []).length, 8);
TS_ASSERT_EQUALS((scenario.match(/units\/nation\/adome_infantry/g) || []).length, 10);
