function DebtLedger() {}

DebtLedger.prototype.Schema =
	"<a:component type='system'/><empty/>";

var NationParticipantKey = typeof NationParticipantKey === "function" ? NationParticipantKey : function(participant)
{
	if (typeof participant === "number" && Number.isInteger(participant) && participant > 0)
		return "player:" + participant;
	if (participant && participant.type === "foreign_actor" &&
		typeof participant.id === "string" && /^[a-z][a-z0-9_]*$/.test(participant.id))
		return "foreign_actor:" + participant.id;
	return "";
};

var NationSameParticipant = typeof NationSameParticipant === "function" ? NationSameParticipant : function(left, right)
{
	const key = NationParticipantKey(left);
	return key !== "" && key === NationParticipantKey(right);
};

/**
 * Prototype financial time. One payment interval is 60 simulation seconds.
 * That is not a year. A later calendar can map this interval onto a fiscal period.
 * Interest is simple: each interval charges
 * floor(principalOutstanding * interestRateBps / 10000).
 * The division remainder is discarded. It is not added to principal.
 * 400 basis points is 4 percent of outstanding principal per interval.
 * The principal remainder of original / installments is charged on the final installment.
 */
DebtLedger.prototype.PaymentInterval = 60000;

DebtLedger.prototype.Init = function()
{
	this.nextId = 1;
	this.debts = [];
};

/**
 * @return {Object|null}
 */
DebtLedger.prototype.Find = function(id)
{
	if (!Number.isInteger(id) || id <= 0)
		return null;
	for (let i = 0; i < this.debts.length; ++i)
		if (this.debts[i].id === id)
			return this.debts[i];
	return null;
};

/**
 * @return {Object[]}
 */
DebtLedger.prototype.GetDebts = function()
{
	return clone(this.debts);
};

/**
 * Outstanding principal plus interest already due, for debts owed by this participant.
 * @return {number}
 */
DebtLedger.prototype.Burden = function(debtor)
{
	let total = 0;
	for (let i = 0; i < this.debts.length; ++i)
	{
		const debt = this.debts[i];
		if (debt.status !== "active" || !NationSameParticipant(debt.debtor, debtor))
			continue;
		total += debt.principalOutstanding + debt.interestDue;
	}
	return total;
};

/**
 * @return {Object}
 */
DebtLedger.prototype.Capture = function()
{
	return {
		"nextId": this.nextId,
		"debts": clone(this.debts)
	};
};

DebtLedger.prototype.Restore = function(snapshot)
{
	this.nextId = snapshot.nextId;
	this.debts = clone(snapshot.debts);
};

/**
 * One future callback. A debt that already has a timer is not scheduled again.
 */
DebtLedger.prototype.Schedule = function(debt)
{
	if (!debt || debt.status !== "active" || debt.timer)
		return;

	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (!cmpTimer)
		return;

	debt.sequence = (debt.sequence || 0) + 1;
	debt.timer = cmpTimer.SetTimeout(
		SYSTEM_ENTITY,
		IID_DebtLedger,
		"ServiceDebt",
		debt.paymentInterval,
		{
			"id": debt.id,
			"sequence": debt.sequence
		}
	);
};

DebtLedger.prototype.Cancel = function(debt)
{
	if (!debt || !debt.timer)
		return;
	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	if (cmpTimer)
		cmpTimer.CancelTimer(debt.timer);
	debt.timer = 0;
};

/**
 * @return {number} - Debt id, or 0 when the terms are unusable.
 */
DebtLedger.prototype.Create = function(creditor, debtor, terms)
{
	if (!NationParticipantKey(creditor) || !NationParticipantKey(debtor) || NationSameParticipant(creditor, debtor))
		return 0;
	if (!terms || !Number.isInteger(terms.principal) || terms.principal <= 0)
		return 0;
	if (!Number.isInteger(terms.interestRateBps) || terms.interestRateBps < 0)
		return 0;
	if (!Number.isInteger(terms.installments) || terms.installments <= 0 || terms.principal < terms.installments)
		return 0;
	if (!Number.isInteger(terms.graceIntervals) || terms.graceIntervals < 0)
		return 0;

	const debt = {
		"id": this.nextId++,
		"creditor": clone(creditor),
		"debtor": clone(debtor),
		"principalOriginal": terms.principal,
		"principalOutstanding": terms.principal,
		"principalDue": 0,
		"interestRateBps": terms.interestRateBps,
		"interestDue": 0,
		"interestPaid": 0,
		"installments": terms.installments,
		"installmentsCharged": 0,
		"graceIntervals": terms.graceIntervals,
		"graceRemaining": terms.graceIntervals,
		"paymentInterval": this.PaymentInterval,
		"paymentsMade": 0,
		"missedPayments": 0,
		"status": "active",
		"sequence": 0,
		"timer": 0
	};
	// A numeric creditor must stay a number. clone of a number is a number.
	if (typeof creditor === "number")
		debt.creditor = creditor;
	if (typeof debtor === "number")
		debt.debtor = debtor;
	this.debts.push(debt);
	this.Schedule(debt);
	return debt.id;
};

/**
 * Interest for one interval. Floor division. The remainder is not capitalized.
 * @return {number}
 */
DebtLedger.prototype.IntervalInterest = function(debt)
{
	return Math.floor(debt.principalOutstanding * debt.interestRateBps / 10000);
};

/**
 * Move the next principal slice into principalDue.
 * The last remaining installment takes whatever principal is not yet due.
 */
DebtLedger.prototype.ChargePrincipalSlice = function(debt)
{
	if (debt.installmentsCharged >= debt.installments)
		return;
	const remaining = debt.installments - debt.installmentsCharged;
	const uncharged = debt.principalOutstanding - debt.principalDue;
	const slice = remaining <= 1 ? uncharged : Math.floor(uncharged / remaining);
	debt.principalDue += slice;
	debt.installmentsCharged += 1;
};

/**
 * Grace accrues interest and moves no money.
 * A payment interval adds one principal slice and one interest charge.
 * The debtor pays the full amount due or pays nothing.
 */
DebtLedger.prototype.ApplyInterval = function(debt)
{
	if (!debt || debt.status !== "active")
		return;

	if (debt.graceRemaining > 0)
	{
		debt.graceRemaining -= 1;
		debt.interestDue += this.IntervalInterest(debt);
		return;
	}

	this.ChargePrincipalSlice(debt);
	debt.interestDue += this.IntervalInterest(debt);
	const due = debt.principalDue + debt.interestDue;
	if (due <= 0)
	{
		debt.status = "repaid";
		this.Cancel(debt);
		return;
	}

	if (!this.Pay(debt, due))
	{
		debt.missedPayments += 1;
		return;
	}

	debt.interestPaid += debt.interestDue;
	debt.principalOutstanding -= debt.principalDue;
	debt.principalDue = 0;
	debt.interestDue = 0;
	debt.paymentsMade += 1;
	if (debt.principalOutstanding === 0 && debt.interestDue === 0)
	{
		debt.status = "repaid";
		this.Cancel(debt);
	}
};

/**
 * Full payment or nothing. Treasury does not go negative.
 * @return {boolean}
 */
DebtLedger.prototype.Pay = function(debt, amount)
{
	if (!this.CanSpend(debt.debtor, amount))
		return false;
	if (!this.Spend(debt.debtor, amount))
		return false;
	if (!this.Credit(debt.creditor, amount))
	{
		this.Credit(debt.debtor, amount);
		return false;
	}
	return true;
};

DebtLedger.prototype.CanSpend = function(participant, amount)
{
	if (typeof participant === "number")
	{
		const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
		return !!(cmpFinance && cmpFinance.CanAfford(participant, amount));
	}
	const cmpActors = Engine.QueryInterface(SYSTEM_ENTITY, IID_ForeignActorManager);
	return !!(cmpActors && participant && cmpActors.CanAfford(participant.id, amount));
};

DebtLedger.prototype.Spend = function(participant, amount)
{
	if (typeof participant === "number")
	{
		const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
		return !!(cmpFinance && cmpFinance.Spend(participant, amount));
	}
	const cmpActors = Engine.QueryInterface(SYSTEM_ENTITY, IID_ForeignActorManager);
	return !!(cmpActors && participant && cmpActors.Spend(participant.id, amount));
};

DebtLedger.prototype.Credit = function(participant, amount)
{
	if (typeof participant === "number")
	{
		const cmpFinance = Engine.QueryInterface(SYSTEM_ENTITY, IID_GovernmentFinance);
		return !!(cmpFinance && cmpFinance.AddFunds(participant, amount));
	}
	const cmpActors = Engine.QueryInterface(SYSTEM_ENTITY, IID_ForeignActorManager);
	return !!(cmpActors && participant && cmpActors.AddFunds(participant.id, amount));
};

/**
 * Timer callback. A stale sequence, from a rolled-back or already-handled timer, does nothing.
 */
DebtLedger.prototype.ServiceDebt = function(data)
{
	const debt = data && this.Find(data.id);
	if (!debt || debt.status !== "active" || data.sequence !== debt.sequence)
		return;

	debt.timer = 0;
	this.ApplyInterval(debt);
	if (debt.status === "active")
		this.Schedule(debt);
};

/**
 * Reduce principal. No treasury moves. Completing the obligation marks the debt repaid.
 * @return {boolean}
 */
DebtLedger.prototype.Forgive = function(creditor, debtor, debtId, amount)
{
	const debt = this.Find(debtId);
	if (!debt || debt.status !== "active")
		return false;
	if (!NationSameParticipant(debt.creditor, creditor) || !NationSameParticipant(debt.debtor, debtor))
		return false;
	if (!Number.isInteger(amount) || amount <= 0 || amount > debt.principalOutstanding)
		return false;

	debt.principalOutstanding -= amount;
	if (debt.principalDue > debt.principalOutstanding)
		debt.principalDue = debt.principalOutstanding;
	if (debt.principalOutstanding === 0 && debt.interestDue === 0 && debt.principalDue === 0)
	{
		debt.status = "repaid";
		this.Cancel(debt);
	}
	return true;
};

DebtLedger.prototype.OnInitGame = function()
{
	for (let i = 0; i < this.debts.length; ++i)
		this.Schedule(this.debts[i]);
};

Engine.RegisterSystemComponentType(IID_DebtLedger, "DebtLedger", DebtLedger);

function AttachDebtsToSimulationState()
{
	if (typeof GuiInterface === "undefined" || !GuiInterface.prototype.GetSimulationState)
		return;
	if (GuiInterface.prototype.GetSimulationState.nationDebtWrapped)
		return;

	const original = GuiInterface.prototype.GetSimulationState;
	const wrapped = function()
	{
		const state = original.apply(this, arguments);
		if (!state)
			return state;
		const cmpDebts = Engine.QueryInterface(SYSTEM_ENTITY, IID_DebtLedger);
		if (cmpDebts)
			state.nationDebts = cmpDebts.GetDebts();
		return state;
	};
	wrapped.nationDebtWrapped = true;
	GuiInterface.prototype.GetSimulationState = wrapped;
}

AttachDebtsToSimulationState();
