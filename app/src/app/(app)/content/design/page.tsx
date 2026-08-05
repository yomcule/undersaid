import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { DesignStudio } from "@/components/design-studio";

export default function DesignPage() {
  return (
    <>
      <Link href="/content" className="label hover:text-ink">
        ← Content
      </Link>

      <div className="mt-8">
        <PageHeader
          eyebrow="Studio"
          title="Design"
          lede="Pick a layout, drop in photos and text, download at Instagram's full 1080×1080 resolution."
        />
      </div>

      <DesignStudio />
    </>
  );
}
