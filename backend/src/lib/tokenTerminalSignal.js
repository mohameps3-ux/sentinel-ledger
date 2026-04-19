/**
 * Heuristic terminal action from grade, confidence, tape, and liquidity.
 * Not financial advice — UI copy should keep that framing.
 */
function gradeRank(grade) {
  const g = String(grade || "F").toUpperCase();
  if (g === "A+") return 6;
  if (g === "A") return 5;
  if (g === "B") return 4;
  if (g === "C") return 3;
  if (g === "D") return 2;
  return 1;
}

function computeTerminalSignal(analysis, market) {
  const conf = Number(analysis?.confidence || 0);
  const gr = gradeRank(analysis?.grade);
  const chg = Number(market?.priceChange24h || 0);
  const liq = Number(market?.liquidity || 0);
  const mintRisk = analysis?.cons?.some?.((c) => String(c).toLowerCase().includes("mint authority")) ?? false;
  const freezeRisk = analysis?.cons?.some?.((c) => String(c).toLowerCase().includes("freeze")) ?? false;

  let suggestedAction = "WATCH";
  let rationale =
    "Tape is mixed — wait for sustainment, refreshed liquidity, or a cleaner structure before sizing up.";

  if (mintRisk || freezeRisk) {
    suggestedAction = "TOO_LATE";
    rationale =
      "Privileged mint/freeze authorities are live — treat as hostile tokenomics regardless of short-term price.";
  } else if (conf < 38 || gr <= 2) {
    suggestedAction = "TOO_LATE";
    rationale = "Model scores this as late-stage or structurally weak — chasing here is mostly noise.";
  } else if (chg > 140 && liq < 120_000) {
    suggestedAction = "TOO_LATE";
    rationale = "Vertical move on thinner liquidity — mean reversion and exit liquidity risk dominate.";
  } else if (gr >= 4 && conf >= 72 && chg >= 0 && chg < 95 && liq >= 25_000) {
    suggestedAction = "ACCUMULATE";
    rationale = "Liquidity + grading still line up — model favors disciplined accumulation with risk caps.";
  } else if (gr >= 3 && conf >= 52) {
    suggestedAction = "WATCH";
    rationale = "Not a clean skew yet — keep it on the radar and re-evaluate on the next liquidity window.";
  } else {
    suggestedAction = "TOO_LATE";
    rationale = "Edge is too compressed versus reported risk factors — default to observation.";
  }

  const tapePenalty = chg > 110 ? 12 : chg > 80 ? 6 : 0;
  const liqBonus = liq >= 250_000 ? 8 : liq >= 80_000 ? 4 : 0;
  const signalStrength = Math.round(
    Math.min(100, Math.max(0, conf * 0.82 + (gr - 1) * 7 - tapePenalty + liqBonus))
  );

  return { signalStrength, suggestedAction, rationale };
}

module.exports = { computeTerminalSignal };
