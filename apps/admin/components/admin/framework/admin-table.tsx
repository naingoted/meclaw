"use client";
import { Skeleton, Table, TBody, TD, TH, THead, TR } from "@meclaw/ui";
import type * as React from "react";

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

export interface AdminTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  /** When true, add a "Corpus v" column showing `row.corpusVersion`. */
  showCorpusVersion?: boolean;
}

function CorpusVersionCell({ version }: { version: number | null | undefined }) {
  return (
    <span className="font-mono text-xs text-muted-foreground">
      {version != null ? `v${version}` : "—"}
    </span>
  );
}

export function AdminTable<T>({
  columns,
  data,
  loading = false,
  emptyMessage = "No data",
  showCorpusVersion = false,
}: AdminTableProps<T>) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  // When showCorpusVersion is true, rows must have a `corpusVersion` property.
  // We cast to avoid constraining T — the caller opts in via the prop.
  type WithCorpus = { id: string } & Record<string, unknown>;
  const allColumns = showCorpusVersion
    ? [
        ...columns,
        {
          header: "Corpus",
          cell: (row: T) => {
            const v = (row as WithCorpus).corpusVersion as number | null | undefined;
            return <CorpusVersionCell version={v} />;
          },
          className: "w-20",
        } satisfies Column<T>,
      ]
    : columns;

  return (
    <Table>
      <THead>
        <TR>
          {allColumns.map((col) => (
            <TH key={col.header} scope="col" className={col.className}>
              {col.header}
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {data.map((row) => (
          <TR key={(row as WithCorpus).id}>
            {allColumns.map((col) => (
              <TD key={col.header} className={col.className}>
                {col.cell(row)}
              </TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
