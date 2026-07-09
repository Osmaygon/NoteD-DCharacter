import { CharacterSheetPage } from "@/components/character-sheet-page";

const TALHUR_DEMO_CHARACTER_ID = "5d575978-cf29-4736-8ea9-04c0e79ebfe8";

export default function DemoPage() {
  return <CharacterSheetPage demoCharacterId={TALHUR_DEMO_CHARACTER_ID} />;
}
