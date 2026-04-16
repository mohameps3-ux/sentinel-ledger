import { useState } from "react";
import { useWatchlist } from "../../hooks/useWatchlist";
import toast from "react-hot-toast";
import { Star } from "lucide-react";

export function WatchlistButton({ tokenAddress, isWatchlisted: initial }) {
  const { addToWatchlist, removeFromWatchlist, isLoading } = useWatchlist();
  const [isWatchlisted, setIsWatchlisted] = useState(initial);

  const handleToggle = async () => {
    if (!tokenAddress) return;
    if (isWatchlisted) {
      await removeFromWatchlist(tokenAddress);
      setIsWatchlisted(false);
      toast.success("Removed from watchlist.");
    } else {
      await addToWatchlist(tokenAddress);
      setIsWatchlisted(true);
      toast.success("Added to watchlist.");
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isLoading}
      className={
        isWatchlisted
          ? "btn-pro inline-flex items-center gap-2 disabled:opacity-50"
          : "btn-ghost inline-flex items-center gap-2 disabled:opacity-50"
      }
    >
      <Star size={16} />
      {isWatchlisted ? "In watchlist" : "Add to watchlist"}
    </button>
  );
}

