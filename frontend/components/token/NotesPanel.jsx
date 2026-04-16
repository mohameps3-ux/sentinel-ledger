import { useState } from "react";
import { useWatchlist } from "../../hooks/useWatchlist";

export function NotesPanel({ tokenAddress, initialNote }) {
  const { updateNote, isLoading } = useWatchlist();
  const [note, setNote] = useState(initialNote || "");
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    await updateNote({ tokenAddress, note });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-bold mb-3">Private Notes</h3>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Your thoughts on this token..."
        className="w-full bg-[#0E1318] border soft-divider rounded-xl p-3 text-sm"
        rows="3"
      />
      <button
        onClick={handleSave}
        disabled={isLoading}
        className="mt-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 rounded-xl text-sm transition"
      >
        {saved ? "✓ Saved" : "Save Note"}
      </button>
    </div>
  );
}

