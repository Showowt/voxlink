export default function Loading() {
  return (
    <div className="min-h-screen bg-[#060810] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-[#00C896] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white text-lg">Loading...</p>
      </div>
    </div>
  );
}
