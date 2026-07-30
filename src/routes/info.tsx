import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/info")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Spelinfo — BOW in Tanzania" },
      {
        name: "description",
        content: "Spelregels, puntensysteem en uitleg over zones van de BOW-expeditie in Tanzania.",
      },
      { property: "og:title", content: "Spelinfo — BOW in Tanzania" },
      {
        property: "og:description",
        content: "Spelregels, puntensysteem en uitleg over zones van de expeditie.",
      },
    ],
  }),
  component: InfoPage,
});

/**
 * De teksten hieronder zijn algemeen opgesteld.
 * Pas ze aan in dit bestand (src/routes/info.tsx) — zie ook README → "Spelinfo aanpassen".
 */
const SECTIONS = [
  {
    id: "spel",
    icon: "🎲",
    title: "Het spel",
    body: [
      "Jullie reizen als team door verschillende zones van Tanzania.",
      "Elke zone bevat opdrachten: vragen, schattingen, meerkeuze en foto-opdrachten.",
      "Hoe beter jullie antwoorden, hoe meer punten jullie verdienen.",
    ],
  },
  {
    id: "regels",
    icon: "📜",
    title: "Spelregels",
    body: [
      "Speel met één toestel per team en blijf samen.",
      "Elke opdracht kan één keer ingezonden worden — overleg dus goed.",
      "Foto's maken jullie ter plaatse, niet van het internet.",
      "Fair play: de reisleider kan punten toekennen of aftrekken.",
    ],
  },
  {
    id: "punten",
    icon: "⭐",
    title: "Puntensysteem",
    body: [
      "Elke opdracht toont het aantal punten dat ze oplevert.",
      "Vragen met een vast juist antwoord worden meteen automatisch beoordeeld.",
      "Open vragen en foto's worden door de reisleider nagekeken.",
      "Kleurcode: ⏳ wacht op nakijken · ✅ goedgekeurd (punten toegekend) · ❌ afgekeurd (geen punten).",
      "Bonusopdrachten leveren extra punten op, maar zijn maar even beschikbaar.",
    ],
  },
  {
    id: "zones",
    icon: "🔓",
    title: "Zones ontgrendelen",
    body: [
      "De eerste zone staat altijd open.",
      "Een zone zonder wachtwoord opent automatisch zodra de vorige zone volledig af is.",
      "Een zone met wachtwoord blijft dicht tot de reisleider de code doorstuurt.",
      "De code komt binnen via Meldingen, zodra al jullie antwoorden nagekeken zijn.",
    ],
  },
  {
    id: "bonus",
    icon: "⚡",
    title: "Bonusopdrachten",
    body: [
      "De reisleider kan tijdens het spel een bonusopdracht starten.",
      "Jullie krijgen meteen een melding met de opdracht en de tijd die jullie hebben.",
      "De bonusopdracht staat bovenaan het startscherm met een aftelklok.",
      "Zodra de tijd om is, verdwijnt de opdracht automatisch.",
    ],
  },
  {
    id: "hulp",
    icon: "🆘",
    title: "Hulp nodig?",
    body: [
      "Geen internet? Antwoorden worden lokaal bewaard en automatisch verstuurd zodra je weer verbinding hebt.",
      "Zie je iets niet verschijnen? Sluit de app niet af, maar ververs de pagina.",
      "Bij twijfel: spreek de reisleider aan.",
    ],
  },
];

function InfoPage() {
  return (
    <AppShell title="Spelinfo" subtitle="Alles wat jullie moeten weten">
      <div className="mt-4 rounded-3xl border border-border bg-card p-4 shadow-card">
        <Accordion type="multiple" defaultValue={["spel"]}>
          {SECTIONS.map((section) => (
            <AccordionItem key={section.id} value={section.id}>
              <AccordionTrigger className="text-left text-lg">
                <span className="flex items-center gap-2">
                  <span aria-hidden>{section.icon}</span>
                  {section.title}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {section.body.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span aria-hidden className="text-primary">
                        •
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Veel succes en geniet van de expeditie! 🦁
      </p>
    </AppShell>
  );
}
