Engine.RegisterInterface("BorderWarningManager");

/**
 * Message of the form { "issuer": number, "recipient": number }
 * sent when a defender first warns an offender about a border incident.
 * issuer is the defender. recipient is the offender.
 * This does not change ally, neutral, or enemy stance.
 */
Engine.RegisterMessageType("BorderWarningIssued");
