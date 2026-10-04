Engine.RegisterInterface("SettlementDiscontent");

/**
 * Broadcast after SettlementDiscontent has applied one food interval.
 * Rebellion listens. Food consumption does not know about rebellion.
 */
Engine.RegisterMessageType("SettlementDiscontentCompleted");
