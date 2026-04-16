const { getSupabase } = require("../lib/supabase");

async function getDeployerInfo(deployerAddress) {
  if (!deployerAddress) return null;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("deployer_history")
      .select("*")
      .eq("wallet_address", deployerAddress)
      .single();

    if (error || !data) return null;

    return {
      address: data.wallet_address,
      totalLaunches: data.total_launches || 0,
      rugCount: data.rug_count || 0,
      riskScore: data.risk_score || 0
    };
  } catch (error) {
    console.error("Error fetching deployer info:", error.message);
    return null;
  }
}

module.exports = { getDeployerInfo };

