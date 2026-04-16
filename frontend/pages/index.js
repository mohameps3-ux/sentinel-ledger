import { useState } from "react";
import { useRouter } from "next/router";

export default function Home() {
  const [address, setAddress] = useState("");
  const router = useRouter();

  const handleSearch = (e) => {
    e.preventDefault();
    if (address.trim().length >= 32) router.push(`/token/${address.trim()}`);
    else alert("Introduce una dirección de token válida");
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center px-4">
      <div className="text-center mb-10">
        <h1 className="text-5xl font-black bg-gradient-to-r from-purple-500 to-blue-500 bg-clip-text text-transparent mb-4">
          SENTINEL LEDGER
        </h1>
        <p className="text-gray-400 text-lg">
          Inteligencia On-Chain en tiempo real
        </p>
      </div>
      <form onSubmit={handleSearch} className="w-full max-w-2xl relative">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Pega el Mint Address del token (Solana)..."
          className="w-full bg-gray-900 border-2 border-gray-800 rounded-3xl py-5 px-8 text-xl focus:outline-none focus:border-purple-600 transition-all text-white"
        />
        <button className="absolute right-3 top-3 bottom-3 px-8 bg-purple-600 hover:bg-purple-700 rounded-2xl font-bold transition-all">
          SCOUT
        </button>
      </form>
    </div>
  );
}

