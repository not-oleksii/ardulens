import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { MavParamType, MavType } from "../../mavlink/registry/registry";
import { paramDocsPageUrl, vehicleFolderForMavType, type ParamDoc } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { useMavlinkParamDefaultsStore } from "../../stores/mavlinkParamDefaultsStore/mavlinkParamDefaultsStore";
import { useParamDocs } from "./useParamDocs";
import { useStagedParamChanges } from "./useStagedParamChanges";

interface ParameterTreeSectionProps {
  vehicleType: MavType;
  onLoadParameters: () => void;
  onSetParam: (name: string, value: number, type: MavParamType) => void;
}

interface ParamTreeNode {
  segment: string;
  /** The full param name from the root down to (and including) this node's own segment. */
  path: string;
  children: ParamTreeNode[];
  /** True when `path` is itself a real, loaded param name - a node can be both a folder (has
   *  children) and a param at once (e.g. a bare "FOO" param alongside "FOO_BAR"), so this is
   *  independent of whether `children` is empty. */
  isParam: boolean;
}

/** Groups the flat param list into a real multi-level tree by recursively splitting each name on
 *  every underscore (SERVO1_FUNCTION -> SERVO1 > FUNCTION, ATC_ACCEL_P_MAX -> ATC > ACCEL > P >
 *  MAX) - unlike ParametersPanel's own one-level "categoryPrefix" sidebar (which only splits on
 *  the FIRST underscore, so SERVO1/SERVO2/... end up as separate flat groups), this is a genuine
 *  drill-down hierarchy, matching what Mission Planner calls its "Full Parameter Tree" alongside
 *  its "Full Parameter List" - the same data, a second presentation. No digit-collapsing
 *  heuristic (e.g. folding SERVO1/SERVO2 under one shared "SERVO" node) is applied, since that
 *  isn't something ArduPilot's own naming convention encodes reliably enough to reproduce
 *  without guessing at Mission Planner's exact internal grouping rules. */
function buildParamTree(names: string[]): ParamTreeNode[] {
  interface Building {
    segment: string;
    path: string;
    children: Map<string, Building>;
    isParam: boolean;
  }
  const root: Building = { segment: "", path: "", children: new Map(), isParam: false };
  for (const name of names) {
    let node = root;
    let path = "";
    for (const segment of name.split("_")) {
      path = path ? `${path}_${segment}` : segment;
      let child = node.children.get(segment);
      if (!child) {
        child = { segment, path, children: new Map(), isParam: false };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.isParam = true;
  }
  function finalize(node: Building): ParamTreeNode {
    return {
      segment: node.segment,
      path: node.path,
      isParam: node.isParam,
      children: Array.from(node.children.values())
        .sort((a, b) => a.segment.localeCompare(b.segment))
        .map(finalize),
    };
  }
  return Array.from(root.children.values())
    .sort((a, b) => a.segment.localeCompare(b.segment))
    .map(finalize);
}

/** True if this node or any of its descendants matches the search query - lets the tree hide
 *  whole branches that have nothing matching, rather than only hiding individual leaves (which
 *  would leave empty, pointless folders visible while searching). */
function subtreeMatches(node: ParamTreeNode, query: string): boolean {
  if (!query) return true;
  if (node.path.toLowerCase().includes(query)) return true;
  return node.children.some((child) => subtreeMatches(child, query));
}

function TreeItem({
  node,
  query,
  expanded,
  onToggle,
  selectedPath,
  onSelect,
}: {
  node: ParamTreeNode;
  query: string;
  expanded: Set<string>;
  onToggle: (path: string, open: boolean) => void;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  if (!subtreeMatches(node, query)) return null;
  const visibleChildren = node.children.filter((child) => subtreeMatches(child, query));

  if (visibleChildren.length === 0) {
    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={cn(
          "w-full truncate rounded-md px-2 py-1 text-left font-mono text-xs",
          selectedPath === node.path ? "bg-primary text-primary-foreground" : "hover:bg-accent",
        )}
        title={node.path}
      >
        {node.segment}
      </button>
    );
  }

  const isOpen = expanded.has(node.path) || query.length > 0;
  return (
    <Collapsible open={isOpen} onOpenChange={(open) => onToggle(node.path, open)}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          onClick={() => node.isParam && onSelect(node.path)}
          className={cn(
            "flex w-full items-center gap-1 rounded-md px-1 py-1 text-left text-xs",
            selectedPath === node.path ? "bg-primary text-primary-foreground" : "hover:bg-accent",
          )}
        >
          {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          <span className="min-w-0 flex-1 truncate font-mono">{node.segment}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-3 flex flex-col gap-0.5 border-l border-border pl-2">
        {visibleChildren.map((child) => (
          <TreeItem key={child.path} node={child} query={query} expanded={expanded} onToggle={onToggle} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function optionsSummary(doc: ParamDoc | undefined): string {
  if (doc?.values) return Object.entries(doc.values).map(([code, label]) => `${code}: ${label}`).join(", ");
  if (doc?.range) return `${doc.range.min} - ${doc.range.max}`;
  return "-";
}

/** The same flat parameter store ParametersPanel uses, browsed as a real multi-level drill-down
 *  tree instead of a flat searchable table - Mission Planner's "Full Parameter Tree" alongside
 *  its "Full Parameter List". Edits stage into the SAME kind of pendingChanges queue and
 *  Save all/confirm-dialog flow as the List view's bulk editor (unified in Wave 2 of the UI/UX
 *  audit - this used to commit each edit immediately on blur/Enter, one of 3 different
 *  param-edit models the app had), so browsing to several params across the tree and editing
 *  each stages them all for one review before anything reaches the vehicle. */
export function ParameterTreeSection({ vehicleType, onLoadParameters, onSetParam }: ParameterTreeSectionProps) {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const expectedCount = useMavlinkParameterStore((s) => s.expectedCount);
  const defaults = useMavlinkParamDefaultsStore((s) => s.defaults);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string | null>(null);

  const vehicleFolder = vehicleFolderForMavType(vehicleType);
  // fetchParamDocs is internally cached, so this costs nothing extra once ParametersPanel (or
  // this section) has already fetched this vehicle family's docs once this session.
  const { docs } = useParamDocs(vehicleFolder);
  // Same shape/semantics as ParametersPanel's own pendingChanges - staged here (not sent) until
  // "Save all" is confirmed. trackUnsaved: true for the same reason as ParametersPanel's
  // identical guard - switching sidebar sections unmounts this component and would otherwise
  // silently discard pendingChanges.
  const {
    pendingChanges,
    pendingEntries,
    hasPendingChanges,
    confirmOpen,
    setConfirmOpen,
    stageChange,
    resetAll: handleResetAll,
    confirmSaveAll: handleConfirmSaveAll,
  } = useStagedParamChanges({ params, onSetParam, trackUnsaved: true });

  const names = useMemo(() => Object.keys(params).sort(), [params]);
  const tree = useMemo(() => buildParamTree(names), [names]);
  const receivedCount = names.length;
  const hasStarted = expectedCount !== null || receivedCount > 0;

  const selected = selectedPath ? params[selectedPath] : undefined;
  const selectedDoc = selectedPath ? docs?.[selectedPath] : undefined;
  const shownValue = selected ? (pendingChanges[selected.name] ?? selected.value) : undefined;
  const isModified = selected ? pendingChanges[selected.name] !== undefined : false;

  function toggle(path: string, open: boolean) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(path);
      else next.delete(path);
      return next;
    });
  }

  function select(path: string) {
    setSelectedPath(path);
    setEditingValue(null);
  }

  function commitEdit() {
    if (!selected || editingValue === null) return;
    const parsed = Number(editingValue);
    setEditingValue(null);
    if (!Number.isFinite(parsed)) return;
    stageChange(selected.name, parsed);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.parameterTree.heading")}</h3>
        {hasStarted && (
          <span className="font-mono text-xs text-muted-foreground">
            {t("ardupilotSetup.parameters.progress", { received: receivedCount, total: expectedCount ?? "?" })}
          </span>
        )}
        {!hasStarted && (
          <Button type="button" size="sm" onClick={onLoadParameters}>
            {t("ardupilotSetup.parameters.load")}
          </Button>
        )}
        {hasPendingChanges && (
          <>
            <Button type="button" size="sm" variant="ghost" onClick={handleResetAll}>
              {t("ardupilotSetup.parameters.reset")}
            </Button>
            <Button type="button" size="sm" onClick={() => setConfirmOpen(true)}>
              {t("ardupilotSetup.parameters.saveAll", { count: pendingEntries.length })}
            </Button>
          </>
        )}
      </div>

      {hasStarted && (
        <>
          <Input
            className="shrink-0"
            placeholder={t("ardupilotSetup.parameters.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex min-h-0 flex-1 gap-3">
            <div className="w-64 shrink-0 overflow-y-auto rounded-lg border border-border p-2">
              {tree.map((node) => (
                <TreeItem
                  key={node.path}
                  node={node}
                  query={search.trim().toLowerCase()}
                  expanded={expanded}
                  onToggle={toggle}
                  selectedPath={selectedPath}
                  onSelect={select}
                />
              ))}
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto rounded-lg border border-border p-4">
              {!selected ? (
                <p className="text-xs text-muted-foreground">{t("ardupilotSetup.parameterTree.selectParam")}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <h4 className="font-mono text-sm font-semibold">{selected.name}</h4>
                  {selectedDoc?.humanName && <p className="text-sm font-medium">{selectedDoc.humanName}</p>}
                  {selectedDoc?.documentation && <p className="text-sm text-muted-foreground">{selectedDoc.documentation}</p>}
                  {selectedDoc && (
                    <a
                      href={paramDocsPageUrl(vehicleFolder, selected.name)}
                      target="_blank"
                      rel="noreferrer"
                      className="w-fit text-xs text-primary underline-offset-4 hover:underline"
                    >
                      {t("graphs.params.readMore")}
                    </a>
                  )}

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <dt className="text-muted-foreground">{t("ardupilotSetup.parameters.value")}</dt>
                    <dd className="font-mono">
                      {editingValue !== null ? (
                        <Input
                          autoFocus
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") setEditingValue(null);
                          }}
                          className="h-7 w-32"
                        />
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <button type="button" className="hover:underline" onClick={() => setEditingValue(String(shownValue))}>
                            {shownValue}
                          </button>
                          {isModified && (
                            <span className="text-xs text-primary">{t("ardupilotSetup.parameters.modified")}</span>
                          )}
                        </span>
                      )}
                    </dd>
                    <dt className="text-muted-foreground">{t("ardupilotSetup.parameters.default")}</dt>
                    <dd className="font-mono">{defaults && selected.name in defaults ? defaults[selected.name] : "-"}</dd>
                    <dt className="text-muted-foreground">{t("ardupilotSetup.parameters.units")}</dt>
                    <dd className="font-mono">{selectedDoc?.units ?? "-"}</dd>
                    <dt className="text-muted-foreground">{t("ardupilotSetup.parameters.options")}</dt>
                    <dd className="font-mono">{optionsSummary(selectedDoc)}</dd>
                  </dl>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.parameters.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("ardupilotSetup.parameters.confirmDescription", { count: pendingEntries.length })}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ardupilotSetup.parameters.name")}</TableHead>
                  <TableHead>{t("ardupilotSetup.parameters.from")}</TableHead>
                  <TableHead>{t("ardupilotSetup.parameters.to")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingEntries.map(([name, value]) => (
                  <TableRow key={name}>
                    <TableCell className="font-mono">{name}</TableCell>
                    <TableCell className="font-mono">{params[name]?.value}</TableCell>
                    <TableCell className="font-mono">{value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("ardupilotSetup.parameters.cancel")}
            </Button>
            <Button type="button" onClick={handleConfirmSaveAll}>
              {t("ardupilotSetup.parameters.confirmSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
