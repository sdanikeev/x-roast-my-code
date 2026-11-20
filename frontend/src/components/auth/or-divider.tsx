import { Tr } from "@/components/i18n/i18n-provider";

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-caption text-dim" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <Tr id="common.or" />
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
