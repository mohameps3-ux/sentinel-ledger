import { S } from "./stringRow";

/** Ops console: English default, Spanish when UI locale is `es` (same pattern as other pages). */
/** @type {Record<string, Record<string, string>>} */
export const OPS_PAGE_STRINGS = {
  "ops.pageTitle": S("Ops Console — Sentinel Ledger", { es: "Consola Ops — Sentinel Ledger" }),
  "ops.pageDesc": S("Internal operations and observability.", {
    es: "Operaciones internas y observabilidad."
  }),
  "ops.header.kicker": S("Internal", { es: "Interno" }),
  "ops.header.h1": S("Omni Ops Console", { es: "Consola Omni Ops" }),
  "ops.header.sub": S(
    "Authenticate once for Ops APIs. Signed export integrity checks use a separate public endpoint (no ops key, rate-limited) so third parties can validate evidence you share.",
    {
      es: "Autentícate una vez para las APIs Ops. Las comprobaciones de integridad de export firmado usan un endpoint público aparte (sin clave ops, con límite de tasa) para que terceros validen evidencias que compartas."
    }
  ),

  "ops.key.label": S("Ops key", { es: "Clave Ops" }),
  "ops.key.storedHint": S("(stored only in this browser)", { es: "(solo en este navegador)" }),
  "ops.btn.saveLocal": S("Save locally", { es: "Guardar local" }),
  "ops.btn.refresh": S("Refresh data", { es: "Actualizar datos" }),
  "ops.btn.loading": S("Loading…", { es: "Cargando…" }),
  "ops.tablist.aria": S("Ops sections", { es: "Secciones Ops" }),

  "ops.tab.overview": S("Overview", { es: "Resumen" }),
  "ops.tab.ingestion": S("Ingestion", { es: "Ingesta" }),
  "ops.tab.signals": S("Signals", { es: "Señales" }),
  "ops.tab.operations": S("Operations", { es: "Operaciones" }),

  "ops.guard.high": S("High pressure", { es: "Alta presión" }),
  "ops.guard.watch": S("Watch", { es: "Vigilar" }),
  "ops.guard.healthy": S("Healthy", { es: "Saludable" }),

  "ops.toast.keySaved": S("Ops key saved locally.", { es: "Clave Ops guardada localmente." }),
  "ops.toast.needKey": S("Set your ops key first.", { es: "Primero configura tu clave ops." }),
  "ops.toast.refreshed": S("Ops data refreshed.", { es: "Datos Ops actualizados." }),
  "ops.toast.loadFailed": S("Load failed: {{message}}", { es: "Error al cargar: {{message}}" }),
  "ops.toast.ticketOk": S("Ticket updated.", { es: "Ticket actualizado." }),
  "ops.toast.updateFailed": S("Update failed: {{message}}", { es: "Error al actualizar: {{message}}" }),
  "ops.toast.broadcastOk": S("Broadcast sent.", { es: "Broadcast enviado." }),
  "ops.toast.broadcastFail": S("Broadcast failed: {{message}}", { es: "Fallo en broadcast: {{message}}" }),
  "ops.toast.csvOk": S("CSV {{hours}}h downloaded.", { es: "CSV {{hours}}h descargado." }),
  "ops.toast.csvFail": S("CSV export failed: {{message}}", { es: "Fallo export CSV: {{message}}" }),
  "ops.toast.signedOk": S("Signed JSON {{hours}}h downloaded.", { es: "JSON firmado {{hours}}h descargado." }),
  "ops.toast.signedFail": S("Signed export failed: {{message}}", { es: "Fallo export firmado: {{message}}" }),
  "ops.toast.pasteJson": S("Paste a signed export JSON first.", { es: "Pega primero un JSON de export firmado." }),
  "ops.toast.payloadLarge": S("Payload too large for this browser check.", {
    es: "Payload demasiado grande para esta comprobación en el navegador."
  }),
  "ops.toast.verifyPass": S("PASS — integrity verified", { es: "PASS — integridad verificada" }),
  "ops.toast.verifyFail": S("FAIL — see details", { es: "FAIL — ver detalles" }),
  "ops.toast.invalidJson": S("Invalid JSON.", { es: "JSON no válido." }),
  "ops.toast.verifyErr": S("Verify failed: {{message}}", { es: "Verificación fallida: {{message}}" }),
  "ops.toast.behaviorOk": S("Wallet behavior recompute triggered.", {
    es: "Recomputo de comportamiento de wallet lanzado."
  }),
  "ops.toast.behaviorFail": S("Wallet behavior run failed: {{message}}", {
    es: "Fallo en comportamiento de wallet: {{message}}"
  }),
  "ops.toast.coordOk": S("Wallet coordination recompute triggered.", {
    es: "Recomputo de coordinación de wallets lanzado."
  }),
  "ops.toast.coordFail": S("Wallet coordination run failed: {{message}}", {
    es: "Fallo en coordinación: {{message}}"
  }),
  "ops.toast.tunerOk": S("Signal gate tuner executed.", { es: "Tuner de signal gate ejecutado." }),
  "ops.toast.tunerFail": S("Signal gate tuner failed: {{message}}", { es: "Fallo del tuner: {{message}}" }),

  "ops.hint.refreshToLoad": S("Refresh to load", { es: "Actualiza para cargar" }),
  "ops.hint.entropyLimits": S("Entropy + rate limits", { es: "Entropía + límites de ratio" }),
  "ops.hint.cumulativeStart": S("Cumulative since process start", { es: "Acumulado desde el inicio del proceso" }),
  "ops.hint.observedOutcomes": S("Observed outcomes", { es: "Resultados observados" }),
  "ops.hint.lastPrefix": S("last", { es: "últ." }),
  "ops.hint.noRowsYet": S("No rows yet", { es: "Aún sin filas" }),
  "ops.hint.targetPrefix": S("Target", { es: "Objetivo" }),
  "ops.kpi.resolved": S("{{n}} resolved", { es: "{{n}} resueltos" }),
  "ops.kpi.walletBehaviorLast": S("last {{when}}", { es: "últ. {{when}}" }),
  "ops.kpi.styleLeaderHint": S("{{addr}}", { es: "{{addr}}" }),

  "ops.kpi.ingestionGuard": S("Ingestion guard", { es: "Guardia de ingesta" }),
  "ops.kpi.guardDrops": S("Guard drops (total)", { es: "Drops de guardia (total)" }),
  "ops.kpi.winRate48": S("Signal win rate (48h)", { es: "Win rate de señales (48h)" }),
  "ops.kpi.profitFactor": S("Profit factor", { es: "Factor de beneficio" }),
  "ops.kpi.walletBehaviorUpdated": S("Wallet behavior updated", { es: "Comportamiento de wallet actualizado" }),
  "ops.kpi.walletStyleLeader": S("Wallet style leader", { es: "Líder de estilo de wallet" }),
  "ops.kpi.supabase24": S("Supabase source (24h)", { es: "Fuente Supabase (24h)" }),
  "ops.kpi.sloStatus": S("SLO status", { es: "Estado SLO" }),
  "ops.kpi.historyPoints7d": S("History points (7d)", { es: "Puntos de historial (7d)" }),
  "ops.kpi.tickMs": S("Tick {{n}} ms", { es: "Tick {{n}} ms" }),

  "ops.glance.title": S("At a glance", { es: "De un vistazo" }),
  "ops.glance.entropyTitle": S("Entropy guard", { es: "Guardia de entropía" }),
  "ops.glance.trackedMints": S("Tracked mints:", { es: "Mints rastreados:" }),
  "ops.glance.memory": S("Memory:", { es: "Memoria:" }),
  "ops.glance.flags": S("Flags: sustained {{sustained}} · memory {{mem}} · pressure {{pressure}}", {
    es: "Banderas: sostenido {{sustained}} · memoria {{mem}} · presión {{pressure}}"
  }),
  "ops.glance.signalsTitle": S("Signals", { es: "Señales" }),
  "ops.glance.pendingRows": S("Pending rows:", { es: "Filas pendientes:" }),
  "ops.glance.avgOutcome": S("Avg outcome:", { es: "Resultado medio:" }),
  "ops.glance.calibrator": S("Calibrator:", { es: "Calibrador:" }),
  "ops.glance.calibratorNone": S("No run yet", { es: "Sin ejecución aún" }),
  "ops.glance.footer": S(
    "Use Ingestion and Signals tabs for full tables. Support queues live under Operations.",
    {
      es: "Usa las pestañas Ingesta y Señales para tablas completas. Las colas de soporte están en Operaciones."
    }
  ),

  "ops.ingestion.title": S("Entropy guard", { es: "Guardia de entropía" }),
  "ops.ingestion.badgeAlert": S("Alert: high ingestion pressure", { es: "Alerta: alta presión de ingesta" }),
  "ops.ingestion.badgeOk": S("Within expected range", { es: "Dentro del rango esperado" }),
  "ops.ingestion.empty": S("No guard snapshot yet — authenticate and refresh.", {
    es: "Aún no hay snapshot de guardia — autentica y actualiza."
  }),
  "ops.ingestion.kpi.trackedMints": S("Tracked mints", { es: "Mints rastreados" }),
  "ops.ingestion.kpi.totalDrops": S("Total drops", { es: "Drops totales" }),
  "ops.ingestion.kpi.estimatedMemory": S("Estimated memory", { es: "Memoria estimada" }),
  "ops.ingestion.kpi.window": S("Window", { es: "Ventana" }),
  "ops.ingestion.topOffender": S("Top offender", { es: "Principal infractor" }),
  "ops.ingestion.dropsSuffix": S("drops", { es: "drops" }),
  "ops.ingestion.noneRecorded": S("None recorded.", { es: "Ninguno registrado." }),
  "ops.ingestion.dropReasons": S("Drop reasons", { es: "Motivos de drop" }),
  "ops.ingestion.noDrops": S("No drops.", { es: "Sin drops." }),

  "ops.slo.pass": S("PASS", { es: "PASS" }),
  "ops.slo.fail": S("FAIL", { es: "FAIL" }),

  "ops.signals.title48": S("Signal performance (48h)", { es: "Rendimiento de señales (48h)" }),
  "ops.signals.noBundle": S("No performance bundle loaded.", { es: "No hay bundle de rendimiento cargado." })
};
