import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { LanguageSwitcher } from "@/components/LanguageSwitcher/LanguageSwitcher";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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

/**
 * The landing screen: a single shared upload for the whole app. Drop/select/sample a file
 * here once, and Logs/Graphs/Map all derive their own view from it lazily (see
 * useDerivedFromFile) - no more re-uploading per tab. Only runs a quick validating
 * parseFile() pass here (enough to catch "not a real log" errors before letting the user
 * in); each tab's own, potentially heavier derivation happens the first time it's opened.
 */
export function HomeView() {
  const { t } = useTranslation();
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
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight">{t("home.title")}</h1>
        <p className="max-w-md text-muted-foreground">{t("home.description")}</p>
      </div>

      <div className="w-full max-w-md">
        {/* TODO: "home" is re-typed raw in HomeView.test.tsx and App.test.tsx (as
            "home-dropzone"/"home-file-input", built by FileDropzone's testId template) instead
            of importing a shared constant - export a HOME_DROPZONE_TEST_ID from this file. */}
        <FileDropzone
          testId="home"
          accept=".skylog,.log,.txt,.bin,.BIN"
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

      <Button variant="link" asChild>
        <Link to="/ardupilot-setup">{t("home.ardupilotSetupCta")}</Link>
      </Button>
    </div>
  );
}
