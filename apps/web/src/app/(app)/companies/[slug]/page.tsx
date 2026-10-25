"use client";

import { useParams } from "next/navigation";
import { CompanyDetail } from "../page";

export default function CompanyPage() {
  const params = useParams<{ slug: string }>();
  return <CompanyDetail slug={params.slug} />;
}
