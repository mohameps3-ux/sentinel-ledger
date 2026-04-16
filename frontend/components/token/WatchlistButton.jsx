import { useState } from "react";
import { useWatchlist } from "../../hooks/useWatchlist";

export function WatchlistButton({ tokenAddress, isWatchlisted: initial }) {
  const { addToWatchlist, removeFromWatchlist, isLoading } = useWatchlist();
  const [isWatchlisted, setIsWatchlisted] = useState(initial);

  const handleToggle = async () => {
    if (!tokenAddress) return;
    if (isWatchlisted) {
      await removeFromWatchlist(tokenAddress);
      setIsWatchlisted(false);
    } else {
      await addToWatchlist(tokenAddress);
      setIsWatchlisted(true);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`px-4 py-2 rounded-xl transition ${
        isWatchlisted
          ? "bg-purple-600 text-white hover:bg-purple-700"
          : "bg-gray-800 text-gray-300 hover:bg-gray-700"
      }`}
    >
      {isWatchlisted ? "⭐ In Watchlist" : "☆ Add to Watchlist"}
    </button>
  );
}

