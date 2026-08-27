import { ArrowLeft, FileText, Plane, RadioTower } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { LanguageSwitcher } from "@/components/LanguageSwitcher/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher/ThemeSwitcher";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FlightBinBuilder } from "../../builders/FlightBinBuilder/FlightBinBuilder";
import { FileDropzone } from "../../components/FileDropzone/FileDropzone";
import { SkylogFileBuilder } from "../../builders/SkylogFileBuilder/SkylogFileBuilder";
import { useFileLoader } from "../../hooks/useFileLoader/useFileLoader";
import { getCoreWorker } from "../../services/coreWorkerClient/coreWorkerClient";
import { useFileStore } from "../../stores/fileStore/fileStore";
import { isParsedError, type ParseResult } from "../../types";

interface Validated {
  name: string;
  buf: ArrayBuffer;
  result: ParseResult;
}

export const HOME_DROPZONE_TEST_ID = "home";

// The card's shared look/interaction (hover/focus treatment) whether it's a same-page mode
// switch (Analyze Logs) or a real navigation (Vehicle Setup, Ground Station) - see HomeCard.
const CARD_CLASSNAME =
  "flex h-full flex-col items-center gap-3 border-border bg-card text-center transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface HomeCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  testId?: string;
}

/** One of the 3 landing choices - either a real route (`to`) or a same-page mode switch
 *  (`onClick`, used only by Analyze Logs, which reveals the dropzone below instead of
 *  navigating anywhere). Both render the identical Card so all 3 look and behave the same. */
function HomeCard(props: HomeCardProps & ({ to: string; onClick?: never } | { to?: never; onClick: () => void })) {
  const { icon, title, description, testId } = props;
  const content = (
    <Card className={CARD_CLASSNAME}>
      <div className="text-primary">{icon}</div>
      <CardHeader className="items-center gap-1.5 p-0">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );

  if (props.to) {
    return (
      <Link to={props.to} data-testid={testId} className="w-full max-w-72 flex-1">
        {content}
      </Link>
    );
  }

  return (
    <button type="button" data-testid={testId} onClick={props.onClick} className="w-full max-w-72 flex-1 text-left">
      {content}
    </button>
  );
}

/**
 * The landing screen: 3 equal entry points into the app (analyze logs, set up a live vehicle,
 * plan ground-station coverage), replacing the old drop-a-file-first screen. Only "Analyze
 * Logs" is a same-page mode switch (below) rather than a real route, since the whole point of
 * the shared upload (see useDerivedFromFile) is that Logs/Graphs/Map all derive their own view
 * from one file loaded here - a real route for it would need to carry that file across a
 * navigation for no benefit.
 */
export function HomeView() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"chooser" | "logs">("chooser");
  const [error, setError] = useState<string | null>(null);
  const setFile = useFileStore((s) => s.setFile);

  const { isParsing, stage, load, loadBuffer } = useFileLoader<Validated>(async (name, buf) => {
    try {
      const result = await getCoreWorker().parseFile(name, buf);
      return { name, buf, result };
    } catch (err) {
      return {
        name,
        buf,
        result: { error: t("logs.messages.parseError", { message: err instanceof Error ? err.message : String(err) }) },
      };
    }
  });

  function applyValidated({ name, buf, result }: Validated) {
    if (isParsedError(result)) {
      setError(result.error);
      return;
    }
    setError(null);
    setFile({ name, buf });
  }

  function handleFile(file: File) {
    void load(file).then(applyValidated);
  }

  function loadSampleBin() {
    // One flight combining every tab's demo-worthy behavior: a real voltage sag (Logs'
    // advisor), a few brief GPS teleports (Logs' "teleport removed" advisory), a GPS
    // spoofing window (Map's lost/reacquired markers), and real terrain relief at the base
    // coordinates (Map's 3D view).
    const buf = new FlightBinBuilder()
      .withDurationSeconds(300)
      .withBase(37.745, -119.593)
      .withVoltageCurve(25.2, 22.4, 23.0)
      .withGpsTeleports(4)
      .withGpsSpoofing(120, 150)
      .build();
    void loadBuffer("sample-flight.bin", buf).then(applyValidated);
  }

  function loadSampleSkylog() {
    const buf = new SkylogFileBuilder()
      .addBoard({ board: 3570, takeoffVoltage: 25.1, landingVoltage: 23.6 })
      .addBoard({ board: 3526, takeoffVoltage: 24.9, landingVoltage: 23.2 })
      .build();
    void loadBuffer("sample-log.skylog", buf).then(applyValidated);
  }

  return (
    <div className="relative flex h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="absolute right-4 top-4 flex gap-2">
        <ThemeSwitcher />
        <LanguageSwitcher />
      </div>

      {mode === "chooser" ? (
        <>
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-bold tracking-tight">{t("home.title")}</h1>
            <p className="max-w-md text-muted-foreground">{t("home.description")}</p>
          </div>

          <div className="flex w-full max-w-3xl flex-col items-stretch justify-center gap-4 sm:flex-row sm:items-start">
            <HomeCard
              testId={`${HOME_DROPZONE_TEST_ID}-card`}
              icon={<FileText className="h-8 w-8" />}
              title={t("home.cards.logs.title")}
              description={t("home.cards.logs.description")}
              onClick={() => setMode("logs")}
            />
            <HomeCard
              icon={<Plane className="h-8 w-8" />}
              title={t("home.cards.vehicleSetup.title")}
              description={t("home.cards.vehicleSetup.description")}
              to="/ardupilot-setup"
            />
            <HomeCard
              icon={<RadioTower className="h-8 w-8" />}
              title={t("home.cards.groundStation.title")}
              description={t("home.cards.groundStation.description")}
              to="/ground-station"
            />
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setMode("chooser")}
            className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("home.backToChooser")}
          </button>

          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-bold tracking-tight">{t("home.cards.logs.title")}</h1>
            <p className="max-w-md text-muted-foreground">{t("home.cards.logs.description")}</p>
          </div>

          <div className="w-full max-w-md">
            <FileDropzone
              testId={HOME_DROPZONE_TEST_ID}
              accept=".skylog,.log,.txt,.bin,.BIN,.tlog,.TLOG"
              isParsing={isParsing}
              stage={stage}
              onFile={handleFile}
              title={t("home.drop.title")}
              subtitle={t("home.drop.subtitle")}
              readingText={t("home.drop.reading")}
              parsingText={t("home.drop.parsing")}
            />
          </div>

          {error && (
            <Alert variant="destructive" className="max-w-md text-left">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={loadSampleBin} disabled={isParsing}>
              {t("logs.sample.bin")}
            </Button>
            <Button variant="outline" onClick={loadSampleSkylog} disabled={isParsing}>
              {t("logs.sample.skylog")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
