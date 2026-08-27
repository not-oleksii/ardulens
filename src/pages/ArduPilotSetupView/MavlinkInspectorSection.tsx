import { useMemo, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MAVLINK_REGISTRY } from "../../mavlink/registry/registry";
import { useMavlinkInspectorStore } from "../../stores/mavlinkInspectorStore/mavlinkInspectorStore";

/** Formats one decoded field's value for display - arrays (e.g. a calibration matrix, or
 *  STATUSTEXT's fixed char[] text) are truncated rather than dumped in full, since some MAVLink
 *  array fields (BATTERY_STATUS's per-cell voltages, a param.pck-style payload) run long enough
 *  to make the row unreadable otherwise. `bigint` fields (the uint64_t timestamp fields) print
 *  via their own toString - `String(bigintValue)` would otherwise throw in some engines. */
function formatFieldValue(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    const shown = value.slice(0, 16).map((v) => (typeof v === "bigint" ? v.toString() : String(v)));
    return value.length > 16 ? `[${shown.join(", ")}, ... (${value.length})]` : `[${shown.join(", ")}]`;
  }
  if (typeof value === "number" && !Number.isInteger(value)) return value.toFixed(4);
  return String(value);
}

/** A live, generic view of every distinct MAVLink message type received from the vehicle so
 *  far - decoding is already fully generic before this component ever sees a packet (see
 *  ArduPilotSetupView.tsx's onData loop and the mavlinkInspectorStore it feeds), so this needs
 *  no per-message-type code: the field list for whichever message is selected comes straight
 *  from MAVLINK_REGISTRY[msgId].FIELDS, the same metadata the codec itself decodes/encodes with.
 *
 *  Reads `entries` directly from the store (rather than taking it as a prop from
 *  ArduPilotSetupView) so a re-render on every single incoming packet - the store updates on
 *  every one, not just ones relevant to whichever section is actually active - only costs this
 *  component, which is already unmounted whenever a different section is showing, instead of
 *  ArduPilotSetupView's entire tree (including whatever IS currently showing). */
export function MavlinkInspectorSection() {
  const { t } = useTranslation();
  const entries = useMavlinkInspectorStore((s) => s.entries);
  const [filter, setFilter] = useState("");
  const [selectedMsgId, setSelectedMsgId] = useState<number | null>(null);

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return Object.values(entries)
      .filter((e) => e.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, filter]);

  const selected = selectedMsgId !== null ? entries[selectedMsgId] : undefined;
  const fields = selected ? (MAVLINK_REGISTRY[selected.msgId]?.FIELDS ?? []) : [];
  const selectedFieldValues = selected?.lastMessage as unknown as Record<string, unknown> | undefined;

  function selectRow(msgId: number) {
    setSelectedMsgId(msgId);
  }

  function handleRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, msgId: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectRow(msgId);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.mavlinkInspector.heading")}</h3>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("ardupilotSetup.mavlinkInspector.filterPlaceholder")}
          className="h-8 max-w-56 text-xs"
        />
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("ardupilotSetup.mavlinkInspector.empty")}</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="min-h-0 overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ardupilotSetup.mavlinkInspector.message")}</TableHead>
                  <TableHead>{t("ardupilotSetup.mavlinkInspector.id")}</TableHead>
                  <TableHead>{t("ardupilotSetup.mavlinkInspector.count")}</TableHead>
                  <TableHead>Hz</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((entry) => (
                  <TableRow
                    key={entry.msgId}
                    role="button"
                    tabIndex={0}
                    aria-selected={entry.msgId === selectedMsgId}
                    onClick={() => selectRow(entry.msgId)}
                    onKeyDown={(e) => handleRowKeyDown(e, entry.msgId)}
                    className={cn("cursor-pointer", entry.msgId === selectedMsgId && "bg-accent")}
                  >
                    <TableCell className="font-mono">{entry.name}</TableCell>
                    <TableCell className="font-mono">{entry.msgId}</TableCell>
                    <TableCell className="font-mono">{entry.count}</TableCell>
                    <TableCell className="font-mono">{entry.hz}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="min-h-0 overflow-y-auto rounded-lg border border-border">
            {selected && selectedFieldValues ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("ardupilotSetup.mavlinkInspector.field")}</TableHead>
                    <TableHead>{t("ardupilotSetup.mavlinkInspector.value")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field) => (
                    <TableRow key={field.name}>
                      <TableCell className="font-mono">{field.source}</TableCell>
                      <TableCell className="font-mono break-all whitespace-normal">
                        {formatFieldValue(selectedFieldValues[field.name])}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="p-3 text-xs text-muted-foreground">{t("ardupilotSetup.mavlinkInspector.selectMessage")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
