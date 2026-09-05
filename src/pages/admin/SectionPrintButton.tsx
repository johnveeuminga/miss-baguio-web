import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Per-section print button for the stacked scoresheets in
 * PreliminaryResultsTable / CombinedResultsTable. Each results view already
 * renders every category (Q&A, Creative Costume, Evening Wear, Swimwear)
 * plus a tally as separate <section data-print-section="..."> blocks inside
 * one .printable container, so the page's main "Print" button prints the
 * whole stack in one go. This button prints just its own section instead:
 * on click, it walks up to the nearest .printable ancestor, stamps
 * data-print-hide="1" on every OTHER [data-print-section] sibling (a CSS
 * rule in ResultsCombined hides anything carrying that attribute while
 * printing), fires window.print(), then removes the attribute again so the
 * on-screen view and the page's own "print everything" button are both
 * left exactly as they were.
 */
export default function SectionPrintButton({
  sectionKey,
  label,
}: {
  sectionKey: string;
  label?: string;
}) {
  function handlePrint(e: React.MouseEvent<HTMLButtonElement>) {
    const section = e.currentTarget.closest(
      `[data-print-section="${sectionKey}"]`
    );
    const printable = section?.closest(".printable");
    const others = printable
      ? Array.from(
          printable.querySelectorAll(
            `[data-print-section]:not([data-print-section="${sectionKey}"])`
          )
        )
      : [];

    others.forEach((el) => el.setAttribute("data-print-hide", "1"));
    window.print();
    // print() blocks until the browser's dialog closes in every browser
    // this app supports, so it's safe to clean up right after — no need to
    // wait on the unreliable afterprint event.
    others.forEach((el) => el.removeAttribute("data-print-hide"));
  }

  return (
    <Button
      onClick={handlePrint}
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground print:hidden"
      title={label ? `Print ${label} only` : "Print this section only"}
    >
      <Printer className="size-3.5" />
    </Button>
  );
}
