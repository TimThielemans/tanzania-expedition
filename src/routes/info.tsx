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
      "Jullie reizen als team in de voetsporen van de reisleider in 4 verschillende etappes door Tanzania.",
      "Elke zone bevat opdrachten: vragen, schattingen, meerkeuze en foto-opdrachten.",
      "Hoe beter jullie antwoorden, hoe meer punten jullie verdienen.",
      "Met meer punten wordt je vakantie alleen maar leuker en maak je meer kans op de hoofdprijs.",
    ],
  },
  {
    id: "regels",
    icon: "📜",
    title: "Spelregels",
    body: [
      "Je kan met meerdere toestellen inloggen en opdrachten beantwoorden maar slechts één toestel per team deelt de locatie.",
      "Elke opdracht kan slechts één keer ingezonden worden, overleg dus goed. Communicatie is belangrijk he 😉",
      "Foto's maken jullie zelf ter plaatse, niet plukken van het internet of uit je goed gevulde fotoalbum.",
      "Fair play: de reisleider kan altijd beslissen extra punten toe te kennen of af te trekken.",
    ],
  },
  {
    id: "punten",
    icon: "⭐",
    title: "Puntensysteem",
    body: [
      "Elke opdracht toont het aantal punten dat een juist antwoord oplevert.",
      "Vragen met een vast juist antwoord worden meteen automatisch beoordeeld.",
      "Open vragen en foto's worden door de reisleider nagekeken dus daar moet je soms even op wachten.",
      "Voor opdrachten met een ⭐ kan de reisleider extra creativiteitspunten toekennen."
      "Kleurcode: ⏳ wacht op nakijken · ✅ goedgekeurd (punten toegekend) · ❌ afgekeurd (geen punten).",
      "Bonusopdrachten leveren extra punten op, maar zijn maar even beschikbaar'
    ],
  },
  {
    id: "Etappes",
    icon: "🔓",
    title: "Etappes ontgrendelen",
    body: [
      "De eerste etappe (MTB Adventure) is altijd beschikbaar.",
      "De daaropvolgende etappes kan je enkel openen met een code.",
      "Deze code komt binnen via Meldingen, zodra je de laatste opdracht van de vorige etappe hebt ingediend.",
    ],
  },
  {
    id: "locatie",
    icon: "📍",
    title: "Locatie events",
    body: [
      "Sommige opdrachten worden enkel zichtbaar wanneer je op bepaalde punten op de route bent gepasseerd.",
      "Je krijgt steeds een melding als er een nieuwe opdracht werd vrijgespeeld.",
      "Deze locatiegebonden opdrachten verschijnen onderaan in je huidige zone.",
      "Geef toestemming aan de app/browser om je locatie te delen en hou de app regelmatig open.",
      "Na het indienen van opdrachten krijg je regelmatig een melding waar soms informatie over de te volgen route instaat, lees dus je meldingen en volg de route :)",
      "Uiteraard ben je vrij hier en daar af te wijken om een opdracht uit te voeren maar zorg dat je steeds terug op de 'hoofdroute' terecht komt.",
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
      "Zie je iets niet verschijnen? Ververs de pagina eens.",
      "Het is niet de bedoeling dat jullie lang moeten zoeken of echt ver moeten wandelen. Alles zou zichzelf moeten uitwijzen maar het is ook maar de eerste keer dat iemand dit speelt...",
      "Bij twijfel: stuur een whatsappke naar de reisleider.",
    ],
  },
];

function InfoPage() {
  return (
    <AppShell title="Spelinfo" subtitle="Alles wat jullie moeten weten">
      <div data-tour="rules" className="mt-4 rounded-3xl border border-border bg-card p-4 shadow-card">
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
