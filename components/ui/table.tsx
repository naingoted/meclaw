import * as React from "react";
import { cn } from "@/lib/utils";
export const Table = (p: React.HTMLAttributes<HTMLTableElement>) => <table className={cn("w-full text-sm", p.className)} {...p} />;
export const THead = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className="border-b text-left text-muted-foreground" {...p} />;
export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody {...p} />;
export const TR = (p: React.HTMLAttributes<HTMLTableRowElement>) => <tr className="border-b hover:bg-muted/40" {...p} />;
export const TH = (p: React.ThHTMLAttributes<HTMLTableCellElement>) => <th className="px-3 py-2 font-medium" {...p} />;
export const TD = (p: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className="px-3 py-2" {...p} />;
