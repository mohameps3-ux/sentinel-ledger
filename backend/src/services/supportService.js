const { getSupabase } = require("../lib/supabase");

function classifyIntent(message = "") {
  const text = message.toLowerCase();
  if (/error|bug|falla|failed|crash|no funciona|problema/.test(text)) return "issue";
  if (/precio|grade|scan|analiza|token|riesgo|holders|deployer/.test(text)) return "product_help";
  if (/factura|pago|plan|pro|suscrip|billing/.test(text)) return "billing";
  if (/hola|hello|start|ayuda|help/.test(text)) return "greeting";
  return "general";
}

function buildResponse(intent, { message, channel, userId }) {
  switch (intent) {
    case "greeting":
      return "Hola, soy Sentinel Omni Support. Puedo ayudarte con /scan, alertas, watchlist y problemas tecnicos.";
    case "product_help":
      return "Puedo ayudarte asi: 1) /scan <mint> para analisis, 2) /watchlist para seguimiento, 3) compare lab para ver edge entre 2 tokens.";
    case "billing":
      return "Para temas de plan/pro, indicanos wallet y canal. Voy a escalar esto como ticket para atencion prioritaria.";
    case "issue":
      return "Entendido. Voy a crear un ticket tecnico y dejar registro con contexto para resolverlo rapido.";
    default:
      return `Recibido en ${channel}. Si quieres, describe el problema con mas detalle y lo escalo a soporte.`;
  }
}

async function createSupportTicket({ channel, userId, message, intent, metadata }) {
  const supabase = getSupabase();
  const payload = {
    channel,
    user_external_id: userId || "anonymous",
    intent,
    status: "open",
    priority: intent === "issue" ? "high" : "normal",
    user_message: message,
    metadata: metadata || {}
  };
  const { data, error } = await supabase
    .from("support_tickets")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function logBotEvent({ channel, userId, message, intent, metadata }) {
  const supabase = getSupabase();
  const { error } = await supabase.from("bot_events").insert({
    channel,
    user_external_id: userId || "anonymous",
    message,
    intent,
    metadata: metadata || {}
  });
  if (error) throw error;
}

async function handleSupportInbound({ channel, userId, message, metadata = {} }) {
  const intent = classifyIntent(message);
  const response = buildResponse(intent, { message, channel, userId });

  let persistenceWarnings = [];
  try {
    await logBotEvent({ channel, userId, message, intent, metadata });
  } catch (error) {
    persistenceWarnings.push("event_log_failed");
  }

  let ticket = null;
  if (intent === "issue" || intent === "billing") {
    try {
      ticket = await createSupportTicket({ channel, userId, message, intent, metadata });
    } catch (error) {
      persistenceWarnings.push("ticket_create_failed");
    }
  }

  return {
    intent,
    response,
    ticket,
    persistenceWarnings
  };
}

module.exports = { handleSupportInbound };

