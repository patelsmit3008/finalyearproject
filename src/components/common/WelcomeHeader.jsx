import { Sparkles } from 'lucide-react';

/**
 * Reusable dark-blue hero banner used across Employee, HR Admin, and PM portals.
 * Matches Employee Portal welcome section: dark navy background, white text, rounded, shadow.
 */
export default function WelcomeHeader({ title, subtitle }) {
  return (
    <div className="bg-[#1e3a5f] rounded-2xl p-8 sm:p-10 text-white shadow-xl w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div className="space-y-2">
          <p className="text-2xl sm:text-3xl font-bold">
            {title}
          </p>
          {subtitle && (
            <p className="text-base sm:text-lg text-gray-200 font-light">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="p-4 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
            <Sparkles className="w-7 h-7" />
          </div>
        </div>
      </div>
    </div>
  );
}
