import { useNavigate } from 'react-router-dom';
import { Eye, X } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';

export function ImpersonationBanner() {
  const { isImpersonating, impersonatedOrg, stopImpersonation } = useOrg();
  const navigate = useNavigate();

  if (!isImpersonating || !impersonatedOrg) return null;

  return (
    <div className="sticky top-0 z-50 w-full bg-amber-500/15 border-b border-amber-500/30 backdrop-blur-sm">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 h-10 flex items-center gap-3 text-xs sm:text-sm">
        <Eye className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-amber-200 truncate">
          Viewing as <span className="font-semibold text-amber-100">{impersonatedOrg.name}</span>
          <span className="hidden sm:inline text-amber-300/70"> · admin impersonation</span>
        </span>
        <button
          onClick={() => {
            stopImpersonation();
            navigate('/admin/orgs');
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 h-7 text-amber-100 hover:bg-amber-500/20 transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Exit
        </button>
      </div>
    </div>
  );
}
