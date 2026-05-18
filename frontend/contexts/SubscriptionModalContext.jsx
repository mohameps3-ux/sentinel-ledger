import { createContext, useCallback, useContext, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";

const SubscriptionModal = dynamic(() => import("../components/subscription/SubscriptionModal"), {
  ssr: false
});

const SubscriptionModalContext = createContext(null);

export function SubscriptionModalProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const openSubscriptionModal = useCallback(() => setIsOpen(true), []);
  const closeSubscriptionModal = useCallback(() => setIsOpen(false), []);

  const handleSuccess = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["subscription-status"] });
  }, [queryClient]);

  const value = useMemo(
    () => ({
      openSubscriptionModal,
      closeSubscriptionModal,
      isSubscriptionModalOpen: isOpen
    }),
    [isOpen, openSubscriptionModal, closeSubscriptionModal]
  );

  return (
    <SubscriptionModalContext.Provider value={value}>
      {children}
      <SubscriptionModal isOpen={isOpen} onClose={closeSubscriptionModal} onSuccess={handleSuccess} />
    </SubscriptionModalContext.Provider>
  );
}

export function useSubscriptionModal() {
  const ctx = useContext(SubscriptionModalContext);
  if (!ctx) {
    throw new Error("useSubscriptionModal must be used within SubscriptionModalProvider");
  }
  return ctx;
}
