import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { PageHead } from "../components/seo/PageHead";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useLocale } from "../contexts/LocaleContext";

function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function listStalkedWallets() {
  const res = await fetch(`${getPublicApiUrl()}/api/v1/wallet-stalker`, { headers: authHeaders() });
  if (!res.ok) throw new Error("wallet_stalker_list_failed");
  return res.json();
}

async function addWallet(wallet) {
  const res = await fetch(`${getPublicApiUrl()}/api/v1/wallet-stalker`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ wallet })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || body.error || "wallet_stalker_add_failed");
  return body;
}

async function removeWallet(wallet) {
  const res = await fetch(`${getPublicApiUrl()}/api/v1/wallet-stalker/${wallet}`, {
    method: "DELETE",
    headers: authHeaders()
  });
  if (!res.ok) throw new Error("wallet_stalker_remove_failed");
  return res.json();
}

export default function WalletStalkerPage() {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [wallet, setWallet] = useState("");
  const query = useQuery({
    queryKey: ["wallet-stalker"],
    queryFn: listStalkedWallets
  });

  const addMut = useMutation({
    mutationFn: addWallet,
    onSuccess: async () => {
      setWallet("");
      await qc.invalidateQueries({ queryKey: ["wallet-stalker"] });
      toast.success(t("stalker.toast.added"));
    },
    onError: (e) => toast.error(e.message || t("stalker.toast.addErr"))
  });
  const delMut = useMutation({
    mutationFn: removeWallet,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["wallet-stalker"] });
      toast.success(t("stalker.toast.removed"));
    }
  });

  const list = query.data?.data || [];

  return (
    <>
      <PageHead title={t("stalker.pageTitle")} description={t("stalker.pageDesc")} />
      <div className="sl-container py-8 space-y-4">
        <section className="glass-card sl-inset">
          <p className="sl-label">{t("stalker.label")}</p>
          <h1 className="text-2xl text-white font-semibold mt-1">{t("stalker.h1")}</h1>
          <p className="text-sm text-gray-400 mt-1">{t("stalker.sub")}</p>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = wallet.trim();
              if (!v) return;
              addMut.mutate(v);
            }}
          >
            <input
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder={t("stalker.placeholder")}
              className="sl-input h-11"
            />
            <button type="submit" className="btn-primary px-4" disabled={addMut.isPending}>
              {t("stalker.track")}
            </button>
          </form>
        </section>

        <section className="glass-card sl-inset">
          <p className="sl-label">{t("stalker.listLabel")}</p>
          <div className="mt-2 space-y-2">
            {list.map((row) => (
              <div
                key={row.stalked_wallet}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <span className="mono text-xs text-gray-200">
                  {row.stalked_wallet?.slice(0, 6)}...{row.stalked_wallet?.slice(-6)}
                </span>
                <button
                  type="button"
                  onClick={() => delMut.mutate(row.stalked_wallet)}
                  className="text-xs text-red-300 hover:text-red-200"
                >
                  {t("stalker.remove")}
                </button>
              </div>
            ))}
            {!list.length && !query.isLoading ? <p className="text-sm text-gray-500">{t("stalker.empty")}</p> : null}
          </div>
        </section>
      </div>
    </>
  );
}
