Engine.RegisterInterface("BorderCrisisManager");

/**
 * Message of the form { "offender": number, "defender": number }
 * sent when an ultimatum expires while the offender's forces are still
 * inside the defender's sovereign territory.
 * offender is the state that ignored the demand. defender is the state that made it.
 * This does not change ally, neutral, or enemy stance and is not war.
 */
Engine.RegisterMessageType("BorderCrisisEscalated");
