import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  className?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  description,
  className,
}: StatCardProps) {
  return (
    <Card className={`overflow-hidden border-none shadow-md hover:shadow-xl transition-all duration-300 group bg-white/50 backdrop-blur-sm border border-white/20 ${className}`}>
      <CardContent className="p-5 sm:p-6 relative">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-slate-600 tracking-tight uppercase">{title}</p>
          <div className="p-2 rounded-xl bg-slate-50 group-hover:bg-primary/10 transition-colors duration-300">
            <Icon className="h-5 w-5 text-slate-400 group-hover:text-primary transition-colors duration-300" />
          </div>
        </div>

        <div className="space-y-1">
          <h3 className="text-3xl font-bold tracking-tight text-slate-900">{value}</h3>
          {description && (
            <p className="text-sm text-slate-500 font-medium">
              {description}
            </p>
          )}
        </div>

        {/* Subtle decorative element */}
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all duration-500" />
      </CardContent>
    </Card>
  );
}
