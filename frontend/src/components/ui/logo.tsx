import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="text-base font-bold text-accent">
      ~/roast.sh
    </Link>
  );
}
