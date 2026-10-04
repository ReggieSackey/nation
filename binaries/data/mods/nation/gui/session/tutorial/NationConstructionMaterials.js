/**
 * The stock resource bar has one slot per upstream resource plus population.
 * A manufactured resource would overflow that bar, so it is omitted here
 * and shown as text by the Nation status line.
 */
if (typeof CounterManager !== "undefined")
{
	const nationAddResourceCounter = CounterManager.prototype.addCounter;
	CounterManager.prototype.addCounter = function(resCode, type)
	{
		if (resCode === "construction_materials")
			return;
		nationAddResourceCounter.call(this, resCode, type);
	};
}
