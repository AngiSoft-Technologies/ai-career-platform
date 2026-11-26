"use client";

import { FilterGroup, Select } from "@/components/ui";
import type { ProfessionFacet } from "@angisoft/mboqara-contracts";

/** A native select keeps the profession choice keyboard- and screen-reader-safe. */
export function ProfessionFilter({
  professions,
  value,
  onChange,
  loading = false,
}: {
  professions: ProfessionFacet[];
  value: string;
  onChange: (slug: string) => void;
  loading?: boolean;
}) {
  return (
    <FilterGroup label="Profession">
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Filter by profession"
      >
        <option value="">All professions</option>
        {professions.map((profession) => (
          <option key={profession.id} value={profession.slug}>
            {profession.name} ({profession.count.toLocaleString()})
          </option>
        ))}
      </Select>
      {loading ? (
        <span className="px-1 text-[0.72rem] text-app-muted">Loading professions…</span>
      ) : professions.length === 0 ? (
        <span className="px-1 text-[0.72rem] text-app-muted">
          No profession tags yet.
        </span>
      ) : null}
    </FilterGroup>
  );
}
