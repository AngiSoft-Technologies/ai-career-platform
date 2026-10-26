import ClientPage from "./client-page";
import { metadata } from "./page-metadata";

export { metadata };
export const dynamic = "force-dynamic";

export default function Page() {
  return <ClientPage />;
}
