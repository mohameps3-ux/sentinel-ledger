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
      onClick={handleToggle}
      disabled={isLoading}
      className={`px-4 py-2 rounded-xl transition inline-flex items-center gap-2 ${
        isWatchlisted
          ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:opacity-90"
          : "bg-[#13171A] border soft-divider text-gray-300 hover:bg-[#1a1f25]"
      }`}
    >
      <Star size={15} />
      {isWatchlisted ? "In Watchlist" : "Add to Watchlist"}
    </button>
  );
}

