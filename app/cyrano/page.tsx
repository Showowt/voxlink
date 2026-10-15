import { redirect } from "next/navigation";

// Legacy standalone coaching page — superseded by /wingman. Kept as a
// redirect so old links and muscle memory still land somewhere real.
export default function CyranoRedirect() {
  redirect("/wingman");
}
