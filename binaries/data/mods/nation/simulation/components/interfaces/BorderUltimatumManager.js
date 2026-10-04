Engine.RegisterInterface("BorderUltimatumManager");

/**
 * Message of the form { "issuer": number, "recipient": number }
 * sent when a defender first escalates an unmet warning.
 * issuer is the defender. recipient is the offender.
 * This does not change ally, neutral, or enemy stance and is not war.
 */
Engine.RegisterMessageType("BorderUltimatumIssued");
