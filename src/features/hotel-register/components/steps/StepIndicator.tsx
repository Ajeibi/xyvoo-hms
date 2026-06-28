export default function StepIndicator({ step, labels }: { step: number; labels: string[] }) {
  return (
    <div className="mb-8">
      <p className="text-center text-xs text-slate-400 mb-3 font-medium">Step {Math.min(step + 1, 4)} of 4</p>
      <div className="flex items-center gap-0">
        {labels.map((label, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  i < step ? "bg-green-500 text-white" : i === step ? "text-white" : "bg-slate-200 text-slate-400"
                }`}
                style={
                  i === step ? { background: "var(--xyvoo-blue)" } : {}
                }
              >
                {i < step ? "✓" : i + 1}
              </div>
              <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${i === step ? "text-blue-600" : "text-slate-400"}`}>{label}</span>
            </div>
            {i < labels.length - 1 && <div className={`flex-1 h-px mx-2 mb-4 ${i < step ? "bg-green-400" : "bg-slate-200"}`} />}
          </div>
        ))}
      </div>
    </div>
  );
}
