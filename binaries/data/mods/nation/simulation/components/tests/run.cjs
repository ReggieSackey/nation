#!/usr/bin/env node
/**
 * Nation component tests.
 *
 * The stock binary runner (source/simulation2/components/tests/test_scripts.h)
 * mounts only mod and public, calls LoadComponentTypes, then public setup.js.
 * LoadComponentTypes freezes IID_* globals, so Nation tests that call
 * Engine.RegisterInterface throw. Public SerializationCycle iterates a
 * component with for-of, and Nation components have no Serialize method.
 * test_AvemeSettlement.js also reads scenario XML with the Node fs API.
 *
 * Those tests were written for a Node vm that loads public setup.js and
 * evaluates the component scripts. This runner is that host.
 *
 *   node binaries/data/mods/nation/simulation/components/tests/run.cjs
 *   node binaries/data/mods/nation/simulation/components/tests/run.cjs test_Sovereignty.js test_AvemeSettlement.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const testsDir = __dirname;
const nationRoot = path.resolve(testsDir, "../../..");
const publicRoot = path.resolve(testsDir, "../../../../public");
const nationComponents = path.join(nationRoot, "simulation/components");
const publicComponents = path.join(publicRoot, "simulation/components");
const setupPath = path.join(publicComponents, "tests/setup.js");

function readScript(name, roots)
{
	const file = roots.map(root => path.join(root, name)).find(candidate => fs.existsSync(candidate));
	if (!file)
		fail("missing script: " + name);
	return file;
}

function fail(message)
{
	const error = new Error(message);
	error.assertion = true;
	const origin = (error.stack || "").split("\n").find(line =>
		line.includes("/mods/nation/") && !line.includes("run.cjs"));
	if (origin)
		error.message += "\n" + origin.trim();
	throw error;
}

function same(left, right)
{
	if (Object.is(left, right))
		return true;
	if (typeof left !== "object" || typeof right !== "object" || left === null || right === null)
		return false;
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length)
		return false;
	return leftKeys.every(key => same(left[key], right[key]));
}

function uneval(value)
{
	if (typeof value === "string")
		return JSON.stringify(value);
	if (value === null || typeof value !== "object")
		return String(value);
	return JSON.stringify(value);
}

function runTest(fileName)
{
	const testPath = path.join(testsDir, fileName);
	const sandbox = {
		console,
		Engine: {},
		INVALID_PLAYER: -1,
		INVALID_ENTITY: 0,
		SYSTEM_ENTITY: 0,
		clone: value => JSON.parse(JSON.stringify(value)),
		deepfreeze: value => value,
		uneval,
		error: message =>
		{
			sandbox.console.log("error:", message);
		},
		warn: message =>
		{
			sandbox.console.log("warn:", message);
		},
		markForTranslation: text => text,
		markForTranslationWithContext: (context, text) => text,
		isFinite,
		Number,
		Array,
		Object,
		JSON,
		Map,
		Set,
		Math,
		Error,
		RegExp,
		parseInt,
		parseFloat,
		String
	};
	sandbox.global = sandbox;
	// LoadComponentTypes defines these before any test script runs.
	// Nation tests use them without calling RegisterInterface.
	// Ids only need to be unique inside one test.
	const nativeInterfaces = [
		"TemplateManager", "UnknownScript", "AIInterface", "AIManager", "Attack",
		"CinemaManager", "CommandQueue", "Decay", "Fogging", "Footprint",
		"GarrisonHolder", "GuiInterface", "Identity", "Minimap", "Mirage", "Motion",
		"Obstruction", "ObstructionManager", "OverlayRenderer", "Ownership",
		"ParticleManager", "Pathfinder", "Player", "PlayerManager", "Position",
		"ProjectileManager", "RallyPoint", "RallyPointRenderer", "RangeManager",
		"RangeOverlayRenderer", "Selectable", "Settlement", "Sound", "SoundManager",
		"ValueModificationManager", "Terrain", "TerritoryDecayManager",
		"TerritoryInfluence", "TerritoryManager", "TurretHolder", "UnitMotion",
		"UnitMotionManager", "UnitRenderer", "Visibility", "Vision", "Visual",
		"WaterManager", "SovereigntyManager"
	];
	nativeInterfaces.forEach((name, index) =>
	{
		sandbox["IID_" + name] = index + 1;
	});
	sandbox.fs = {
		readFileSync: (filePath, encoding) => fs.readFileSync(filePath, encoding)
	};
	sandbox.TS_ASSERT = value =>
	{
		if (!value)
			fail("TS_ASSERT failed");
	};
	sandbox.TS_ASSERT_EQUALS = (left, right) =>
	{
		if (!same(left, right))
			fail("TS_ASSERT_EQUALS failed: " + uneval(left) + " !== " + uneval(right));
	};
	sandbox.TS_ASSERT_UNEVAL_EQUALS = (left, right) =>
	{
		if (uneval(left) !== uneval(right))
			fail("TS_ASSERT_UNEVAL_EQUALS failed: " + uneval(left) + " !== " + uneval(right));
	};

	// Tests mention script interface ids without loading the interface file.
	// Give each name one id the first time it is read.
	let scriptInterfaceId = 2000;
	const context = new Proxy(sandbox, {
		has(target, key)
		{
			if (typeof key === "string" && (key.startsWith("IID_") || key.startsWith("MT_")) && !(key in target))
				target[key] = scriptInterfaceId++;
			return key in target;
		},
		get(target, key, receiver)
		{
			if (typeof key === "string" && (key.startsWith("IID_") || key.startsWith("MT_")) && !(key in target))
				target[key] = scriptInterfaceId++;
			return Reflect.get(target, key, receiver);
		}
	});
	vm.createContext(context);
	// The context has no eval. NationScenario loads a GUI script with one.
	context.eval = code => vm.runInContext(String(code), context);
	sandbox.Engine.LoadComponentScript = name =>
	{
		const file = readScript(name, [nationComponents, publicComponents]);
		vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
	};
	sandbox.Engine.LoadHelperScript = name =>
	{
		const file = readScript(name, [
			path.join(nationRoot, "simulation/helpers"),
			path.join(publicRoot, "simulation/helpers")
		]);
		vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
	};
	sandbox.path = path;

	vm.runInContext(fs.readFileSync(setupPath, "utf8"), context, { filename: setupPath });
	// Re-registering an interface the engine already defined must not throw
	// and must not change the id tests and components already share.
	vm.runInContext(`
		Engine.RegisterInterface = function(name)
		{
			const key = "IID_" + name;
			if (Object.hasOwn(global, key))
				return;
			global[key] = g_NewIID++;
		};
		Engine.RegisterMessageType = function(name)
		{
			const key = "MT_" + name;
			if (Object.hasOwn(global, key))
				return;
			global[key] = g_NewMTID++;
		};
	`, context);
	// Public setup.js calls Init before the component can be queried.
	// The engine stores the component, then calls Init. InfrastructureLink
	// notifies the connectivity graph from Init and must be visible.
	vm.runInContext(`
		global.ConstructComponent = function(ent, name, template)
		{
			const cmp = new g_ComponentTypes[name].ctor();
			Object.defineProperties(cmp, {
				"entity": {
					"value": ent,
					"configurable": false,
					"enumerable": false,
					"writable": false
				},
				"template": {
					"value": template && deepfreeze(clone(template)),
					"configurable": false,
					"enumerable": false,
					"writable": false
				},
				"_cmpName": {
					"value": name,
					"configurable": false,
					"enumerable": false,
					"writable": false
				}
			});
			if (!g_Components[ent])
				g_Components[ent] = {};
			g_Components[ent][g_ComponentTypes[name].iid] = cmp;
			cmp.Init?.();
			return cmp;
		};
	`, context);
	// Public setup.js copies state with for-of. Constructed Nation components
	// are plain objects and have no Serialize method, so that throws.
	vm.runInContext(`
		global.SerializationCycle = function(cmp)
		{
			const data = {};
			for (const att in cmp)
				if (Object.hasOwn(cmp, att))
					data[att] = cmp[att];
			const newCmp = ConstructComponent(cmp.entity, cmp._cmpName, cmp.template);
			if (typeof newCmp.Deserialize === "function")
				newCmp.Deserialize(data);
			else
				for (const att in data)
					newCmp[att] = data[att];
			return newCmp;
		};
	`, context);

	vm.runInContext(fs.readFileSync(testPath, "utf8"), context, { filename: testPath });
}

const requested = process.argv.slice(2);
const files = requested.length
	? requested.map(name => name.endsWith(".js") ? name : name + ".js")
	: fs.readdirSync(testsDir).filter(name => name.startsWith("test_") && name.endsWith(".js")).sort();

let failed = 0;
for (const file of files)
{
	try
	{
		runTest(file);
		process.stdout.write("ok " + file + "\n");
	}
	catch (error)
	{
		failed++;
		const where = error.stack ? error.stack.split("\n").slice(0, 4).join("\n") : "";
		process.stdout.write("FAIL " + file + "\n" + error.message + "\n" + where + "\n");
	}
}

process.stdout.write(files.length - failed + " passed, " + failed + " failed, " + files.length + " total\n");
process.exit(failed === 0 ? 0 : 1);
