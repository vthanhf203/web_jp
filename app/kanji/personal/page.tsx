import { redirect } from "next/navigation";

export default function PersonalKanjiPage() {
  redirect("/kanji?scope=personal");
}
