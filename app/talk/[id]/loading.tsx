export default function TalkLoading() {
  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="text-5xl animate-pulse">💬</div>
        <p className="text-white/60 text-sm">Connecting...</p>
      </div>
    </div>
  );
}
