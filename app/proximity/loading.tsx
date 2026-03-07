// ═══════════════════════════════════════════════════════════════════════════════
// PROXIMITY LOADING STATE
// ═══════════════════════════════════════════════════════════════════════════════

export default function ProximityLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#060810] via-[#0d1117] to-[#060810] flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-[#00C896] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Loading Proximity Connect...</p>
      </div>
    </div>
  );
}
